import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { whereLancamentoPorClassificacao, type FiltroClassificacao } from "./classificacaoFiscal";
import type { OrigemLancamento, Prisma } from "@prisma/client";

/** Transferência entre contas não é entrada nem saída: só move saldo entre contas da filial. */
export function ehTransferencia(origem: OrigemLancamento | string): boolean {
  return origem === "TRANSFERENCIA";
}

/** `where` do Prisma para somas de entradas e saídas: deixa as transferências de fora (o saldo continua com elas). */
export const SEM_TRANSFERENCIA = { origem: { not: "TRANSFERENCIA" } } satisfies Prisma.LancamentoBancarioWhereInput;

export type Granularidade = "DIA" | "SEMANA" | "MES" | "ANO";

export type SubPeriodo = { inicio: Date; fim: Date };

/** `transferencia`: perna de transferência entre contas (origem TRANSFERENCIA). Não é entrada nem saída, só move o saldo. */
export type LancamentoParaFluxo = { data: Date; valor: number; tipo: "ENTRADA" | "SAIDA"; transferencia: boolean };

export type PeriodoFluxoDeCaixa = SubPeriodo & {
  saldoInicial: number;
  entradas: number;
  saidas: number;
  /** Líquido das transferências entre contas no período: quase sempre 0; ≠ 0 quando só uma perna está conciliada. */
  transferencias: number;
  geracaoLiquida: number;
  saldoFinal: number;
};

export function fimDoDiaUTC(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes, dia, 23, 59, 59, 999));
}

/**
 * Recorta a janela natural de cada granularidade em sub-períodos —
 * ver "Granularidades e janela exibida" na spec. Datas sempre em UTC
 * (meia-noite pro início, 23:59:59.999 pro fim), mesmo padrão de
 * `ofxParser.ts`, pra evitar deslocamento por fuso horário.
 */
export function calcularJanela(granularidade: Granularidade, dataReferencia: Date): SubPeriodo[] {
  const ano = dataReferencia.getUTCFullYear();
  const mes = dataReferencia.getUTCMonth();

  if (granularidade === "DIA") {
    const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    return Array.from({ length: diasNoMes }, (_, i) => ({
      inicio: new Date(Date.UTC(ano, mes, i + 1)),
      fim: fimDoDiaUTC(ano, mes, i + 1),
    }));
  }

  if (granularidade === "SEMANA") {
    const primeiroDiaMes = new Date(Date.UTC(ano, mes, 1));
    const ultimoDiaMes = new Date(Date.UTC(ano, mes + 1, 0));
    const diaDaSemana = primeiroDiaMes.getUTCDay(); // 0=domingo .. 6=sábado
    const deslocamentoSegunda = diaDaSemana === 0 ? 6 : diaDaSemana - 1;

    const inicioPrimeiraSemana = new Date(primeiroDiaMes);
    inicioPrimeiraSemana.setUTCDate(inicioPrimeiraSemana.getUTCDate() - deslocamentoSegunda);

    const periodos: SubPeriodo[] = [];
    let cursor = inicioPrimeiraSemana;
    while (cursor <= ultimoDiaMes) {
      const fimSemana = new Date(cursor);
      fimSemana.setUTCDate(fimSemana.getUTCDate() + 6);
      fimSemana.setUTCHours(23, 59, 59, 999);
      periodos.push({ inicio: new Date(cursor), fim: fimSemana });

      const proximoInicio = new Date(cursor);
      proximoInicio.setUTCDate(proximoInicio.getUTCDate() + 7);
      cursor = proximoInicio;
    }
    return periodos;
  }

  if (granularidade === "MES") {
    return Array.from({ length: 12 }, (_, i) => ({
      inicio: new Date(Date.UTC(ano, i, 1)),
      fim: fimDoDiaUTC(ano, i + 1, 0),
    }));
  }

  // ANO — últimos 5 anos civis até o ano de referência
  return Array.from({ length: 5 }, (_, i) => {
    const anoPeriodo = ano - 4 + i;
    return {
      inicio: new Date(Date.UTC(anoPeriodo, 0, 1)),
      fim: fimDoDiaUTC(anoPeriodo, 11, 31),
    };
  });
}

/**
 * Agrega os lançamentos (já filtrados pra `conciliado: true` e escopados
 * por filial pelo chamador) em cada sub-período, encadeando o saldo final
 * de um como saldo inicial do próximo — nunca recalcula do zero a cada
 * sub-período. Entradas e saídas não incluem transferências entre contas;
 * saldo final = inicial + geração líquida + transferências.
 */
