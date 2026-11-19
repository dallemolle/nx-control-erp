import { Prisma, type ClassificacaoFiscal, type StatusPedidoVenda } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria, type ClientePrisma } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { DadosEditaveisPedido, PedidoVendaFormValues } from "@/lib/schemas/pedidoVenda";
import { ROTULOS_FORMA_PAGAMENTO_VENDA, ROTULOS_MODALIDADE_CARTAO } from "@/lib/schemas/enums";
import {
  calcularRepasses,
  condicaoParaVenda,
  descricaoPagamentoCartao,
  type CondicaoCartao,
  type ModalidadeCartaoValor,
} from "@/lib/producao/cartao";
import {
  calcularItem,
  calcularPedido,
  condicaoDasParcelas,
  loteVencidoNaData,
  situacaoPagamento,
  validarParcelasVenda,
  type SituacaoPagamento,
} from "@/lib/producao/venda";
import { obterConfiguracaoProducao } from "./configuracaoProducao";
import {
  bloqueioDaProducao,
  exigirLiberacao,
  LOTE_LIBERADO,
  recepcaoExcluida,
  registrarMovimento,
  SELECT_SITUACAO_LOTE,
} from "./estoque";
import { criarTituloInterno } from "./titulo";
import { efetivarBaixa } from "./baixa";
import { condicoesDaOperadora } from "./operadoraCartao";

/** Venda na maquininha (D-37): operadora, modalidade, parcelas e condição usadas no pedido. */
type VendaNaMaquininha = {
  operadora: {
    id: string;
    nome: string;
    clienteId: string;
    fornecedorId: string;
    categoriaTaxaId: string;
    contaBancariaId: string;
  };
  modalidade: ModalidadeCartaoValor;
  parcelas: number;
  condicao: CondicaoCartao;
};

export const MSG_SEM_CATEGORIA_VENDA =
  "Configure a categoria de venda em Administração → Configuração de produção";
export const MSG_SEM_CONTA_RECEBIMENTO =
  "Configure a conta de recebimento padrão em Administração → Configuração de produção";
export const MSG_SEM_CONTA_CAIXA = "Configure a conta Caixa padrão em Administração → Configuração de produção";

const TENTATIVAS_NUMERACAO = 3;

/**
 * Pedido de venda (F4): baixa o estoque por lote, cria a conta a receber e,
 * à vista, o recebimento já aprovado — tudo na mesma transação. Se qualquer
 * passo falhar, nada é gravado e o número não é consumido.
 */
