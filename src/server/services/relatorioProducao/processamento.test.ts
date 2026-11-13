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
import {
  criarCatalogoDeTeste,
  criarFixtureProducao,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "../producaoTestFixtures";
import { criarRecepcao } from "../recepcaoFruto";
import {
  adicionarConsumo,
  adicionarInsumo,
  adicionarProducao,
  atualizarProcessoOP,
  cancelarOP,
  criarOP,
  encerrarOP,
  removerProducao,
} from "../ordemProducao";
import { buscarPainelProducao } from "./painel";
import { buscarRelatorioProcessamento, type RelatorioProcessamento } from "./processamento";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("relatório de processamento", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let r: RelatorioProcessamento;
  const adm = () => fx.sessao("ADMINISTRADOR");
  const periodo = { inicio: d("2026-11-01"), fim: d("2026-11-30") };
  const BRANQUEAMENTO = { branqueamentoTemperaturaC: "85", branqueamentoTempoS: "12" };

  const lote = async (data: string, produtoId: string, talhaoId: string, kg: number) =>
    (
      await criarRecepcao(
        adm(),
        recepcaoSchema.parse({
          data,
          localId: cat.localRecepcaoId,
          unidade: "KG",
          descarte: "0",
          produtoId,
          origem: "PROPRIA",
          talhaoId,
          pesoBruto: String(kg),
        }),
      )
    ).loteId;
  const novaOP = (data: string, frutaId: string) => criarOP(adm(), cabecalhoOPSchema.parse({ data, frutaId }));
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

  beforeAll(async () => {
    fx = await criarFixtureProducao("processamento");
    cat = await criarCatalogoDeTeste(fx);
    const talhaoC = await prisma.talhao.create({
      data: { filialId: fx.filialAId, nome: "Talhão C", frutaId: cat.outraFrutaId, areaHa: 1 },
    });
    const FA = cat.produtoFrutoId;
    const FC = cat.produtoFrutoOutraId;

    // Fora do período.
    const op0 = await novaOP("2026-10-20", cat.frutaId);
    await consumir(op0.id, await lote("2026-10-20", FA, cat.talhaoId, 20), 20);
    await produzir(op0.id, cat.produtoPolpaId, 10);
    await processo(op0.id, { carocoResiduoKg: "10", ...BRANQUEAMENTO });
    await encerrarOP(adm(), op0.id, { confirmarVerificar: false });

    // Açaí, encerrada, balanço OK; uma polpa removida e um insumo.
    const a1 = await novaOP("2026-11-05", cat.frutaId);
    await consumir(a1.id, await lote("2026-11-05", FA, cat.talhaoId, 100), 100);
    await produzir(a1.id, cat.produtoPolpaId, 40);
    const removida = await produzir(a1.id, cat.produtoPolpaId, 5);
    await removerProducao(adm(), removida.id);
    await adicionarInsumo(adm(), a1.id, insumoOPSchema.parse({ insumoId: cat.insumoId, quantidade: 10 }));
    await processo(a1.id, { aguaLitros: "20", carocoResiduoKg: "70", perdaKg: "9", ...BRANQUEAMENTO });
    await encerrarOP(adm(), a1.id, { confirmarVerificar: false });

    // Açaí, encerrada, balanço "Verificar" (5 de 50 = 10%).
    const a2 = await novaOP("2026-11-06", cat.frutaId);
    await consumir(a2.id, await lote("2026-11-06", FA, cat.talhaoId, 50), 50);
    await produzir(a2.id, cat.produtoPolpaId, 25);
    await processo(a2.id, { carocoResiduoKg: "20", ...BRANQUEAMENTO });
    await encerrarOP(adm(), a2.id, { confirmarVerificar: true });

    // Açaí, aberta, sem polpa ainda.
    const a3 = await novaOP("2026-11-07", cat.frutaId);
    await consumir(a3.id, await lote("2026-11-07", FA, cat.talhaoId, 30), 30);

    // Cupuaçu, encerrada.
    const c1 = await novaOP("2026-11-08", cat.outraFrutaId);
    await consumir(c1.id, await lote("2026-11-08", FC, talhaoC.id, 40), 40);
    await produzir(c1.id, cat.produtoPolpaOutraId, 16);
    await processo(c1.id, { carocoResiduoKg: "20", perdaKg: "4" });
    await encerrarOP(adm(), c1.id, { confirmarVerificar: false });

    // Cupuaçu, cancelada.
    const c2 = await novaOP("2026-11-09", cat.outraFrutaId);
    await consumir(c2.id, await lote("2026-11-09", FC, talhaoC.id, 10), 10);
    await cancelarOP(adm(), c2.id, "Teste");

    r = await buscarRelatorioProcessamento(adm(), periodo);
  }, 90_000);

  afterAll(async () => {
    await fx.limpar();
  });

  test("uma linha por fruta com OP no período", () => {
    expect(r.porFruta.map((l) => l.fruta)).toEqual(["Açaí", "Cupuaçu"]);
  });

  test("resumo: volume com aberta; mín./máx. e custo só de encerradas", () => {
    const [acai, cupu] = r.porFruta;
    expect(acai.volume).toMatchObject({ quantidade: 3, frutoKg: 180, polpaKg: 65 });
    expect(acai).toMatchObject({ encerradas: 2, rendimentoMin: 0.4, rendimentoMax: 0.5 });
    expect(acai.volume.custoMedioPolpa).toBeCloseTo(230 / 65);
    expect(cupu.volume).toMatchObject({ quantidade: 1, frutoKg: 40, polpaKg: 16, custoMedioPolpa: 5 });
  });

  test("balanço de massa das encerradas", () => {
    expect(r.porFruta[0].balanco).toMatchObject({
      frutoKg: 150,
      aguaKg: 20,
      polpaKg: 65,
      carocoResiduoKg: 90,
      perdaKg: 9,
      diferencaKg: 6,
      opsVerificar: 1,
    });
    expect(r.porFruta[1].balanco).toMatchObject({ diferencaKg: 0, percentual: 0, opsVerificar: 0 });
  });

  test("custo das encerradas, com insumo", () => {
    expect(r.porFruta[0].custo).toMatchObject({ custoFruto: 225, custoInsumos: 5, custoTotal: 230, polpaKg: 65 });
    expect(r.porFruta[1].custo).toMatchObject({ custoFruto: 80, custoInsumos: 0, custoTotal: 80, custoKg: 5 });
    expect(r.total.custo.custoTotal).toBe(310);
  });

  test("volume bate com o painel (D-29)", async () => {
    const p = await buscarPainelProducao(adm(), periodo, d("2026-11-20"));
    expect(r.total.volume).toEqual(p.processamento);
  });

  test("outra filial não vê nada", async () => {
    const b = await buscarRelatorioProcessamento(fx.sessao("ADMINISTRADOR", { filial: "B" }), periodo);
    expect(b.porFruta).toEqual([]);
    expect(b.total.volume.quantidade).toBe(0);
  });
});
