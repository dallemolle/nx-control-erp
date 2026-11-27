import type { ClassificacaoFiscal, StatusLinhaExtrato, TipoComprovante, TipoLancamento } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { diferencaDoGrupo } from "@/lib/conciliacaoGrupo";
import { formatarMoeda } from "@/lib/formatacao";
import { garantirComprovanteValido } from "@/server/services/classificacaoFiscal";
import {
  validarReferenciasDoLancamento,
  type ReferenciasDoLancamento,
} from "@/server/services/referenciasDoLancamento";
import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { parseOfx } from "./ofxParser";

export type LinhaParaClassificar = {
  data: Date;
  valor: number;
  tipo: TipoLancamento;
};

export type CandidatoParaClassificar = {
  id: string;
  data: Date;
  valor: number;
  conciliado: boolean;
};

export const JANELA_TOLERANCIA_DIAS = 3;
export const JANELA_BUSCA_DIAS = 30;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

function dentroDaJanela(dataCandidato: Date, dataLinha: Date, dias: number): boolean {
  return Math.abs(dataCandidato.getTime() - dataLinha.getTime()) <= dias * UM_DIA_MS;
}

/** Dias entre duas datas, comparando só o dia (UTC): a linha do OFX vem com hora, o lançamento não. */
function diasEntre(a: Date, b: Date): number {
  const dia = (d: Date) => Date.parse(d.toISOString().slice(0, 10));
  return Math.round(Math.abs(dia(a) - dia(b)) / UM_DIA_MS);
}

function janelaDeBusca(data: Date): { gte: Date; lte: Date } {
  return {
    gte: new Date(data.getTime() - JANELA_BUSCA_DIAS * UM_DIA_MS),
    lte: new Date(data.getTime() + JANELA_BUSCA_DIAS * UM_DIA_MS),
  };
}

/**
 * Classificação determinística, sem I/O — os `candidatos` já vêm
 * filtrados pelo chamador (mesma contaBancariaId + mesmo tipo, dentro
 * de JANELA_BUSCA_DIAS). Nenhum candidato aqui é persistido — só o
 * resultado de CONCILIADO carrega um id pra vincular de fato.
 */
export function classificarLinhaExtrato(
  linha: LinhaParaClassificar,
  candidatos: CandidatoParaClassificar[],
): { status: StatusLinhaExtrato; lancamentoAutoVinculadoId: string | null } {
  const exatos = candidatos.filter(
    (c) => !c.conciliado && c.valor === linha.valor && dentroDaJanela(c.data, linha.data, JANELA_TOLERANCIA_DIAS),
  );
  if (exatos.length === 1) {
    return { status: "CONCILIADO", lancamentoAutoVinculadoId: exatos[0].id };
  }
  if (exatos.length > 1) {
    return { status: "SUGESTAO", lancamentoAutoVinculadoId: null };
  }

  const jaConciliados = candidatos.filter(
    (c) => c.conciliado && c.valor === linha.valor && dentroDaJanela(c.data, linha.data, JANELA_TOLERANCIA_DIAS),
  );
  if (jaConciliados.length > 0) {
    return { status: "DUPLICADO", lancamentoAutoVinculadoId: null };
  }

  const divergenciaValor = candidatos.filter(
    (c) => !c.conciliado && dentroDaJanela(c.data, linha.data, JANELA_TOLERANCIA_DIAS) && c.valor !== linha.valor,
  );
  if (divergenciaValor.length === 1) {
    return { status: "DIVERGENCIA_VALOR", lancamentoAutoVinculadoId: null };
  }

  const divergenciaData = candidatos.filter(
    (c) => !c.conciliado && c.valor === linha.valor && !dentroDaJanela(c.data, linha.data, JANELA_TOLERANCIA_DIAS),
  );
  if (divergenciaData.length === 1) {
    return { status: "DIVERGENCIA_DATA", lancamentoAutoVinculadoId: null };
  }

  return { status: "NAO_CONCILIADO", lancamentoAutoVinculadoId: null };
}