export async function criarPedido(sessao: SessaoAtiva, dados: PedidoVendaFormValues) {
  requirePermission(sessao.perfil, "venda:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const cliente = await prisma.cliente.findFirst({
    where: { id: dados.clienteId, empresaId: sessao.empresaId, ativo: true },
  });
  if (!cliente) throw new Error("Cliente não encontrado ou inativo");

  const configuracao = await obterConfiguracaoProducao(sessao.filialId);
  if (!configuracao.categoriaVendaId) throw new Error(MSG_SEM_CATEGORIA_VENDA);

  const naMaquininha = dados.formaPagamento === "CARTAO";
  const aPrazo = dados.formaPagamento === "A_PRAZO";
  const aVista = !aPrazo && !naMaquininha;
  const emDinheiro = dados.formaPagamento === "DINHEIRO";
  let contaId: string | null = null;
  if (aVista) {
    contaId =
      dados.contaBancariaId ?? (emDinheiro ? configuracao.contaCaixaPadraoId : configuracao.contaRecebimentoPadraoId);
    if (!contaId) throw new Error(emDinheiro ? MSG_SEM_CONTA_CAIXA : MSG_SEM_CONTA_RECEBIMENTO);
    const conta = await prisma.contaBancaria.findFirst({
      where: { id: contaId, filialId: sessao.filialId, ativo: true },
      select: { tipo: true },
    });
    if (!conta) throw new Error("Conta não encontrada ou inativa");
    if (emDinheiro && conta.tipo !== "CAIXA") throw new Error("Venda em dinheiro entra numa conta Caixa");
    if (!emDinheiro && conta.tipo === "CAIXA") throw new Error("Pix e transferência não entram na conta Caixa");
  }

  let maquininha: VendaNaMaquininha | null = null;
  if (naMaquininha) {
    const operadora = await prisma.operadoraCartao.findFirst({
      where: { id: dados.operadoraCartaoId, filialId: sessao.filialId, ativo: true },
      include: { condicoes: true, contaBancaria: { select: { ativo: true } } },
    });
    if (!operadora) throw new Error("Operadora não encontrada ou inativa");
    if (!operadora.contaBancaria.ativo) throw new Error("A conta de depósito da operadora está inativa");
    const modalidade = dados.modalidadeCartao!;
    const parcelas = modalidade === "CREDITO_PARCELADO" ? dados.parcelasCartao! : 1;
    const condicao = condicaoParaVenda(condicoesDaOperadora(operadora), modalidade, parcelas);
    if (!condicao) {
      const emParcelas = modalidade === "CREDITO_PARCELADO" ? ` em ${parcelas}x` : "";
      throw new Error(`A ${operadora.nome} não tem condição para ${ROTULOS_MODALIDADE_CARTAO[modalidade]}${emParcelas}`);
    }
    contaId = operadora.contaBancariaId;
    maquininha = { operadora, modalidade, parcelas, condicao };
  }

  const loteIds = dados.itens.map((item) => item.loteId);
  const lotes = await prisma.lote.findMany({
    where: { id: { in: loteIds }, filialId: sessao.filialId },
    include: SELECT_SITUACAO_LOTE,
  });
  const lotesPorId = new Map(lotes.map((lote) => [lote.id, lote]));

  const vistos = new Set<string>();
  const liberados = new Set<string>();
  for (const item of dados.itens) {
    const lote = lotesPorId.get(item.loteId);
    if (!lote) throw new Error("Lote não encontrado");
    if (vistos.has(lote.id)) throw new Error(`O lote ${lote.codigo} aparece mais de uma vez no pedido`);
    vistos.add(lote.id);
    if (recepcaoExcluida(lote)) throw new Error(`O lote ${lote.codigo} é de uma recepção excluída`);
    const bloqueio = bloqueioDaProducao(lote);
    if (bloqueio) throw new Error(bloqueio);
    if (loteVencidoNaData(lote.validade, dados.data)) {
      // D-35: só sai se o gestor liberou o lote e a liberação cobre a data do pedido.
      exigirLiberacao(lote, dados.data);
      liberados.add(lote.id);
    }
  }

  const itens = dados.itens.map((item) => {
    const lote = lotesPorId.get(item.loteId)!;
    return {
      lote,
      quantidadeKg: item.quantidadeKg,
      precoKg: item.precoKg,
      custoKg: Number(lote.custoKg),
      // Motivo copiado do lote só quando ele está vencido na data do pedido.
      motivoLiberacaoVencido: liberados.has(lote.id) ? lote.motivoLiberacao : null,
    };
  });
  const totais = calcularPedido(itens);
  const repasses = maquininha ? calcularRepasses(dados.data, totais.valor, maquininha.condicao, maquininha.parcelas) : [];

  // A prazo: as parcelas vêm prontas do formulário (o vendedor pode ter ajustado).
  const parcelasAPrazo = aPrazo ? dados.parcelas : [];
  if (aPrazo) {
    const erroParcelas = validarParcelasVenda(dados.data, totais.valor, parcelasAPrazo);
    if (erroParcelas) throw new Error(erroParcelas);
  }
  const condicaoPagamento = aPrazo
    ? condicaoDasParcelas(dados.data, parcelasAPrazo.map((p) => p.dataVencimento))
    : null;

  // Sem classificação no pedido nem no cliente: com número de nota é fiscal;
  // sem, é venda gerencial com recibo.
  const classificacao: ClassificacaoFiscal =
    dados.classificacaoFiscal ?? cliente.classificacaoFiscalPadrao ?? (dados.numeroDocumentoFiscal ? "FISCAL" : "GERENCIAL");
  const numeroNota = classificacao === "FISCAL" ? (dados.numeroDocumentoFiscal ?? null) : null;

  for (let tentativa = 1; ; tentativa++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const { _max } = await tx.pedidoVenda.aggregate({
          where: { filialId: sessao.filialId },
          _max: { numero: true },
        });
        const numero = (_max.numero ?? 0) + 1;

        const pedido = await tx.pedidoVenda.create({
          data: {
            filialId: sessao.filialId,
            numero,
            data: dados.data,
            clienteId: cliente.id,
            canal: dados.canal ?? cliente.canalVenda,
            formaPagamento: dados.formaPagamento,
            condicaoPagamento,
            contaBancariaId: contaId,
            operadoraCartaoId: maquininha?.operadora.id ?? null,
            modalidadeCartao: maquininha?.modalidade ?? null,
            parcelasCartao: maquininha?.parcelas ?? null,
            taxaCartaoPercentual: maquininha?.condicao.taxaPercentual ?? null,
            retiraNaPropriedade: dados.retiraNaPropriedade,
            numeroDocumentoFiscal: numeroNota,
            observacao: dados.observacao ?? null,
            usuarioId: sessao.usuarioId,
          },
        });

        for (const item of itens) {
          const criado = await tx.itemPedidoVenda.create({
            data: {
              pedidoId: pedido.id,
              loteId: item.lote.id,
              quantidadeKg: item.quantidadeKg,
              precoKg: item.precoKg,
              custoKg: item.lote.custoKg,
              motivoLiberacaoVencido: item.motivoLiberacaoVencido,
            },
          });
          await registrarMovimento(tx, {
            filialId: sessao.filialId,
            loteId: item.lote.id,
            data: dados.data,
            tipo: "VENDA",
            quantidadeKg: -item.quantidadeKg,
            usuarioId: sessao.usuarioId,
            itemPedidoId: criado.id,
          });
        }

        const titulo = await criarTituloInterno(
          sessao,
          "RECEBER",
          {
            contraparteId: maquininha ? maquininha.operadora.clienteId : cliente.id,
            documento: numeroNota ?? `PV-${numero}`,
            dataEmissao: dados.data,
            dataCompetencia: dados.data,
            categoriaFinanceiraId: configuracao.categoriaVendaId!,
            contaBancariaId: contaId ?? "",
            formaPagamento: maquininha
              ? descricaoPagamentoCartao(maquininha.modalidade, maquininha.parcelas, maquininha.operadora.nome)
              : ROTULOS_FORMA_PAGAMENTO_VENDA[dados.formaPagamento],
            classificacaoFiscal: classificacao,
            tipoComprovante: classificacao === "FISCAL" ? "NFE" : "RECIBO",
            numeroDocumentoFiscal: numeroNota ?? "",
            parcelas: maquininha
              ? repasses.map((r) => ({ numero: r.numero, dataVencimento: r.data, valorOriginal: r.bruto }))
              : aVista
                ? [{ numero: 1, dataVencimento: dados.data, valorOriginal: totais.valor }]
                : parcelasAPrazo.map((parcela, i) => ({
                    numero: i + 1,
                    dataVencimento: parcela.dataVencimento,
                    valorOriginal: parcela.valor,
                  })),
          },
          tx,
        );

        // D-37: a taxa da operadora vira despesa, com as parcelas nas datas dos repasses.
        let tituloTaxaId: string | null = null;
        const parcelasTaxa = repasses.filter((r) => r.taxa > 0);
        if (maquininha && parcelasTaxa.length > 0) {
          const tituloTaxa = await criarTituloInterno(
            sessao,
            "PAGAR",
            {
              contraparteId: maquininha.operadora.fornecedorId,
              documento: `Taxa PV-${numero}`,
              dataEmissao: dados.data,
              dataCompetencia: dados.data,
              categoriaFinanceiraId: maquininha.operadora.categoriaTaxaId,
              contaBancariaId: maquininha.operadora.contaBancariaId,
              formaPagamento: "Taxa da operadora",
              classificacaoFiscal: "GERENCIAL",
              tipoComprovante: "SEM_COMPROVANTE",
              numeroDocumentoFiscal: "",
              motivoSemDocumento: "Taxa da operadora descontada no repasse",
              parcelas: parcelasTaxa.map((r) => ({ numero: r.numero, dataVencimento: r.data, valorOriginal: r.taxa })),
            },
            tx,
          );
          tituloTaxaId = tituloTaxa.id;
        }

        let baixaAutomaticaId: string | null = null;
        if (aVista) {
          const baixa = await tx.baixa.create({
            data: {
              parcelaId: titulo.parcelas[0].id,
              data: dados.data,
              valorPago: totais.valor,
              contaBancariaId: contaId!,
              usuarioId: sessao.usuarioId,
              statusAprovacao: "PENDENTE",
            },
          });
          await efetivarBaixa(tx, sessao, baixa.id);
          baixaAutomaticaId = baixa.id;
        }

        await tx.pedidoVenda.update({
          where: { id: pedido.id },
          data: { tituloId: titulo.id, tituloTaxaId, baixaAutomaticaId },
        });

        if (!dados.retiraNaPropriedade) {
          await tx.entrega.create({
            data: {
              pedidoId: pedido.id,
              dataPrevista: dados.entregaDataPrevista ?? dados.data,
              endereco: dados.entregaEndereco ?? cliente.enderecoEntrega ?? null,
            },
          });
        }

        await registrarAuditoria(
          {
            empresaId: sessao.empresaId,
            filialId: sessao.filialId,
            usuarioId: sessao.usuarioId,
            entidade: "PedidoVenda",
            entidadeId: pedido.id,
            acao: "CRIAR",
            anterior: null,
            novo: {
              numero,
              clienteId: cliente.id,
              formaPagamento: dados.formaPagamento,
              condicaoPagamento,
              parcelas: aPrazo
                ? parcelasAPrazo.map((p) => ({ dataVencimento: p.dataVencimento, valor: p.valor }))
                : undefined,
              cartao: maquininha
                ? {
                    operadora: maquininha.operadora.nome,
                    modalidade: maquininha.modalidade,
                    parcelas: maquininha.parcelas,
                    taxaPercentual: maquininha.condicao.taxaPercentual,
                    repasses,
                  }
                : undefined,
              tituloTaxaId,
              valor: totais.valor,
              itens: itens.map((item) => ({
                lote: item.lote.codigo,
                quantidadeKg: item.quantidadeKg,
                precoKg: item.precoKg,
                custoKg: item.custoKg,
                motivoLiberacaoVencido: item.motivoLiberacaoVencido,
              })),
              tituloId: titulo.id,
              baixaAutomaticaId,
            },
          },
          tx,
        );

        return { pedidoId: pedido.id, numero, tituloId: titulo.id };
      });
    } catch (erro) {
      // Outro pedido da filial pegou o número antes: refaz com o próximo.
      const conflito = erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002";
      if (!conflito || tentativa >= TENTATIVAS_NUMERACAO) throw erro;
    }
  }
}

