import { Prisma, type ClassificacaoFiscal, type OrigemRecepcao } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria, type ClientePrisma } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { DadosEditaveisRecepcao, RecepcaoFormValues } from "@/lib/schemas/recepcao";
import { calcularRecepcao } from "@/lib/producao/recepcao";
import { calcularValidade, prefixoDoLote, proximoCodigoDeLote } from "@/lib/producao/lote";
import { obterConfiguracaoProducao } from "./configuracaoProducao";
import { registrarMovimento } from "./estoque";
import { criarTituloInterno } from "./titulo";

export const MSG_SEM_CATEGORIA_COMPRA =
  "Configure a categoria de compra de fruto em Administração → Configuração de produção";

const UM_DIA_MS = 86_400_000;
const TENTATIVAS_NUMERACAO = 3;

function autorizar(sessao: SessaoAtiva) {
  requirePermission(sessao.perfil, "producao:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
}

/**
 * Recepção de uma carga de fruto (F1): numera o lote, dá entrada no estoque e,
 * para compra de terceiro com valor, cria a conta a pagar — tudo na mesma
 * transação. Se o título falhar, nada é gravado.
 */
export async function criarRecepcao(sessao: SessaoAtiva, dados: RecepcaoFormValues) {
  autorizar(sessao);

  const produto = await prisma.produto.findFirst({
    where: { id: dados.produtoId, empresaId: sessao.empresaId, ativo: true, categoria: "FRUTO" },
    include: { fruta: { select: { custoPadraoKg: true } } },
  });
  if (!produto) throw new Error("Produto de fruto não encontrado ou inativo");

  const local = await prisma.localArmazenamento.findFirst({
    where: { id: dados.localId, filialId: sessao.filialId, ativo: true },
    select: { id: true },
  });
  if (!local) throw new Error("Local de armazenamento não encontrado ou inativo");

  let fornecedor: { id: string; classificacaoFiscalPadrao: ClassificacaoFiscal | null } | null = null;
  if (dados.origem === "PROPRIA") {
    const talhao = await prisma.talhao.findFirst({
      where: { id: dados.talhaoId ?? "", filialId: sessao.filialId, ativo: true, frutaId: produto.frutaId },
      select: { id: true },
    });
    if (!talhao) throw new Error("Talhão não encontrado, inativo ou de outra fruta");
  } else {
    fornecedor = await prisma.fornecedor.findFirst({
      where: { id: dados.fornecedorId ?? "", empresaId: sessao.empresaId, ativo: true },
      select: { id: true, classificacaoFiscalPadrao: true },
    });
    if (!fornecedor) throw new Error("Fornecedor não encontrado ou inativo");
  }

  if (dados.safraId) {
    const safra = await prisma.safra.findFirst({ where: { id: dados.safraId, filialId: sessao.filialId } });
    if (!safra) throw new Error("Safra não pertence à filial ativa");
  }

  let fatorUnidadeKg: number | null = null;
  if (dados.unidade === "COMERCIAL") {
    if (produto.fatorUnidadeKg === null) throw new Error("Este produto não tem unidade comercial; lance em kg");
    fatorUnidadeKg = Number(produto.fatorUnidadeKg);
  }

  // Fruto próprio: custo-padrão da fruta (D-04). Terceiro: preço digitado.
  const custoPadraoKg = Number(produto.fruta.custoPadraoKg);
  const precoDigitado =
    dados.origem === "TERCEIRO" ? (dados.preco ?? 0) : fatorUnidadeKg ? custoPadraoKg * fatorUnidadeKg : custoPadraoKg;
  const calculo = calcularRecepcao({
    bruto: dados.pesoBruto,
    descarte: dados.descarte,
    preco: precoDigitado,
    fatorUnidadeKg,
  });
  const custoKg = dados.origem === "PROPRIA" ? custoPadraoKg : calculo.precoKg;

  const configuracao = await obterConfiguracaoProducao(sessao.filialId);
  const geraTitulo = fornecedor !== null && calculo.valorTotal > 0;
  if (geraTitulo && !configuracao.categoriaCompraFrutoId) throw new Error(MSG_SEM_CATEGORIA_COMPRA);

  // Sem classificação no formulário nem no fornecedor: com número de nota é
  // fiscal; sem, é compra gerencial com recibo (o padrão fiscal do sistema
  // recusaria toda compra de produtor sem nota).
  const classificacao: ClassificacaoFiscal =
    dados.classificacaoFiscal ??
    fornecedor?.classificacaoFiscalPadrao ??
    (dados.numeroNotaProdutor ? "FISCAL" : "GERENCIAL");
  if (geraTitulo && classificacao === "FISCAL" && !dados.numeroNotaProdutor) {
    throw new Error("Informe o número da nota do produtor");
  }

  const validade = calcularValidade(dados.data, produto.validadeDias);
  const vencimento =
    dados.dataVencimento ?? new Date(dados.data.getTime() + configuracao.prazoPagamentoProdutorDias * UM_DIA_MS);

  for (let tentativa = 1; ; tentativa++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const prefixo = prefixoDoLote(produto.codigo, dados.data);
        const existentes = await tx.lote.findMany({
          where: { filialId: sessao.filialId, codigo: { startsWith: `${prefixo}-` } },
          select: { codigo: true },
        });
        const codigo = proximoCodigoDeLote(
          prefixo,
          existentes.map((l) => l.codigo),
        );

        const lote = await tx.lote.create({
          data: {
            filialId: sessao.filialId,
            codigo,
            produtoId: produto.id,
            origem: "RECEPCAO",
            data: dados.data,
            validade,
            localId: dados.localId,
            quantidadeInicialKg: calculo.liquidoKg,
            saldoKg: 0,
            custoKg,
          },
        });
        await registrarMovimento(tx, {
          filialId: sessao.filialId,
          loteId: lote.id,
          data: dados.data,
          tipo: "ENTRADA",
          quantidadeKg: calculo.liquidoKg,
          usuarioId: sessao.usuarioId,
        });

        let tituloId: string | null = null;
        if (geraTitulo && fornecedor) {
          const titulo = await criarTituloInterno(
            sessao,
            "PAGAR",
            {
              contraparteId: fornecedor.id,
              documento: dados.documento ?? `RF-${codigo}`,
              dataEmissao: dados.data,
              dataCompetencia: dados.data,
              categoriaFinanceiraId: configuracao.categoriaCompraFrutoId!,
              safraId: dados.safraId ?? "",
              classificacaoFiscal: classificacao,
              tipoComprovante: classificacao === "FISCAL" ? "NF_PRODUTOR" : "RECIBO",
              numeroDocumentoFiscal: classificacao === "FISCAL" ? (dados.numeroNotaProdutor ?? "") : "",
              parcelas: [{ numero: 1, dataVencimento: vencimento, valorOriginal: calculo.valorTotal }],
            },
            tx,
          );
          tituloId = titulo.id;
        }

        const recepcao = await tx.recepcaoFruto.create({
          data: {
            filialId: sessao.filialId,
            loteId: lote.id,
            data: dados.data,
            produtoId: produto.id,
            origem: dados.origem,
            talhaoId: dados.origem === "PROPRIA" ? (dados.talhaoId ?? null) : null,
            fornecedorId: fornecedor?.id ?? null,
            pesoBrutoKg: calculo.brutoKg,
            descarteKg: calculo.descarteKg,
            precoKg: custoKg,
            valorTotal: calculo.valorTotal,
            qualidade: dados.qualidade ?? null,
            documento: dados.documento ?? null,
            observacao: dados.observacao ?? null,
            safraId: dados.safraId ?? null,
            tituloId,
            usuarioId: sessao.usuarioId,
          },
        });

        await registrarAuditoria(
          {
            empresaId: sessao.empresaId,
            filialId: sessao.filialId,
            usuarioId: sessao.usuarioId,
            entidade: "RecepcaoFruto",
            entidadeId: recepcao.id,
            acao: "CRIAR",
            anterior: null,
            novo: {
              lote: codigo,
              origem: dados.origem,
              liquidoKg: calculo.liquidoKg,
              precoKg: custoKg,
              valorTotal: calculo.valorTotal,
              tituloId,
            },
          },
          tx,
        );

        return { recepcaoId: recepcao.id, loteId: lote.id, codigoLote: codigo, tituloId };
      });
    } catch (erro) {
      // Outra recepção do mesmo produto e dia pegou o número antes: refaz com o próximo.
      const conflito = erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002";
      if (!conflito || tentativa >= TENTATIVAS_NUMERACAO) throw erro;
    }
  }
}