/** Guarda de tamanho do arquivo OFX — mesmo espírito de TAMANHO_MAXIMO_CSV em importacaoTitulo.ts. */
const TAMANHO_MAXIMO_OFX_BYTES = 2 * 1024 * 1024;

export async function importarExtratoOfx(sessao: SessaoAtiva, contaBancariaId: string, arquivo: File) {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  if (arquivo.size > TAMANHO_MAXIMO_OFX_BYTES) {
    throw new Error(`Arquivo maior que o limite de ${TAMANHO_MAXIMO_OFX_BYTES / (1024 * 1024)} MB`);
  }

  // A FK só prova que a conta existe em alguma filial — sem este escopo um
  // extrato poderia ser importado contra a conta bancária de outro tenant.
  const conta = await prisma.contaBancaria.findFirst({
    where: { id: contaBancariaId, filialId: sessao.filialId },
  });
  if (!conta) {
    throw new Error("Conta bancária não pertence à filial ativa");
  }
  if (conta.tipo === "CAIXA") {
    throw new Error("Conta Caixa não recebe extrato: os lançamentos dela já entram conciliados");
  }

  const conteudo = await arquivo.text();
  const transacoes = parseOfx(conteudo);

  const extrato = await prisma.extratoImportado.create({
    data: {
      filialId: sessao.filialId,
      contaBancariaId,
      nomeArquivo: arquivo.name,
      totalLinhas: transacoes.length,
      linhasNovas: 0,
      linhasIgnoradas: 0,
      usuarioId: sessao.usuarioId,
    },
  });

  const resultado = await prisma.linhaExtrato.createMany({
    data: transacoes.map((t) => ({
      extratoImportadoId: extrato.id,
      contaBancariaId,
      data: t.data,
      valor: t.valor,
      tipo: t.tipo,
      historico: t.historico,
      identificadorBancario: t.identificadorBancario,
    })),
    skipDuplicates: true,
  });

  const linhasNovas = resultado.count;
  const linhasIgnoradas = transacoes.length - linhasNovas;

  const extratoAtualizado = await prisma.extratoImportado.update({
    where: { id: extrato.id },
    data: { linhasNovas, linhasIgnoradas },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "ExtratoImportado",
    entidadeId: extrato.id,
    acao: "IMPORTAR",
    anterior: null,
    novo: {
      contaBancariaId,
      nomeArquivo: arquivo.name,
      totalLinhas: transacoes.length,
      linhasNovas,
      linhasIgnoradas,
    },
  });

  return extratoAtualizado;
}

async function buscarCandidatosLancamento(contaBancariaId: string, tipo: TipoLancamento, data: Date) {
  return prisma.lancamentoBancario.findMany({
    where: { contaBancariaId, tipo, data: janelaDeBusca(data) },
    orderBy: { data: "desc" },
  });
}

class ItemJaConciliadoError extends Error {
  constructor() {
    super("Algum item foi conciliado, alterado ou excluído por outra pessoa; recarregue a tela");
  }
}

/** A soma relida dentro da transação não fecha: algum lançamento foi editado no meio do caminho. */
class SomaDoGrupoMudouError extends Error {
  constructor() {
    super("Algum lançamento mudou enquanto você conciliava. Confira os valores e tente de novo.");
  }
}

/**
 * Único ponto que grava vínculo de conciliação. Cria o grupo e prende linhas e
 * lançamentos a ele só se ainda estiverem soltos (`grupoConciliacaoId: null`);
 * se outra transação chegou antes, a contagem não bate e tudo é desfeito.
 * Quem chama já conferiu filial e conta; a soma é conferida aqui, com o que está gravado.
 */
