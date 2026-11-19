import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  criarLoteDeTeste,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import { criarOperadoraDeTeste } from "./cartaoTestFixtures";
import { criarPedido } from "./pedidoVenda";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("venda na maquininha", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let op: Awaited<ReturnType<typeof criarOperadoraDeTeste>>;

  const lote = () =>
    criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: cat.localCamaraId,
      kg: 100,
      custoKg: 2,
      data: d("2026-11-01"),
      validade: d("2027-11-01"),
    });

  /** Campos do formulário de uma venda de 10 kg a R$ 10 = R$ 100. */
  const campos = async (extra: Record<string, unknown>) => ({
    data: "2026-11-10",
    clienteId: cad.clienteId,
    formaPagamento: "CARTAO",
    operadoraCartaoId: op.id,
    retiraNaPropriedade: "true",
    itens: JSON.stringify([{ loteId: (await lote()).id, quantidadeKg: 10, precoKg: 10 }]),
    ...extra,
  });
  const venda = async (extra: Record<string, unknown>) => pedidoVendaSchema.parse(await campos(extra));

  beforeAll(async () => {
    fx = await criarFixtureProducao("cartao");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    op = await criarOperadoraDeTeste(fx, cat, cad);
  });
  afterAll(async () => {
    await fx.limpar();
  });
  beforeEach(async () => {
    await configurarVendas(fx, cad);
  });

  test("crédito 3x: título da operadora com os repasses, título da taxa, nenhuma baixa", async () => {
    const r = await criarPedido(
      fx.sessao("VENDAS"),
      await venda({ modalidadeCartao: "CREDITO_PARCELADO", parcelasCartao: "3" }),
    );
    const pedido = await prisma.pedidoVenda.findUniqueOrThrow({
      where: { id: r.pedidoId },
      include: {
        titulo: { include: { parcelas: { orderBy: { numero: "asc" } } } },
        tituloTaxa: { include: { parcelas: { orderBy: { numero: "asc" } } } },
      },
    });
    expect(pedido).toMatchObject({
      operadoraCartaoId: op.id,
      modalidadeCartao: "CREDITO_PARCELADO",
      parcelasCartao: 3,
      baixaAutomaticaId: null,
      contaBancariaId: op.contaId,
    });
    expect(Number(pedido.taxaCartaoPercentual)).toBe(3);
    expect(pedido.titulo).toMatchObject({ clienteId: op.clienteId, formaPagamento: `Crédito 3x — ${op.nome}` });
    expect(
      pedido.titulo!.parcelas.map((p) => [p.dataVencimento.toISOString().slice(0, 10), Number(p.valorOriginal)]),
    ).toEqual([
      ["2026-12-10", 33.33],
      ["2027-01-09", 33.33],
      ["2027-02-08", 33.34],
    ]);
    expect(pedido.tituloTaxa).toMatchObject({
      tipo: "PAGAR",
      fornecedorId: op.fornecedorId,
      categoriaFinanceiraId: op.categoriaTaxaId,
      classificacaoFiscal: "GERENCIAL",
      documento: `Taxa PV-${r.numero}`,
    });
    expect(pedido.tituloTaxa!.parcelas.map((p) => [p.numero, Number(p.valorOriginal)])).toEqual([
      [1, 0.99],
      [2, 0.99],
      [3, 1.02],
    ]);
    const baixas = await prisma.baixa.count({
      where: { parcela: { tituloId: { in: [pedido.tituloId!, pedido.tituloTaxaId!] } } },
    });
    expect(baixas).toBe(0);
  });

  test("Pix na maquininha com taxa 0 não cria título de taxa", async () => {
    const r = await criarPedido(fx.sessao("VENDAS"), await venda({ modalidadeCartao: "PIX_MAQUININHA" }));
    const pedido = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: r.pedidoId } });
    expect(pedido.tituloTaxaId).toBeNull();
    expect(pedido.parcelasCartao).toBe(1);
  });

  test("a taxa fica congelada no pedido", async () => {
    const r = await criarPedido(fx.sessao("VENDAS"), await venda({ modalidadeCartao: "DEBITO" }));
    const onde = { operadoraId: op.id, modalidade: "DEBITO" as const };
    await prisma.condicaoOperadoraCartao.updateMany({ where: onde, data: { taxaPercentual: 9 } });
    const pedido = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: r.pedidoId } });
    expect(Number(pedido.taxaCartaoPercentual)).toBe(1.5);
    await prisma.condicaoOperadoraCartao.updateMany({ where: onde, data: { taxaPercentual: 1.5 } });
  });

  test("recusas", async () => {
    await expect(
      criarPedido(fx.sessao("VENDAS"), await venda({ modalidadeCartao: "CREDITO_PARCELADO", parcelasCartao: "8" })),
    ).rejects.toThrow("não tem condição para Crédito parcelado em 8x");

    const semOperadora = pedidoVendaSchema.safeParse(await campos({ operadoraCartaoId: "", modalidadeCartao: "DEBITO" }));
    expect(semOperadora.error?.issues[0].message).toBe("Selecione a operadora");
    const semParcelas = pedidoVendaSchema.safeParse(await campos({ modalidadeCartao: "CREDITO_PARCELADO" }));
    expect(semParcelas.error?.issues[0].message).toBe("Informe as parcelas (2 a 12)");

    const outra = await criarOperadoraDeTeste(fx, cat, cad);
    await prisma.operadoraCartao.update({ where: { id: outra.id }, data: { ativo: false } });
    await expect(
      criarPedido(fx.sessao("VENDAS"), await venda({ operadoraCartaoId: outra.id, modalidadeCartao: "DEBITO" })),
    ).rejects.toThrow("Operadora não encontrada ou inativa");
  });
});
