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