async function vincularEmGrupo(
  tx: Prisma.TransactionClient,
  dados: { filialId: string; contaBancariaId: string; usuarioId: string; linhaIds: string[]; lancamentoIds: string[] },
): Promise<string> {
  const grupo = await tx.grupoConciliacao.create({
    data: { filialId: dados.filialId, contaBancariaId: dados.contaBancariaId, usuarioId: dados.usuarioId },
  });
  const linhas = await tx.linhaExtrato.updateMany({
    where: { id: { in: dados.linhaIds }, contaBancariaId: dados.contaBancariaId, grupoConciliacaoId: null },
    data: { grupoConciliacaoId: grupo.id, status: "CONCILIADO" },
  });
  const lancamentos = await tx.lancamentoBancario.updateMany({
    where: {
      id: { in: dados.lancamentoIds },
      contaBancariaId: dados.contaBancariaId,
      grupoConciliacaoId: null,
      conciliado: false,
    },
    data: { grupoConciliacaoId: grupo.id, conciliado: true },
  });
  if (linhas.count !== dados.linhaIds.length || lancamentos.count !== dados.lancamentoIds.length) {
    throw new ItemJaConciliadoError();
  }
  // Lançamentos podem ser editados na Tesouraria. Com linhas e lançamentos já presos (e travados) pelo vínculo,
  // confere de novo a soma com o que está gravado; se algo mudou desde a leitura, o erro desfaz tudo.
  const linhasAtuais = await tx.linhaExtrato.findMany({ where: { id: { in: dados.linhaIds } } });
  const lancamentosAtuais = await tx.lancamentoBancario.findMany({ where: { id: { in: dados.lancamentoIds } } });
  const diferenca = diferencaDoGrupo(
    linhasAtuais.map((l) => ({ valor: Number(l.valor), tipo: l.tipo })),
    lancamentosAtuais.map((l) => ({ valor: Number(l.valor), tipo: l.tipo })),
  );
  if (diferenca !== 0) throw new SomaDoGrupoMudouError();
  return grupo.id;
}

type LinhaParaReconciliar = {
  id: string;
  contaBancariaId: string;
  tipo: TipoLancamento;
  data: Date;
  valor: Prisma.Decimal;
  status: StatusLinhaExtrato;
};

/**
 * Corpo compartilhado por `conciliarAutomaticamente` (rodada única, na
 * importação) e `reconciliarPendentes` (botão "tentar de novo" — cobre
 * linhas que ficaram pendentes porque o lançamento correspondente só foi
 * criado ou corrigido depois, ou porque `desconciliar` resetou o status).
 * O status de uma linha solta é só um rótulo recalculado aqui; só é gravado quando muda.
 */
async function processarLinhasPendentes(sessao: SessaoAtiva, linhas: LinhaParaReconciliar[]) {
  let conciliadasAutomaticamente = 0;
  let reclassificadas = 0;

  for (const linha of linhas) {
    const candidatos = await buscarCandidatosLancamento(linha.contaBancariaId, linha.tipo, linha.data);

    const resultado = classificarLinhaExtrato(
      { data: linha.data, valor: Number(linha.valor), tipo: linha.tipo },
      candidatos.map((c) => ({ id: c.id, data: c.data, valor: Number(c.valor), conciliado: c.conciliado })),
    );

    if (resultado.status === "CONCILIADO" && resultado.lancamentoAutoVinculadoId) {
      const lancamentoId = resultado.lancamentoAutoVinculadoId;
      let grupoConciliacaoId: string;
      try {
        grupoConciliacaoId = await prisma.$transaction((tx) =>
          vincularEmGrupo(tx, {
            filialId: sessao.filialId,
            contaBancariaId: linha.contaBancariaId,
            usuarioId: sessao.usuarioId,
            linhaIds: [linha.id],
            lancamentoIds: [lancamentoId],
          }),
        );
      } catch (erro) {
        // Outra pessoa conciliou a linha ou o lançamento, ou editou o lançamento, no meio da rodada: segue.
        if (erro instanceof ItemJaConciliadoError || erro instanceof SomaDoGrupoMudouError) continue;
        throw erro;
      }

      await registrarAuditoria({
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Conciliacao",
        entidadeId: linha.id,
        acao: "CONCILIAR_AUTOMATICO",
        anterior: { status: linha.status },
        novo: { status: "CONCILIADO", lancamentoBancarioId: lancamentoId, grupoConciliacaoId },
      });
      conciliadasAutomaticamente += 1;
    } else if (resultado.status !== linha.status) {
      // Só se continuar solta: se outra pessoa conciliou a linha no meio da rodada, não sobrescreve o CONCILIADO.
      const atualizada = await prisma.linhaExtrato.updateMany({
        where: { id: linha.id, grupoConciliacaoId: null },
        data: { status: resultado.status },
      });
      reclassificadas += atualizada.count;
    }
  }

  return { totalProcessadas: linhas.length, conciliadasAutomaticamente, reclassificadas };
}