/** Qualidade, documento e observação não afetam estoque nem valor: editáveis sempre. */
export async function atualizarDadosRecepcao(sessao: SessaoAtiva, id: string, dados: DadosEditaveisRecepcao) {
  autorizar(sessao);
  const anterior = await prisma.recepcaoFruto.findFirstOrThrow({ where: { id, filialId: sessao.filialId } });
  const novo = {
    qualidade: dados.qualidade ?? null,
    documento: dados.documento ?? null,
    observacao: dados.observacao ?? null,
  };
  await prisma.recepcaoFruto.update({ where: { id }, data: novo });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "RecepcaoFruto",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: { qualidade: anterior.qualidade, documento: anterior.documento, observacao: anterior.observacao },
    novo,
  });
}

async function verificarCancelamento(
  db: ClientePrisma,
  recepcao: { status: string; loteId: string; tituloId: string | null },
): Promise<{ podeCancelar: boolean; motivo?: string }> {
  if (recepcao.status === "CANCELADA") return { podeCancelar: false, motivo: "A recepção já está cancelada" };
  const movimentos = await db.movimentoEstoque.count({ where: { loteId: recepcao.loteId } });
  if (movimentos > 1) {
    return { podeCancelar: false, motivo: "O lote já teve movimentação; não é possível excluir a recepção" };
  }
  if (recepcao.tituloId) {
    const baixas = await db.baixa.count({
      where: { parcela: { tituloId: recepcao.tituloId }, statusAprovacao: { not: "REJEITADO" } },
    });
    if (baixas > 0) {
      return {
        podeCancelar: false,
        motivo: "A conta a pagar já tem pagamento registrado; não é possível excluir a recepção",
      };
    }
  }
  return { podeCancelar: true };
}