export type SituacaoCancelamentoPedido = { pode: true } | { pode: false; motivo: string };

/**
 * O pedido só é cancelado se o recebimento for todo da própria venda: nenhuma
 * baixa do financeiro (pendente ou aprovada) e a baixa automática fora de
 * qualquer extrato. O lançamento da conta Caixa nasce `conciliado`, mas sem
 * linha de extrato — por isso a checagem é pelo grupo de conciliação, não pela flag.
 */
export async function situacaoParaCancelar(
  pedido: { status: StatusPedidoVenda; tituloId: string | null; baixaAutomaticaId: string | null },
  db: ClientePrisma = prisma,
): Promise<SituacaoCancelamentoPedido> {
  if (pedido.status === "CANCELADO") return { pode: false, motivo: "O pedido já está cancelado" };
  if (pedido.tituloId) {
    const outras = await db.baixa.count({
      where: {
        parcela: { tituloId: pedido.tituloId },
        statusAprovacao: { in: ["PENDENTE", "APROVADO"] },
        ...(pedido.baixaAutomaticaId ? { id: { not: pedido.baixaAutomaticaId } } : {}),
      },
    });
    if (outras > 0) return { pode: false, motivo: "O financeiro registrou um recebimento neste pedido" };
  }
  if (pedido.baixaAutomaticaId) {
    const conciliadas = await db.lancamentoBancario.count({
      where: { baixaId: pedido.baixaAutomaticaId, grupoConciliacaoId: { not: null } },
    });
    if (conciliadas > 0) {
      return {
        pode: false,
        motivo: "O recebimento já foi conciliado com o extrato. Desconcilie na Conciliação antes de cancelar",
      };
    }
  }
  return { pode: true };
}