export async function conciliarAutomaticamente(sessao: SessaoAtiva, extratoImportadoId: string) {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const extrato = await prisma.extratoImportado.findFirst({
    where: { id: extratoImportadoId, filialId: sessao.filialId },
  });
  if (!extrato) {
    throw new Error("Extrato não pertence à filial ativa");
  }

  const linhas = await prisma.linhaExtrato.findMany({
    where: { extratoImportadoId, status: "NAO_CONCILIADO" },
  });

  return processarLinhasPendentes(sessao, linhas);
}

/**
 * Reprocessa todas as linhas ainda não conciliadas da filial ativa (Não
 * conciliado, Sugestão, Divergência e Duplicado), independente de qual
 * extrato as trouxe — cobre o caso de uma linha ter ficado presa porque o
 * lançamento correspondente só foi criado ou corrigido depois da importação,
 * ou de o rótulo ter ficado velho (o candidato foi excluído). Esses status
 * não guardam escolha da pessoa: são recalculados com a mesma regra da importação.
 * Acionado pelo botão "Reconciliar pendentes" na tela.
 */
export async function reconciliarPendentes(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linhas = await prisma.linhaExtrato.findMany({
    where: {
      status: { not: "CONCILIADO" },
      grupoConciliacaoId: null,
      contaBancaria: { filialId: sessao.filialId },
    },
  });

  return processarLinhasPendentes(sessao, linhas);
}

export async function listarLinhasExtrato(
  filialId: string,
  contaBancariaId?: string,
  status?: StatusLinhaExtrato,
) {
  return prisma.linhaExtrato.findMany({
    where: {
      contaBancaria: { filialId },
      ...(contaBancariaId ? { contaBancariaId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      contaBancaria: { include: { banco: true } },
      grupoConciliacao: {
        include: {
          lancamentos: { select: { id: true, descricao: true }, orderBy: { data: "asc" } },
          _count: { select: { linhas: true } },
        },
      },
    },
    orderBy: { data: "desc" },
  });
}

export async function buscarCandidatosDaLinha(sessao: SessaoAtiva, linhaExtratoId: string) {
  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  const candidatos = await buscarCandidatosLancamento(linha.contaBancariaId, linha.tipo, linha.data);
  // O Confirmar (1:1) só aceita valor igual; os outros servem para o aviso da tela.
  return candidatos.map((c) => {
    const diasDeDiferenca = diasEntre(c.data, linha.data);
    return {
      ...c,
      valorIgual: c.valor.equals(linha.valor),
      diasDeDiferenca,
      dentroDaTolerancia: diasDeDiferenca <= JANELA_TOLERANCIA_DIAS,
    };
  });
}

export async function confirmarConciliacaoManual(
  sessao: SessaoAtiva,
  linhaExtratoId: string,
  lancamentoBancarioId: string,
): Promise<void> {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  if (linha.grupoConciliacaoId) {
    throw new Error("Esta linha já está conciliada");
  }

  const lancamento = await prisma.lancamentoBancario.findFirst({
    where: { id: lancamentoBancarioId, contaBancariaId: linha.contaBancariaId, conciliado: false },
  });
  if (!lancamento) {
    throw new Error("Lançamento não encontrado, de outra conta bancária, ou já conciliado");
  }
  const sentido = (tipo: TipoLancamento) => (tipo === "ENTRADA" ? "uma entrada" : "uma saída");
  if (lancamento.tipo !== linha.tipo) {
    throw new Error(`O lançamento é ${sentido(lancamento.tipo)} e a linha do extrato é ${sentido(linha.tipo)}.`);
  }
  if (!lancamento.valor.equals(linha.valor)) {
    const caminho =
      lancamento.origem === "BAIXA"
        ? "Se a baixa foi registrada com o valor errado, estorne a baixa em Contas a pagar ou a receber e " +
          "registre de novo; se a diferença é real, use Conciliar em grupo com “Lançar a diferença”."
        : "Se foi digitado errado, corrija na Tesouraria; " +
          "se a diferença é real, use Conciliar em grupo com “Lançar a diferença”.";
    throw new Error(
      `O lançamento tem valor diferente da linha (${formatarMoeda(lancamento.valor)} no lançamento, ` +
        `${formatarMoeda(linha.valor)} no extrato). ${caminho}`,
    );
  }

  const grupoConciliacaoId = await prisma.$transaction((tx) =>
    vincularEmGrupo(tx, {
      filialId: sessao.filialId,
      contaBancariaId: linha.contaBancariaId,
      usuarioId: sessao.usuarioId,
      linhaIds: [linhaExtratoId],
      lancamentoIds: [lancamentoBancarioId],
    }),
  );

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Conciliacao",
    entidadeId: linhaExtratoId,
    acao: "CONCILIAR",
    anterior: { status: linha.status },
    novo: { status: "CONCILIADO", lancamentoBancarioId, grupoConciliacaoId },
  });
}

