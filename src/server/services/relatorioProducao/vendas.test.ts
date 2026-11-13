import { afterAll, beforeAll, describe, expect, test } from "vitest";
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
} from "../producaoTestFixtures";
import { cancelarPedido, criarPedido } from "../pedidoVenda";
import { buscarPainelProducao } from "./painel";
import { buscarRelatorioVendas, type RelatorioVendas } from "./vendas";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("relatório de vendas", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let r: RelatorioVendas;
  const adm = () => fx.sessao("ADMINISTRADOR");
  const periodo = { inicio: d("2026-11-01"), fim: d("2026-11-30") };
  const hoje = d("2026-11-20");

  const vender = (
    data: string,
    clienteId: string,
    loteId: string,
    kg: number,
    preco: number,
    extra: Record<string, unknown> = {},
  ) =>
    criarPedido(
      adm(),
      pedidoVendaSchema.parse({
        data,
        clienteId,
        formaPagamento: "A_PRAZO",
        vencimento: "2026-12-31",
        retiraNaPropriedade: "true",
        itens: JSON.stringify([{ loteId, quantidadeKg: kg, precoKg: preco }]),
        ...extra,
      }),
    );
  const avista = (forma: string) => ({ formaPagamento: forma, vencimento: "" });

  beforeAll(async () => {
    fx = await criarFixtureProducao("vendas");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
    const mercado = await prisma.cliente.create({
      data: { empresaId: fx.empresaId, nome: "Mercado B", canalVenda: "VAREJO" },
    });
    const antigo = await prisma.cliente.create({ data: { empresaId: fx.empresaId, nome: "Cliente antigo" } });
    const lote = (produtoId: string, custoKg: number) =>
      criarLoteDeTeste(fx, {
        produtoId,
        localId: cat.localCamaraId,
        kg: 100,
        custoKg,
        data: d("2026-10-01"),
        validade: d("2027-10-01"),
      });
    const agc = await lote(cat.produtoPolpaId, 4);
    const cpc = await lote(cat.produtoPolpaOutraId, 5);

    await vender("2026-10-15", antigo.id, agc.id, 10, 30);
    await vender("2026-11-05", cad.clienteId, agc.id, 20, 30);
    await vender("2026-11-06", cad.clienteId, cpc.id, 4, 20, { ...avista("PIX"), canal: "VAREJO" });
    await vender("2026-11-07", mercado.id, cpc.id, 10, 20, avista("DINHEIRO"));
    await vender("2026-11-08", cad.clienteFiscalId, agc.id, 5, 32, avista("PIX"));
    const p6 = await vender("2026-11-09", mercado.id, agc.id, 2, 30, avista("PIX"));
    await cancelarPedido(adm(), p6.pedidoId, "Desistiu");
    await vender("2026-12-01", mercado.id, agc.id, 1, 30, avista("PIX"));

    r = await buscarRelatorioVendas(adm(), periodo, hoje);
  }, 60_000);

  afterAll(async () => {
    await fx.limpar();
  });

  test("total do período e a receber de hoje", () => {
    expect(r.total).toMatchObject({ kg: 39, faturamento: 1040, custo: 170, margem: 870, aReceber: 900 });
  });

  test("por cliente: canal principal, a receber e quem só tem saldo", () => {
    expect(r.porCliente.map((c) => [c.cliente, c.kg, c.faturamento, c.margem, c.canal, c.aReceber])).toEqual([
      ["Cliente exemplo", 24, 680, 580, "ATACADO", 600],
      ["Mercado B", 10, 200, 150, "VAREJO", 0],
      ["Cliente fiscal", 5, 160, 140, null, 0],
      ["Cliente antigo", 0, 0, 0, null, 300],
    ]);
  });

  test("por produto, canal e forma", () => {
    expect(r.porProduto.map((p) => [p.produto.split(" · ")[0], p.kg, p.faturamento, p.custoMedio])).toEqual([
      ["AGC", 25, 760, 4],
      ["CPC", 14, 280, 5],
    ]);
    expect(r.porCanal.map((c) => [c.canal, c.kg, c.faturamento])).toEqual([
      ["ATACADO", 20, 600],
      ["VAREJO", 14, 280],
      [null, 5, 160],
    ]);
    expect(r.porForma.map((f) => [f.formaPagamento, f.faturamento, f.aReceber])).toEqual([
      ["A_PRAZO", 600, 900],
      ["PIX", 240, 0],
      ["DINHEIRO", 200, 0],
    ]);
  });

  test("a receber bate com o painel (D-29)", async () => {
    const p = await buscarPainelProducao(adm(), periodo, hoje);
    expect(r.total.aReceber).toBe(p.vendas.aReceber);
    expect(r.total.faturamento).toBe(p.vendas.faturamento);
  });

  test("outra filial não vê nada", async () => {
    const b = await buscarRelatorioVendas(fx.sessao("ADMINISTRADOR", { filial: "B" }), periodo, hoje);
    expect(b.porCliente).toEqual([]);
    expect(b.total.aReceber).toBe(0);
  });
});
