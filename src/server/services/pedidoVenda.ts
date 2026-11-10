import { Prisma, type ClassificacaoFiscal, type StatusPedidoVenda } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { podeExecutar, requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { PedidoVendaFormValues } from "@/lib/schemas/pedidoVenda";
import { ROTULOS_FORMA_PAGAMENTO_VENDA } from "@/lib/schemas/enums";
import { formatarData } from "@/lib/formatacao";
import {
  calcularItem,
  calcularPedido,
  loteVencidoNaData,
  situacaoPagamento,
  type SituacaoPagamento,
} from "@/lib/producao/venda";
import { obterConfiguracaoProducao } from "./configuracaoProducao";
import { registrarMovimento } from "./estoque";
import { criarTituloInterno } from "./titulo";
import { efetivarBaixa } from "./baixa";

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

  const aVista = dados.formaPagamento !== "A_PRAZO";
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
    if (!emDinheiro && conta.tipo === "CAIXA") throw new Error("Pix, transferência e cartão não entram na conta Caixa");
  }

  const loteIds = dados.itens.map((item) => item.loteId);
  const lotes = await prisma.lote.findMany({
    where: { id: { in: loteIds }, filialId: sessao.filialId },
    include: { recepcao: { select: { status: true } } },
  });
  const lotesPorId = new Map(lotes.map((lote) => [lote.id, lote]));

  const vistos = new Set<string>();
  const liberados = new Set<string>();
  const podeLiberar = podeExecutar(sessao.perfil, "venda:liberarVencido");
  for (const item of dados.itens) {
    const lote = lotesPorId.get(item.loteId);
    if (!lote) throw new Error("Lote não encontrado");
    if (vistos.has(lote.id)) throw new Error(`O lote ${lote.codigo} aparece mais de uma vez no pedido`);
    vistos.add(lote.id);
    if (lote.recepcao?.status === "CANCELADA") throw new Error(`O lote ${lote.codigo} é de uma recepção excluída`);
    if (loteVencidoNaData(lote.validade, dados.data)) {
      // D-03: só quem pode liberar, item a item, com motivo.
      if (!podeLiberar || !item.motivoLiberacaoVencido) {
        throw new Error(`O lote ${lote.codigo} venceu em ${formatarData(lote.validade)}`);
      }
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
      // Motivo enviado para lote que não está vencido é descartado.
      motivoLiberacaoVencido: liberados.has(lote.id) ? (item.motivoLiberacaoVencido ?? null) : null,
    };
  });
  const totais = calcularPedido(itens);

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
            vencimento: aVista ? null : (dados.vencimento ?? null),
            contaBancariaId: contaId,
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
            contraparteId: cliente.id,
            documento: numeroNota ?? `PV-${numero}`,
            dataEmissao: dados.data,
            dataCompetencia: dados.data,
            categoriaFinanceiraId: configuracao.categoriaVendaId!,
            contaBancariaId: contaId ?? "",
            formaPagamento: ROTULOS_FORMA_PAGAMENTO_VENDA[dados.formaPagamento],
            classificacaoFiscal: classificacao,
            tipoComprovante: classificacao === "FISCAL" ? "NFE" : "RECIBO",
            numeroDocumentoFiscal: numeroNota ?? "",
            parcelas: [
              {
                numero: 1,
                dataVencimento: aVista ? dados.data : dados.vencimento!,
                valorOriginal: totais.valor,
              },
            ],
          },
          tx,
        );

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

        await tx.pedidoVenda.update({ where: { id: pedido.id }, data: { tituloId: titulo.id, baixaAutomaticaId } });

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

/** Lotes com saldo para vender, em ordem FEFO (RN-27), com a marca de vencido na data. */
export async function lotesParaVenda(filialId: string, data: Date) {
  const lotes = await prisma.lote.findMany({
    where: {
      filialId,
      saldoKg: { gt: 0 },
      OR: [{ recepcao: { is: null } }, { recepcao: { is: { status: "ATIVA" } } }],
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