export async function desconciliar(sessao: SessaoAtiva, linhaExtratoId: string): Promise<void> {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
    include: {
      grupoConciliacao: {
        include: { linhas: { select: { id: true } }, lancamentos: { select: { id: true } } },
      },
    },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  const grupo = linha.grupoConciliacao;
  if (!grupo) {
    throw new Error("Esta linha não está conciliada");
  }

  // Desfaz o grupo inteiro: conciliação parcial não existe.
  await prisma.$transaction([
    prisma.linhaExtrato.updateMany({
      where: { grupoConciliacaoId: grupo.id },
      data: { status: "NAO_CONCILIADO", grupoConciliacaoId: null },
    }),
    prisma.lancamentoBancario.updateMany({
      where: { grupoConciliacaoId: grupo.id },
      data: { conciliado: false, grupoConciliacaoId: null },
    }),
    prisma.grupoConciliacao.deleteMany({ where: { id: grupo.id } }),
  ]);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Conciliacao",
    entidadeId: linhaExtratoId,
    acao: "DESCONCILIAR",
    anterior: {
      status: "CONCILIADO",
      grupoConciliacaoId: grupo.id,
      linhaIds: grupo.linhas.map((l) => l.id),
      lancamentoIds: grupo.lancamentos.map((l) => l.id),
    },
    novo: { status: "NAO_CONCILIADO" },
  });
}

/** Dados de um lançamento avulso criado na conciliação (a partir da linha ou da diferença do grupo). */
export type DadosLancamentoAvulso = ReferenciasDoLancamento & {
  descricao: string;
  /** Omitida = FISCAL (tarifas, IOF e rendimentos são documentos bancários). */
  classificacaoFiscal?: ClassificacaoFiscal;
  tipoComprovante?: TipoComprovante | null;
};

/** Valida categoria, dimensões e comprovante e devolve os campos prontos para o `create`. */
async function prepararLancamentoAvulso(filialId: string, dados: DadosLancamentoAvulso) {
  await validarReferenciasDoLancamento(filialId, {
    categoriaFinanceiraId: dados.categoriaFinanceiraId,
    centroCustoId: dados.centroCustoId,
    centroLucroId: dados.centroLucroId,
    safraId: dados.safraId,
    projetoId: dados.projetoId,
  });
  const classificacaoFiscal = dados.classificacaoFiscal ?? "FISCAL";
  const tipoComprovante = dados.tipoComprovante ?? null;
  garantirComprovanteValido({ classificacaoFiscal, tipoComprovante });
  return {
    descricao: dados.descricao,
    categoriaFinanceiraId: dados.categoriaFinanceiraId,
    centroCustoId: dados.centroCustoId,
    centroLucroId: dados.centroLucroId,
    safraId: dados.safraId,
    projetoId: dados.projetoId,
    classificacaoFiscal,
    tipoComprovante,
  };
}