/**
 * Pedido errado é cancelado e refeito (itens não são editados): devolve o
 * estoque, desfaz o recebimento que a própria venda criou e cancela o título.
 */
export async function cancelarPedido(sessao: SessaoAtiva, id: string, motivo: string): Promise<void> {
  requirePermission(sessao.perfil, "venda:cancelar");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length < 3) throw new Error("Informe o motivo do cancelamento");

  await prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoVenda.findFirstOrThrow({
      where: { id, filialId: sessao.filialId },
      include: { itens: true },
    });
    // Conferido dentro da transação: uma baixa lançada no meio não escapa.
    const situacao = await situacaoParaCancelar(pedido, tx);
    if (!situacao.pode) throw new Error(situacao.motivo);

    let lancamentosApagados = 0;
    if (pedido.baixaAutomaticaId) {
      ({ count: lancamentosApagados } = await tx.lancamentoBancario.deleteMany({
        where: { baixaId: pedido.baixaAutomaticaId },
      }));
      await tx.baixa.delete({ where: { id: pedido.baixaAutomaticaId } });
    }
    if (pedido.tituloId) {
      await tx.parcela.updateMany({ where: { tituloId: pedido.tituloId }, data: { status: "CANCELADO" } });
    }
    for (const item of pedido.itens) {
      await registrarMovimento(tx, {
        filialId: sessao.filialId,
        loteId: item.loteId,
        data: pedido.data,
        tipo: "ESTORNO_VENDA",
        quantidadeKg: Number(item.quantidadeKg),
        usuarioId: sessao.usuarioId,
        itemPedidoId: item.id,
      });
    }
    await tx.entrega.updateMany({ where: { pedidoId: id }, data: { status: "CANCELADA" } });
    await tx.pedidoVenda.update({
      where: { id },
      data: { status: "CANCELADO", motivoCancelamento: motivoLimpo, canceladoEm: new Date(), baixaAutomaticaId: null },
    });

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "PedidoVenda",
        entidadeId: id,
        acao: "CANCELAR",
        anterior: { status: pedido.status, baixaAutomaticaId: pedido.baixaAutomaticaId },
        novo: { status: "CANCELADO", motivo: motivoLimpo, tituloId: pedido.tituloId, lancamentosApagados },
      },
      tx,
    );
  });
}

