import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";

export type Granularidade = "DIA" | "SEMANA" | "MES" | "ANO";

export type SubPeriodo = { inicio: Date; fim: Date };

export type LancamentoParaFluxo = { data: Date; valor: number; tipo: "ENTRADA" | "SAIDA" };

export type PeriodoFluxoDeCaixa = SubPeriodo & {
  saldoInicial: number;
  entradas: number;
  saidas: number;
  geracaoLiquida: number;
  saldoFinal: number;
};

function fimDoDiaUTC(ano: number, mes: number, dia: number): Date {
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
 * sub-período.
 */
export function calcularPeriodosFluxoDeCaixa(
  periodos: SubPeriodo[],
  lancamentos: LancamentoParaFluxo[],
  saldoInicialAbsoluto: number,
): PeriodoFluxoDeCaixa[] {
  let saldoCorrente = saldoInicialAbsoluto;

  return periodos.map(({ inicio, fim }) => {
    const doPeriodo = lancamentos.filter((l) => l.data >= inicio && l.data <= fim);
    const entradas = doPeriodo.filter((l) => l.tipo === "ENTRADA").reduce((soma, l) => soma + l.valor, 0);
    const saidas = doPeriodo.filter((l) => l.tipo === "SAIDA").reduce((soma, l) => soma + l.valor, 0);
    const geracaoLiquida = entradas - saidas;
    const saldoInicial = saldoCorrente;
    const saldoFinal = saldoInicial + geracaoLiquida;
    saldoCorrente = saldoFinal;

    return { inicio, fim, saldoInicial, entradas, saidas, geracaoLiquida, saldoFinal };
  });
}

export async function buscarSaldoEmCaixaAte(filialId: string, data: Date): Promise<number> {
  const contas = await prisma.contaBancaria.findMany({ where: { filialId, ativo: true } });
  const saldoInicialTotal = contas.reduce((soma, conta) => soma + Number(conta.saldoInicial), 0);

  const somas = await prisma.lancamentoBancario.groupBy({
    by: ["tipo"],
    where: { filialId, conciliado: true, data: { lte: data } },
    _sum: { valor: true },
  });

  const entradas = Number(somas.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
  const saidas = Number(somas.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);

  return saldoInicialTotal + entradas - saidas;
}

export async function listarFluxoDeCaixaRealizado(
  sessao: SessaoAtiva,
  granularidade: Granularidade,
  dataReferencia: Date,
): Promise<PeriodoFluxoDeCaixa[]> {
  requirePermission(sessao.perfil, "lancamento:ler");

  const periodos = calcularJanela(granularidade, dataReferencia);
  const inicioDaJanela = periodos[0].inicio;
  const fimDaJanela = periodos[periodos.length - 1].fim;

  const [saldoInicialAbsoluto, lancamentos] = await Promise.all([
    buscarSaldoEmCaixaAte(sessao.filialId, new Date(inicioDaJanela.getTime() - 1)),
    prisma.lancamentoBancario.findMany({
      where: {
        filialId: sessao.filialId,
        conciliado: true,
        data: { gte: inicioDaJanela, lte: fimDaJanela },
      },
    }),
  ]);

  return calcularPeriodosFluxoDeCaixa(
    periodos,
    lancamentos.map((l) => ({ data: l.data, valor: Number(l.valor), tipo: l.tipo })),
    saldoInicialAbsoluto,
  );
}
