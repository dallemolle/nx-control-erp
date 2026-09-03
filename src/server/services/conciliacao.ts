import type { StatusLinhaExtrato, TipoLancamento } from "@prisma/client";
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
  const janelaInicio = new Date(data.getTime() - JANELA_BUSCA_DIAS * 24 * 60 * 60 * 1000);
  const janelaFim = new Date(data.getTime() + JANELA_BUSCA_DIAS * 24 * 60 * 60 * 1000);

  return prisma.lancamentoBancario.findMany({
    where: { contaBancariaId, tipo, data: { gte: janelaInicio, lte: janelaFim } },
    orderBy: { data: "desc" },
  });
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

  let conciliadasAutomaticamente = 0;

  for (const linha of linhas) {
    const candidatos = await buscarCandidatosLancamento(linha.contaBancariaId, linha.tipo, linha.data);

    const resultado = classificarLinhaExtrato(
      { data: linha.data, valor: Number(linha.valor), tipo: linha.tipo },
      candidatos.map((c) => ({ id: c.id, data: c.data, valor: Number(c.valor), conciliado: c.conciliado })),
    );

    if (resultado.status === "CONCILIADO" && resultado.lancamentoAutoVinculadoId) {
      const lancamentoId = resultado.lancamentoAutoVinculadoId;
      await prisma.$transaction([
        prisma.linhaExtrato.update({
          where: { id: linha.id },
          data: { status: "CONCILIADO", lancamentoBancarioId: lancamentoId },
        }),
        prisma.lancamentoBancario.update({ where: { id: lancamentoId }, data: { conciliado: true } }),
      ]);

      await registrarAuditoria({
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Conciliacao",
        entidadeId: linha.id,
        acao: "CONCILIAR_AUTOMATICO",
        anterior: { status: "NAO_CONCILIADO" },
        novo: { status: "CONCILIADO", lancamentoBancarioId: lancamentoId },
      });
      conciliadasAutomaticamente += 1;
    } else {
      await prisma.linhaExtrato.update({ where: { id: linha.id }, data: { status: resultado.status } });
    }
  }

  return { totalProcessadas: linhas.length, conciliadasAutomaticamente };
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
      lancamentoBancario: true,
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
  return buscarCandidatosLancamento(linha.contaBancariaId, linha.tipo, linha.data);
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
  if (linha.lancamentoBancarioId) {
    throw new Error("Esta linha já está conciliada");
  }

  const lancamento = await prisma.lancamentoBancario.findFirst({
    where: { id: lancamentoBancarioId, contaBancariaId: linha.contaBancariaId, conciliado: false },
  });
  if (!lancamento) {
    throw new Error("Lançamento não encontrado, de outra conta bancária, ou já conciliado");
  }

  await prisma.$transaction([
    prisma.linhaExtrato.update({
      where: { id: linhaExtratoId },
      data: { status: "CONCILIADO", lancamentoBancarioId },
    }),
    prisma.lancamentoBancario.update({ where: { id: lancamentoBancarioId }, data: { conciliado: true } }),
  ]);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Conciliacao",
    entidadeId: linhaExtratoId,
    acao: "CONCILIAR",
    anterior: { status: linha.status },
    novo: { status: "CONCILIADO", lancamentoBancarioId },
  });
}

export async function desconciliar(sessao: SessaoAtiva, linhaExtratoId: string): Promise<void> {
  requirePermission(sessao.perfil, "conciliacao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const linha = await prisma.linhaExtrato.findFirst({
    where: { id: linhaExtratoId, contaBancaria: { filialId: sessao.filialId } },
  });
  if (!linha) {
    throw new Error("Linha de extrato não pertence à filial ativa");
  }
  if (!linha.lancamentoBancarioId) {
    throw new Error("Esta linha não está conciliada");
  }

  const lancamentoBancarioId = linha.lancamentoBancarioId;

  await prisma.$transaction([
    prisma.linhaExtrato.update({
      where: { id: linhaExtratoId },
      data: { status: "NAO_CONCILIADO", lancamentoBancarioId: null },
    }),
    prisma.lancamentoBancario.update({ where: { id: lancamentoBancarioId }, data: { conciliado: false } }),
  ]);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Conciliacao",
    entidadeId: linhaExtratoId,
    acao: "DESCONCILIAR",
    anterior: { status: "CONCILIADO", lancamentoBancarioId },
    novo: { status: "NAO_CONCILIADO", lancamentoBancarioId: null },
  });
}

export async function criarLancamentoDaLinha(
  sessao: SessaoAtiva,
  linhaExtratoId: string,
  dados: { descricao: string; categoriaFinanceiraId: string | null },
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
  if (linha.lancamentoBancarioId) {
    throw new Error("Esta linha já está conciliada");
  }

  const lancamento = await prisma.$transaction(async (tx) => {
    const criado = await tx.lancamentoBancario.create({
      data: {
        filialId: sessao.filialId,
        contaBancariaId: linha.contaBancariaId,
        data: linha.data,
        tipo: linha.tipo,
        valor: linha.valor,
        descricao: dados.descricao,
        origem: "MANUAL",
        categoriaFinanceiraId: dados.categoriaFinanceiraId,
        usuarioId: sessao.usuarioId,
        conciliado: true,
      },
    });

    await tx.linhaExtrato.update({
      where: { id: linhaExtratoId },
      data: { status: "CONCILIADO", lancamentoBancarioId: criado.id },
    });

    return criado;
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