/** Usado pela tela para desabilitar "Excluir" com a explicação. */
export async function situacaoParaCancelar(recepcaoId: string) {
  const recepcao = await prisma.recepcaoFruto.findUniqueOrThrow({ where: { id: recepcaoId } });
  return verificarCancelamento(prisma, recepcao);
}

/**
 * "Excluir" a recepção: estorna o lote (que continua existindo, zerado, para
 * o número nunca ser reaproveitado), cancela a conta a pagar e marca a
 * recepção como cancelada.
 */
export async function cancelarRecepcao(sessao: SessaoAtiva, id: string, motivo: string): Promise<void> {
  autorizar(sessao);
  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length < 3) throw new Error("Informe o motivo da exclusão");

  await prisma.$transaction(async (tx) => {
    const recepcao = await tx.recepcaoFruto.findFirstOrThrow({
      where: { id, filialId: sessao.filialId },
      include: { lote: { select: { saldoKg: true } } },
    });
    // Conferido dentro da transação: um ajuste lançado no meio não escapa.
    const situacao = await verificarCancelamento(tx, recepcao);
    if (!situacao.podeCancelar) throw new Error(situacao.motivo);

    await registrarMovimento(tx, {
      filialId: sessao.filialId,
      loteId: recepcao.loteId,
      data: recepcao.data,
      tipo: "ESTORNO_RECEPCAO",
      quantidadeKg: -Number(recepcao.lote.saldoKg),
      usuarioId: sessao.usuarioId,
    });
    if (recepcao.tituloId) {
      await tx.parcela.updateMany({ where: { tituloId: recepcao.tituloId }, data: { status: "CANCELADO" } });
    }
    await tx.recepcaoFruto.update({ where: { id }, data: { status: "CANCELADA", motivoCancelamento: motivoLimpo } });

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "RecepcaoFruto",
        entidadeId: id,
        acao: "CANCELAR",
        anterior: { status: recepcao.status },
        novo: { status: "CANCELADA", motivo: motivoLimpo, tituloId: recepcao.tituloId },
      },
      tx,
    );
  });
}

export type FiltroRecepcoes = { inicio: Date; fim: Date; frutaId?: string; origem?: OrigemRecepcao };

export async function listarRecepcoes(filialId: string, filtros: FiltroRecepcoes) {
  return prisma.recepcaoFruto.findMany({
    where: {
      filialId,
      data: { gte: filtros.inicio, lte: filtros.fim },
      ...(filtros.origem ? { origem: filtros.origem } : {}),
      ...(filtros.frutaId ? { produto: { frutaId: filtros.frutaId } } : {}),
    },
    include: {
      lote: { select: { codigo: true } },
      produto: { select: { descricao: true, fruta: { select: { nome: true } } } },
      talhao: { select: { nome: true } },
      fornecedor: { select: { nome: true } },
    },
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
  });
}

export type RecepcaoListada = Awaited<ReturnType<typeof listarRecepcoes>>[number];