export async function criarLancamentoDaLinha(
  sessao: SessaoAtiva,
  linhaExtratoId: string,
  dados: DadosLancamentoAvulso,
) {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requirePermission(sessao.perfil, "lancamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  if (linha.grupoConciliacaoId) {
    throw new Error("Esta linha já está conciliada");
  }

  const campos = await prepararLancamentoAvulso(sessao.filialId, dados);

  const lancamento = await prisma.$transaction(async (tx) => {
    const criado = await tx.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: linha.contaBancariaId,
        data: linha.data,
        tipo: linha.tipo,
        valor: linha.valor,
        origem: "MANUAL",
        ...campos,
        usuarioId: sessao.usuarioId,
        conciliado: false,
      },
    });

    await vincularEmGrupo(tx, {
      filialId: sessao.filialId,
      contaBancariaId: linha.contaBancariaId,
      usuarioId: sessao.usuarioId,
      linhaIds: [linhaExtratoId],
      lancamentoIds: [criado.id],
    });

    // Relido depois do vínculo: o retorno já sai com `conciliado` e o grupo.
    return tx.lancamentoBancario.findUniqueOrThrow({ where: { id: criado.id } });
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Conciliacao",
    entidadeId: linhaExtratoId,
    acao: "CRIAR_LANCAMENTO_E_CONCILIAR",
    anterior: { status: linha.status },
    novo: { status: "CONCILIADO", lancamentoBancarioId: lancamento.id },
  });

  return lancamento;
}

/**
 * Concilia N linhas do extrato com M lançamentos da mesma conta, desde que as
 * somas com sinal sejam iguais. Se não forem, o usuário pode lançar a
 * diferença (ex.: tarifa) no próprio grupo — valor, tipo e data saem daqui.
 */