/** Observação não afeta estoque nem valor: editável sempre, inclusive em pedido cancelado. */
export async function atualizarDadosPedido(sessao: SessaoAtiva, id: string, dados: DadosEditaveisPedido) {
  requirePermission(sessao.perfil, "venda:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);
  const anterior = await prisma.pedidoVenda.findFirstOrThrow({ where: { id, filialId: sessao.filialId } });
  const novo = { observacao: dados.observacao ?? null };
  await prisma.pedidoVenda.update({ where: { id }, data: novo });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "PedidoVenda",
    entidadeId: id,
    acao: "ATUALIZAR",
    anterior: { observacao: anterior.observacao },
    novo,
  });
}

/** Lotes com saldo para vender, em ordem FEFO (RN-27), com a marca de vencido na data. */
export async function lotesParaVenda(filialId: string, data: Date) {
  const lotes = await prisma.lote.findMany({
    where: {
      filialId,
      saldoKg: { gt: 0 },
      ...LOTE_LIBERADO,
    },
    include: {
      produto: {
        select: {
          id: true,
          codigo: true,
          descricao: true,
          unidadeComercial: true,
          fatorUnidadeKg: true,
          precoReferenciaKg: true,
        },
      },
    },
    orderBy: [{ validade: "asc" }, { codigo: "asc" }],
  });
  return lotes.map((lote) => ({
    id: lote.id,
    codigo: lote.codigo,
    saldoKg: Number(lote.saldoKg),
    custoKg: Number(lote.custoKg),
    validade: lote.validade,
    vencido: loteVencidoNaData(lote.validade, data),
    liberadoAte: lote.liberadoAte,
    produto: {
      id: lote.produto.id,
      codigo: lote.produto.codigo,
      descricao: lote.produto.descricao,
      unidadeComercial: lote.produto.unidadeComercial,
      fatorUnidadeKg: lote.produto.fatorUnidadeKg === null ? null : Number(lote.produto.fatorUnidadeKg),
      precoReferenciaKg: lote.produto.precoReferenciaKg === null ? null : Number(lote.produto.precoReferenciaKg),
    },
  }));
}

