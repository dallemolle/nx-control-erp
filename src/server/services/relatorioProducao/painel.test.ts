import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import {
  cabecalhoOPSchema,
  consumoSchema,
  insumoOPSchema,
  processoOPSchema,
  producaoSchema,
} from "@/lib/schemas/ordemProducao";
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
import { cancelarRecepcao, criarRecepcao } from "../recepcaoFruto";
import {
  adicionarConsumo,
  adicionarInsumo,
  adicionarProducao,
  atualizarProcessoOP,
  cancelarOP,
  criarOP,
  encerrarOP,
} from "../ordemProducao";
import { cancelarPedido, criarPedido } from "../pedidoVenda";
import { buscarPainelProducao, type PainelProducao } from "./painel";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("painel de produção", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let painel: PainelProducao;
  let valorEsperado = 0;
  const adm = () => fx.sessao("ADMINISTRADOR");
  const periodo = { inicio: d("2026-11-01"), fim: d("2026-11-30") };
  const hoje = d("2026-11-20");

  const receber = (extra: Record<string, unknown>) =>
    criarRecepcao(
      adm(),
      recepcaoSchema.parse({ data: "2026-11-10", localId: cat.localRecepcaoId, unidade: "KG", descarte: "0", ...extra }),
    );
  const consumir = (opId: string, loteId: string, kg: number) =>
    adicionarConsumo(adm(), opId, consumoSchema.parse({ loteId, quantidadeKg: kg, motivoLiberacaoVencido: "" }));
  const produzir = (opId: string, produtoId: string, kg: number) =>
    adicionarProducao(adm(), opId, producaoSchema.parse({ produtoId, quantidadeKg: kg, localId: cat.localCamaraId }));
  const processo = (opId: string, dados: Record<string, string>) =>
    atualizarProcessoOP(adm(), opId, processoOPSchema.parse({ aguaLitros: "0", perdaKg: "0", carocoResiduoKg: "0", ...dados }));
  const vender = (data: string, loteId: string, kg: number, preco: number, extra: Record<string, unknown> = {}) =>
    criarPedido(
      adm(),
      pedidoVendaSchema.parse({
        data,
        clienteId: cad.clienteId,
        formaPagamento: "A_PRAZO",
        vencimento: "2026-12-31",
        retiraNaPropriedade: "true",
        itens: JSON.stringify([{ loteId, quantidadeKg: kg, precoKg: preco }]),
        ...extra,
      }),
    );

  beforeAll(async () => {
    fx = await criarFixtureProducao("painel");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: cat.categoriaCompraId },
    });

    const fa = { produtoId: cat.produtoFrutoId };
    const r1 = await receber({ ...fa, origem: "PROPRIA", talhaoId: cat.talhaoId, pesoBruto: "100", descarte: "10" });
    const r2 = await receber({ ...fa, origem: "TERCEIRO", fornecedorId: cat.fornecedorId, pesoBruto: "50", preco: "2" });
    const r3 = await receber({
      produtoId: cat.produtoFrutoOutraId,
      origem: "TERCEIRO",
      fornecedorId: cat.fornecedorId,
      pesoBruto: "40",
      descarte: "4",
      preco: "3",
    });
    const r4 = await receber({ ...fa, origem: "PROPRIA", talhaoId: cat.talhaoId, pesoBruto: "20" });
    await cancelarRecepcao(adm(), r4.recepcaoId, "Lançada em dobro");
    await receber({ ...fa, data: "2026-10-25", origem: "PROPRIA", talhaoId: cat.talhaoId, pesoBruto: "30" });

    const op1 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op1.id, r1.loteId, 60);
    await consumir(op1.id, r2.loteId, 50);
    const agc = await produzir(op1.id, cat.produtoPolpaId, 40);
    const afn = await produzir(op1.id, cat.produtoPolpaFinoId, 20);
    await adicionarInsumo(adm(), op1.id, insumoOPSchema.parse({ insumoId: cat.insumoId, quantidade: 10 }));
    await processo(op1.id, { carocoResiduoKg: "48", perdaKg: "2", branqueamentoTemperaturaC: "85", branqueamentoTempoS: "12" });
    await encerrarOP(adm(), op1.id, { confirmarVerificar: false });

    const op2 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op2.id, r1.loteId, 20);
    await produzir(op2.id, cat.produtoPolpaId, 10);

    const op3 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.outraFrutaId }));
    await consumir(op3.id, r3.loteId, 30);
    const cpc = await produzir(op3.id, cat.produtoPolpaOutraId, 12);
    await processo(op3.id, { carocoResiduoKg: "15", perdaKg: "3" });
    await encerrarOP(adm(), op3.id, { confirmarVerificar: false });

    const op4 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op4.id, r1.loteId, 5);
    await produzir(op4.id, cat.produtoPolpaId, 2);
    await cancelarOP(adm(), op4.id, "Teste");

    await vender("2026-11-12", agc.loteId, 10, 30, { retiraNaPropriedade: "false" });
    await vender("2026-11-10", r1.loteId, 5, 8, { formaPagamento: "PIX", vencimento: "" });
    await vender("2026-11-12", cpc.loteId, 6, 20, {
      formaPagamento: "PIX",
      vencimento: "",
      retiraNaPropriedade: "false",
      entregaDataPrevista: "2026-11-25",
    });
    const p4 = await vender("2026-11-12", afn.loteId, 5, 25);
    await cancelarPedido(adm(), p4.pedidoId, "Desistiu");
    await vender("2026-12-01", afn.loteId, 4, 25);

    await criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: cat.localCamaraId,
      kg: 8,
      custoKg: 4,
      data: d("2026-11-01"),
      validade: d("2026-12-10"),
    });
    await criarLoteDeTeste(fx, {
      produtoId: cat.produtoFrutoOutraId,
      localId: cat.localRecepcaoId,
      kg: 25,
      custoKg: 2,
      data: d("2026-11-19"),
      validade: d("2026-11-22"),
    });

    // Valor do estoque conferido pelo banco: o custo provisório da OP aberta não é regra deste painel.
    const lotes = await prisma.lote.findMany({ where: { filialId: fx.filialAId, saldoKg: { gt: 0 } } });
    valorEsperado = Math.round(lotes.reduce((s, l) => s + Number(l.saldoKg) * Number(l.custoKg), 0) * 100) / 100;

    painel = await buscarPainelProducao(adm(), periodo, hoje);
  }, 60_000);

  afterAll(async () => {
    await fx.limpar();
  });

  const fruta = (id: string) => painel.porFruta.find((f) => f.frutaId === id)!;

  test("recepção por fruta e total (RN-33, descarte)", () => {
    expect(fruta(cat.frutaId).recepcao).toMatchObject({ recebidoKg: 140, terceirosKg: 50, brutoKg: 150, descarteKg: 10 });
    expect(fruta(cat.frutaId).recepcao?.percentualTerceiros).toBeCloseTo(50 / 140, 10);
    expect(fruta(cat.outraFrutaId).recepcao).toMatchObject({ recebidoKg: 36, terceirosKg: 36, percentualTerceiros: 1 });
    expect(painel.recepcao).toMatchObject({ recebidoKg: 176, terceirosKg: 86, brutoKg: 190, descarteKg: 14 });
  });

  test("processamento: aberta no volume, custo só das encerradas, cancelada fora", () => {
    expect(fruta(cat.frutaId).processamento).toMatchObject({ quantidade: 2, frutoKg: 130, polpaKg: 70 });
    expect(fruta(cat.frutaId).processamento?.custoMedioPolpa).toBeCloseTo(3.25, 10);
    expect(fruta(cat.outraFrutaId).processamento).toMatchObject({ quantidade: 1, frutoKg: 30, polpaKg: 12 });
    expect(fruta(cat.outraFrutaId).processamento?.custoMedioPolpa).toBeCloseTo(7.5, 10);
    expect(painel.processamento).toMatchObject({ quantidade: 3, frutoKg: 160, polpaKg: 82 });
    expect(painel.processamento.rendimento).toBeCloseTo(82 / 160, 10);
    expect(painel.processamento.custoMedioPolpa).toBeCloseTo(285 / 72, 10);
  });

  test("vendas do período e a receber de hoje (RN-22, RN-26, RN-32)", () => {
    expect(painel.vendas).toMatchObject({
      faturamento: 460,
      faturamentoInNatura: 40,
      faturamentoPolpa: 420,
      kgVendidos: 21,
      pedidos: 3,
      margem: 375,
      aReceber: 400,
    });
    expect(painel.vendas.ticketMedio).toBeCloseTo(460 / 3, 10);
    expect(painel.vendas.margemPercentual).toBeCloseTo(375 / 460, 10);
    expect(fruta(cat.frutaId).faturamentoPolpa).toBe(300);
    expect(fruta(cat.outraFrutaId).faturamentoPolpa).toBe(120);
    expect(painel.vendasPorProduto.map((p) => [p.produto.split(" · ")[0], p.kg, p.faturamento])).toEqual([
      ["AGC", 10, 300],
      ["CPC", 6, 120],
      ["FA", 5, 40],
    ]);
  });

  test("estoque e alertas olham para hoje", () => {
    expect(painel.estoque).toEqual({ polpaKg: 70, frutoAguardandoKg: 25, valor: valorEsperado });
    expect(painel.alertas).toEqual({
      lotesVencendo: { quantidade: 1, kg: 8 },
      lotesVencidos: { quantidade: 3, kg: 41 },
      entregasAbertas: 2,
      entregasAtrasadas: 1,
      opsBalanco: 1,
      opsBranqueamento: 1,
    });
    expect(Object.fromEntries(painel.estoquePorProduto.map((p) => [p.produto.split(" · ")[0], p.saldoKg]))).toEqual({
      AFN: 16,
      AGC: 48,
      CPC: 6,
      FA: 35,
      FC: 31,
    });
  });

  test("outra filial não vê nada", async () => {
    const b = await buscarPainelProducao(fx.sessao("ADMINISTRADOR", { filial: "B" }), periodo, hoje);
    expect(b.porFruta).toEqual([]);
    expect(b.vendas.faturamento).toBe(0);
    expect(b.vendas.aReceber).toBe(0);
  });
});