export async function conciliarEmGrupo(
  sessao: SessaoAtiva,
  entrada: { linhaIds: string[]; lancamentoIds: string[]; lancamentoDiferenca?: DadosLancamentoAvulso },
): Promise<{ grupoConciliacaoId: string; lancamentoDiferencaId: string | null }> {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  if (entrada.lancamentoDiferenca) {
    requirePermission(sessao.perfil, "lancamento:escrever");
  }
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linhaIds = [...new Set(entrada.linhaIds)];
  const lancamentoIds = [...new Set(entrada.lancamentoIds)];
  if (linhaIds.length === 0) {
    throw new Error("Marque ao menos uma linha do extrato");
  }
  if (lancamentoIds.length === 0 && !entrada.lancamentoDiferenca) {
    throw new Error("Marque ao menos um lançamento");
  }

  const linhas = await prisma.linhaExtrato.findMany({
    where: { id: { in: linhaIds }, contaBancaria: { filialId: sessao.filialId } },
  });
  if (linhas.length !== linhaIds.length) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  const contaBancariaId = linhas[0].contaBancariaId;
  if (linhas.some((l) => l.contaBancariaId !== contaBancariaId)) {
    throw new Error("Todas as linhas do grupo devem ser da mesma conta bancária");
  }
  if (linhas.some((l) => l.grupoConciliacaoId)) {
    throw new Error("Alguma linha marcada já está conciliada");
  }

  const lancamentos = await prisma.lancamentoBancario.findMany({
    where: { id: { in: lancamentoIds }, filialId: sessao.filialId },
  });
  if (lancamentos.length !== lancamentoIds.length) {
    throw new Error("Lançamento não pertence à filial ativa");
  }
  if (lancamentos.some((l) => l.contaBancariaId !== contaBancariaId)) {
    throw new Error("Os lançamentos do grupo devem ser da mesma conta bancária das linhas");
  }
  if (lancamentos.some((l) => l.conciliado || l.grupoConciliacaoId)) {
    throw new Error("Algum lançamento marcado já está conciliado");
  }

  const diferenca = diferencaDoGrupo(
    linhas.map((l) => ({ valor: Number(l.valor), tipo: l.tipo })),
    lancamentos.map((l) => ({ valor: Number(l.valor), tipo: l.tipo })),
  );

  let camposDiferenca: Awaited<ReturnType<typeof prepararLancamentoAvulso>> | null = null;
  if (entrada.lancamentoDiferenca) {
    if (diferenca === 0) {
      throw new Error("Não há diferença a lançar: as somas já batem");
    }
    camposDiferenca = await prepararLancamentoAvulso(sessao.filialId, entrada.lancamentoDiferenca);
  } else if (diferenca !== 0) {
    throw new Error(
      `A soma das linhas e dos lançamentos não bate (diferença de ${formatarMoeda(Math.abs(diferenca) / 100)})`,
    );
  }

  const dataDiferenca = new Date(Math.max(...linhas.map((l) => l.data.getTime())));

  const resultado = await prisma.$transaction(async (tx) => {
    let lancamentoDiferencaId: string | null = null;
    if (camposDiferenca) {
      const criado = await tx.lancamentoBancario.create({
        data: {
          ...camposDiferenca,
          filialId: sessao.filialId,
          contaBancariaId,
          data: dataDiferenca,
          tipo: diferenca > 0 ? "ENTRADA" : "SAIDA",
          valor: new Prisma.Decimal(Math.abs(diferenca)).div(100),
          origem: "MANUAL",
          usuarioId: sessao.usuarioId,
          conciliado: false,
        },
      });
      lancamentoDiferencaId = criado.id;
    }

    const grupoConciliacaoId = await vincularEmGrupo(tx, {
      filialId: sessao.filialId,
      contaBancariaId,
      usuarioId: sessao.usuarioId,
      linhaIds,
      lancamentoIds: lancamentoDiferencaId ? [...lancamentoIds, lancamentoDiferencaId] : lancamentoIds,
    });
    return { grupoConciliacaoId, lancamentoDiferencaId };
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "GrupoConciliacao",
    entidadeId: resultado.grupoConciliacaoId,
    acao: "CONCILIAR_GRUPO",
    anterior: null,
    novo: {
      linhaIds,
      lancamentoIds,
      lancamentoDiferencaId: resultado.lancamentoDiferencaId,
      totalLinhas: linhas.reduce((t, l) => t + (l.tipo === "ENTRADA" ? 1 : -1) * Number(l.valor), 0),
      totalLancamentos: lancamentos.reduce((t, l) => t + (l.tipo === "ENTRADA" ? 1 : -1) * Number(l.valor), 0),
    },
  });

  return resultado;
}

/**
 * Itens que podem entrar num grupo junto com a linha de partida: as outras
 * linhas e os lançamentos ainda soltos da mesma conta, dos dois tipos, dentro
 * de ±JANELA_BUSCA_DIAS. Sempre consulta ao vivo.
 */
export async function buscarCandidatosParaGrupo(sessao: SessaoAtiva, linhaExtratoId: string) {
  const linhaPartida = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linhaPartida) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  if (linhaPartida.grupoConciliacaoId) {
    throw new Error("Esta linha já está conciliada");
  }

  const janela = janelaDeBusca(linhaPartida.data);
  const [linhas, lancamentos] = await Promise.all([
    prisma.linhaExtrato.findMany({
      where: {
        contaBancariaId: linhaPartida.contaBancariaId,
        grupoConciliacaoId: null,
        id: { not: linhaPartida.id },
        data: janela,
      },
      orderBy: { data: "asc" },
    }),
    prisma.lancamentoBancario.findMany({
      where: { contaBancariaId: linhaPartida.contaBancariaId, grupoConciliacaoId: null, conciliado: false, data: janela },
      orderBy: { data: "asc" },
    }),
  ]);

  return { linhaPartida, linhas, lancamentos };
}