export type LoteParaVenda = Awaited<ReturnType<typeof lotesParaVenda>>[number];

function totaisDosItens(itens: { quantidadeKg: Prisma.Decimal; precoKg: Prisma.Decimal; custoKg: Prisma.Decimal }[]) {
  return calcularPedido(
    itens.map((item) => ({
      quantidadeKg: Number(item.quantidadeKg),
      precoKg: Number(item.precoKg),
      custoKg: Number(item.custoKg),
    })),
  );
}

export type FiltroPedidos = {
  inicio: Date;
  fim: Date;
  clienteId?: string;
  status?: StatusPedidoVenda;
  situacao?: SituacaoPagamento;
};

export async function listarPedidos(filialId: string, filtros: FiltroPedidos, hoje: Date) {
  const pedidos = await prisma.pedidoVenda.findMany({
    where: {
      filialId,
      data: { gte: filtros.inicio, lte: filtros.fim },
      ...(filtros.clienteId ? { clienteId: filtros.clienteId } : {}),
      ...(filtros.status ? { status: filtros.status } : {}),
    },
    include: {
      cliente: { select: { nome: true } },
      entrega: { select: { status: true, dataPrevista: true } },
      itens: { select: { quantidadeKg: true, precoKg: true, custoKg: true } },
      titulo: { select: { parcelas: { select: { status: true, dataVencimento: true } } } },
    },
    orderBy: [{ data: "desc" }, { numero: "desc" }],
  });

  const listados = pedidos.map((pedido) => ({
    ...pedido,
    ...totaisDosItens(pedido.itens),
    situacao: situacaoPagamento(pedido.titulo?.parcelas ?? [], hoje),
  }));
  return filtros.situacao ? listados.filter((p) => p.situacao === filtros.situacao) : listados;
}

export type PedidoListado = Awaited<ReturnType<typeof listarPedidos>>[number];

export async function obterPedido(filialId: string, numero: number, hoje: Date) {
  const pedido = await prisma.pedidoVenda.findUnique({
    where: { filialId_numero: { filialId, numero } },
    include: {
      cliente: true,
      contaBancaria: { select: { conta: true, agencia: true, tipo: true, banco: { select: { nome: true } } } },
      itens: {
        include: {
          lote: {
            select: { codigo: true, validade: true, produto: { select: { codigo: true, descricao: true } } },
          },
        },
        orderBy: { lote: { codigo: "asc" } },
      },
      titulo: {
        select: {
          id: true,
          documento: true,
          classificacaoFiscal: true,
          parcelas: { orderBy: { numero: "asc" } },
        },
      },
      entrega: true,
      usuario: { select: { nome: true } },
    },
  });
  if (!pedido) return null;

  return {
    ...pedido,
    itens: pedido.itens.map((item) => ({
      ...item,
      ...calcularItem({
        quantidadeKg: Number(item.quantidadeKg),
        precoKg: Number(item.precoKg),
        custoKg: Number(item.custoKg),
      }),
    })),
    totais: totaisDosItens(pedido.itens),
    situacao: situacaoPagamento(pedido.titulo?.parcelas ?? [], hoje),
  };
}

export type PedidoDetalhado = NonNullable<Awaited<ReturnType<typeof obterPedido>>>;