export function calcularPeriodosFluxoDeCaixa(
  periodos: SubPeriodo[],
  lancamentos: LancamentoParaFluxo[],
  saldoInicialAbsoluto: number,
): PeriodoFluxoDeCaixa[] {
  let saldoCorrente = saldoInicialAbsoluto;

  return periodos.map(({ inicio, fim }) => {
    const doPeriodo = lancamentos.filter((l) => l.data >= inicio && l.data <= fim);
    const somar = (lista: LancamentoParaFluxo[], tipo: "ENTRADA" | "SAIDA") =>
      lista.filter((l) => l.tipo === tipo).reduce((soma, l) => soma + l.valor, 0);
    const movimento = doPeriodo.filter((l) => !l.transferencia);
    const pernas = doPeriodo.filter((l) => l.transferencia);
    const entradas = somar(movimento, "ENTRADA");
    const saidas = somar(movimento, "SAIDA");
    const transferencias = somar(pernas, "ENTRADA") - somar(pernas, "SAIDA");
    const geracaoLiquida = entradas - saidas;
    const saldoInicial = saldoCorrente;
    const saldoFinal = saldoInicial + geracaoLiquida + transferencias;
    saldoCorrente = saldoFinal;

    return { inicio, fim, saldoInicial, entradas, saidas, transferencias, geracaoLiquida, saldoFinal };
  });
}

export async function buscarSaldoEmCaixaAte(filialId: string, data: Date): Promise<number> {
  return buscarSaldoEmCaixaAteDasFiliais([filialId], data);
}

/** Saldo somado de várias filiais (consolidação por empresa) em 2 queries, sem loop por filial. */
export async function buscarSaldoEmCaixaAteDasFiliais(filialIds: string[], data: Date): Promise<number> {
  const filtroFilial = { filialId: { in: filialIds } };

  // "-1ms antes do início da janela" (ver chamador) só é exato porque
  // `LancamentoBancario.data` é TIMESTAMP(3) — uma migração futura pra
  // precisão maior exigiria revisitar essa conta.
  const [saldosIniciais, somas] = await Promise.all([
    prisma.contaBancaria.aggregate({ where: { ...filtroFilial, ativo: true }, _sum: { saldoInicial: true } }),
    prisma.lancamentoBancario.groupBy({
      by: ["tipo"],
      where: { ...filtroFilial, conciliado: true, data: { lte: data }, contaBancaria: { ativo: true } },
      _sum: { valor: true },
    }),
  ]);
  const saldoInicialTotal = Number(saldosIniciais._sum.saldoInicial ?? 0);

  const entradas = Number(somas.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
  const saidas = Number(somas.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);

  return saldoInicialTotal + entradas - saidas;
}

/** Entradas e saídas lançadas que o extrato ainda não confirmou (`conciliado: false`). */
export type AguardandoConciliacao = { entradas: number; saidas: number };

/**
 * O que foi lançado e ainda aguarda conciliação, nas contas ativas das filiais. Sem corte de data, como o saldo
 * contábil da Tesouraria: saldo conciliado + isto = saldo contábil. Usado pelas projeções (o realizado continua só
 * com conciliados).
 */
export async function buscarAguardandoConciliacaoDasFiliais(filialIds: string[]): Promise<AguardandoConciliacao> {
  const somas = await prisma.lancamentoBancario.groupBy({
    by: ["tipo"],
    where: { filialId: { in: filialIds }, conciliado: false, contaBancaria: { ativo: true } },
    _sum: { valor: true },
  });
  return {
    entradas: Number(somas.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0),
    saidas: Number(somas.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0),
  };
}

export async function buscarAguardandoConciliacao(filialId: string): Promise<AguardandoConciliacao> {
  return buscarAguardandoConciliacaoDasFiliais([filialId]);
}

/** Saldo contábil: o conciliado mais o que aguarda conciliação. */
export function saldoComAguardando(saldoConciliado: number, aguardando: AguardandoConciliacao): number {
  return saldoConciliado + aguardando.entradas - aguardando.saidas;
}

/**
 * Com `opcoes.classificacao`, só o movimento daquela classificação entra e o
 * saldo inicial é 0: o saldo bancário é único e não se divide entre fiscal e
 * gerencial, então a visão filtrada mostra o *acumulado* do período (e as
 * transferências, sem classificação, ficam de fora).
 */
export async function listarFluxoDeCaixaRealizado(
  sessao: SessaoAtiva,
  granularidade: Granularidade,
  dataReferencia: Date,
  opcoes: { classificacao?: FiltroClassificacao } = {},
): Promise<PeriodoFluxoDeCaixa[]> {
  requirePermission(sessao.perfil, "lancamento:ler");

  const periodos = calcularJanela(granularidade, dataReferencia);
  const inicioDaJanela = periodos[0].inicio;
  const fimDaJanela = periodos[periodos.length - 1].fim;

  const [saldoInicialAbsoluto, lancamentos] = await Promise.all([
    opcoes.classificacao
      ? Promise.resolve(0)
      : buscarSaldoEmCaixaAte(sessao.filialId, new Date(inicioDaJanela.getTime() - 1)),
    prisma.lancamentoBancario.findMany({
      where: {
        filialId: sessao.filialId,
        conciliado: true,
        data: { gte: inicioDaJanela, lte: fimDaJanela },
        contaBancaria: { ativo: true },
        ...whereLancamentoPorClassificacao(opcoes.classificacao),
      },
    }),
  ]);

  return calcularPeriodosFluxoDeCaixa(
    periodos,
    lancamentos.map((l) => ({ data: l.data, valor: Number(l.valor), tipo: l.tipo, transferencia: ehTransferencia(l.origem) })),
    saldoInicialAbsoluto,
  );
}
