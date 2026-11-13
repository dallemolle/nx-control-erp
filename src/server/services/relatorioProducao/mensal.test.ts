import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import { cabecalhoOPSchema, consumoSchema, processoOPSchema, producaoSchema } from "@/lib/schemas/ordemProducao";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "../producaoTestFixtures";
import { cancelarRecepcao, criarRecepcao } from "../recepcaoFruto";
import {
  adicionarConsumo,
  adicionarProducao,
  atualizarProcessoOP,
  cancelarOP,
  criarOP,
  encerrarOP,
} from "../ordemProducao";
import { cancelarPedido, criarPedido } from "../pedidoVenda";
import { buscarPainelProducao } from "./painel";
import { buscarRelatorioMensal, type RelatorioMensal } from "./mensal";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("relatório mensal", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let r: RelatorioMensal;
  const adm = () => fx.sessao("ADMINISTRADOR");

  const receber = (data: string, extra: Record<string, unknown>) =>
    criarRecepcao(
      adm(),
      recepcaoSchema.parse({ data, localId: cat.localRecepcaoId, unidade: "KG", descarte: "0", ...extra }),
    );
  const consumir = (opId: string, loteId: string, kg: number) =>
    adicionarConsumo(adm(), opId, consumoSchema.parse({ loteId, quantidadeKg: kg, motivoLiberacaoVencido: "" }));
  const produzir = (opId: string, produtoId: string, kg: number) =>
    adicionarProducao(adm(), opId, producaoSchema.parse({ produtoId, quantidadeKg: kg, localId: cat.localCamaraId }));
  const processo = (opId: string, dados: Record<string, string>) =>
    atualizarProcessoOP(
      adm(),
      opId,
      processoOPSchema.parse({ aguaLitros: "0", perdaKg: "0", carocoResiduoKg: "0", ...dados }),
    );
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
    fx = await criarFixtureProducao("mensal");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: cat.categoriaCompraId },
    });
    const proprio = { origem: "PROPRIA", talhaoId: cat.talhaoId };
    const terceiro = { origem: "TERCEIRO", fornecedorId: cat.fornecedorId };

    // Ano anterior: não entra.
    await receber("2025-12-20", { produtoId: cat.produtoFrutoId, ...proprio, pesoBruto: "30" });

    // Outubro.
    const rA = await receber("2026-10-05", {
      produtoId: cat.produtoFrutoId,
      ...proprio,
      pesoBruto: "100",
      descarte: "10",
    });
    const rB = await receber("2026-10-05", {
      produtoId: cat.produtoFrutoOutraId,
      ...terceiro,
      pesoBruto: "40",
      descarte: "4",
      preco: "3",
    });
    const op1 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-10-05", frutaId: cat.outraFrutaId }));
    await consumir(op1.id, rB.loteId, 30);
    const cpc = await produzir(op1.id, cat.produtoPolpaOutraId, 12);
    await processo(op1.id, { carocoResiduoKg: "15", perdaKg: "3" });
    await encerrarOP(adm(), op1.id, { confirmarVerificar: false });
    const op2 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-10-05", frutaId: cat.frutaId }));
    await consumir(op2.id, rA.loteId, 50);
    const agc = await produzir(op2.id, cat.produtoPolpaId, 20);
    await processo(op2.id, {
      carocoResiduoKg: "28",
      perdaKg: "2",
      branqueamentoTemperaturaC: "85",
      branqueamentoTempoS: "12",
    });
    await encerrarOP(adm(), op2.id, { confirmarVerificar: false });
    await vender("2026-10-05", rA.loteId, 5, 8, { formaPagamento: "PIX", vencimento: "" });
    await vender("2026-10-05", cpc.loteId, 6, 20);

    // Novembro.
    const rC = await receber("2026-11-10", { produtoId: cat.produtoFrutoId, ...terceiro, pesoBruto: "50", preco: "2" });
    const rD = await receber("2026-11-10", { produtoId: cat.produtoFrutoId, ...proprio, pesoBruto: "20" });
    await cancelarRecepcao(adm(), rD.recepcaoId, "Lançada em dobro");
    const op3 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op3.id, rC.loteId, 40);
    await produzir(op3.id, cat.produtoPolpaFinoId, 15);
    const op4 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op4.id, rC.loteId, 5);
    await produzir(op4.id, cat.produtoPolpaId, 2);
    await cancelarOP(adm(), op4.id, "Teste");
    await vender("2026-11-12", agc.loteId, 10, 30);
    const cancelado = await vender("2026-11-12", agc.loteId, 5, 25);
    await cancelarPedido(adm(), cancelado.pedidoId, "Desistiu");

    r = await buscarRelatorioMensal(adm(), 2026);
  }, 60_000);

  afterAll(async () => {
    await fx.limpar();
  });

  test("frutas com movimento e 13 colunas", () => {
    expect(r.ano).toBe(2026);
    expect(r.frutas.map((f) => f.nome)).toEqual(["Açaí", "Cupuaçu"]);
    expect(r.colunas).toHaveLength(13);
  });

  test("recepção por mês: líquido, terceiros e pago; cancelada e ano anterior fora", () => {
    const [out, nov, tot] = [r.colunas[9], r.colunas[10], r.colunas[12]];
    expect(out.recepcaoPorFruta[cat.frutaId]).toMatchObject({ recebidoKg: 90, terceirosKg: 0 });
    expect(out.recepcaoPorFruta[cat.outraFrutaId]).toMatchObject({ recebidoKg: 36, terceirosKg: 36 });
    expect(out.recepcao.recebidoKg).toBe(126);
    expect(out.pagoTerceiros).toBe(108);
    expect(nov.recepcao).toMatchObject({ recebidoKg: 50, terceirosKg: 50 });
    expect(nov.pagoTerceiros).toBe(100);
    expect(tot.recepcao).toMatchObject({ recebidoKg: 176, terceirosKg: 86 });
    expect(tot.pagoTerceiros).toBe(208);
    expect(r.colunas[11].recepcao.recebidoKg).toBe(0);
  });

  test("processamento por mês: aberta no volume, cancelada fora", () => {
    expect(r.colunas[9].processamentoPorFruta[cat.frutaId]).toMatchObject({ frutoKg: 50, polpaKg: 20 });
    expect(r.colunas[9].processamentoPorFruta[cat.outraFrutaId]).toMatchObject({ frutoKg: 30, polpaKg: 12 });
    expect(r.colunas[9].processamento.quantidade).toBe(2);
    expect(r.colunas[10].processamento).toMatchObject({
      quantidade: 1,
      frutoKg: 40,
      polpaKg: 15,
      custoMedioPolpa: null,
    });
    expect(r.colunas[12].processamento).toMatchObject({ quantidade: 3, frutoKg: 120, polpaKg: 47 });
  });

  test("vendas por mês; pedido cancelado fora", () => {
    expect(r.colunas[9].vendas).toMatchObject({ faturamento: 160, faturamentoInNatura: 40, kgVendidos: 11 });
    expect(r.colunas[9].polpaPorFruta[cat.outraFrutaId]).toBe(120);
    expect(r.colunas[10].vendas).toMatchObject({ faturamento: 300, kgVendidos: 10 });
    expect(r.colunas[10].polpaPorFruta[cat.frutaId]).toBe(300);
    expect(r.colunas[12].vendas).toMatchObject({ faturamento: 460, kgVendidos: 21 });
  });

  test("polpa por produto × mês; OP cancelada fora", () => {
    expect(r.polpaPorProduto.map((p) => [p.produto.split(" · ")[0], p.meses[9], p.meses[10], p.total])).toEqual([
      ["AFN", 0, 15, 15],
      ["AGC", 20, 0, 20],
      ["CPC", 12, 0, 12],
    ]);
  });

  test("cada mês bate com o painel do mesmo mês (D-29)", async () => {
    for (const [m, inicio, fim] of [
      [9, "2026-10-01", "2026-10-31"],
      [10, "2026-11-01", "2026-11-30"],
    ] as const) {
      const p = await buscarPainelProducao(adm(), { inicio: d(inicio), fim: d(fim) }, d("2026-11-20"));
      const c = r.colunas[m];
      expect(c.recepcao).toEqual(p.recepcao);
      expect(c.processamento).toEqual(p.processamento);
      const { aReceber: _, ...vendas } = p.vendas;
      expect(c.vendas).toEqual(vendas);
    }
  });

  test("outra filial não vê nada", async () => {
    const b = await buscarRelatorioMensal(fx.sessao("ADMINISTRADOR", { filial: "B" }), 2026);
    expect(b.frutas).toEqual([]);
    expect(b.colunas[12].vendas.faturamento).toBe(0);
    expect(b.polpaPorProduto).toEqual([]);
  });
});
