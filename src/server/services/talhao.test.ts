import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import { atualizarTalhao, criarTalhao, definirAtivoTalhao, listarTalhoes } from "./talhao";
import { talhaoSchema, type TalhaoFormValues } from "@/lib/schemas/talhao";

describe("talhão (por filial)", () => {
  let fx: FixtureProducao;
  let frutaId: string;
  const dados = (nome: string, extra: Partial<TalhaoFormValues> = {}): TalhaoFormValues => ({
    nome,
    frutaId,
    areaHa: 2.5,
    anoPlantio: 2015,
    espacamento: null,
    observacao: null,
    ...extra,
  });

  beforeAll(async () => {
    fx = await criarFixtureProducao("talhao");
    frutaId = (await prisma.fruta.create({ data: { empresaId: fx.empresaId, nome: "Açaí" } })).id;
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("fica na filial da sessão, com a fruta, e não aparece na outra", async () => {
    const t = await criarTalhao(fx.sessao("PRODUCAO"), dados("Talhão 1"));
    expect(t.filialId).toBe(fx.filialAId);
    const lista = await listarTalhoes(fx.filialAId);
    expect(lista.find((x) => x.id === t.id)?.fruta.nome).toBe("Açaí");
    expect((await listarTalhoes(fx.filialBId)).map((x) => x.nome)).not.toContain("Talhão 1");
  });

  test("mesmo nome em outra filial é permitido; na mesma, recusado", async () => {
    await expect(criarTalhao(fx.sessao("PRODUCAO", { filial: "B" }), dados("Talhão 1"))).resolves.toBeDefined();
    await expect(criarTalhao(fx.sessao("PRODUCAO"), dados("Talhão 1"))).rejects.toThrow(
      "Já existe um talhão com este nome nesta filial",
    );
  });

  test("não altera nem inativa talhão de outra filial", async () => {
    const t = await criarTalhao(fx.sessao("PRODUCAO"), dados("Talhão 2"));
    await expect(atualizarTalhao(fx.sessao("PRODUCAO", { filial: "B" }), t.id, dados("X"))).rejects.toThrow();
    await expect(definirAtivoTalhao(fx.sessao("PRODUCAO", { filial: "B" }), t.id, false)).rejects.toThrow();
  });

  test("atualiza área e remove o ano de plantio, com auditoria", async () => {
    const t = await criarTalhao(fx.sessao("PRODUCAO"), dados("Talhão 4"));
    await atualizarTalhao(fx.sessao("PRODUCAO"), t.id, dados("Talhão 4", { areaHa: 3.75, anoPlantio: undefined }));
    const gravado = await prisma.talhao.findUniqueOrThrow({ where: { id: t.id } });
    expect(Number(gravado.areaHa)).toBe(3.75);
    expect(gravado.anoPlantio).toBeNull();
    expect(await prisma.auditLog.count({ where: { entidadeId: t.id } })).toBe(2);
  });

  test("recusa fruta de outra empresa; VENDAS não escreve", async () => {
    const alheia = await prisma.fruta.create({ data: { empresaId: fx.outraEmpresaId, nome: "Açaí" } });
    await expect(criarTalhao(fx.sessao("PRODUCAO"), dados("Talhão 3", { frutaId: alheia.id }))).rejects.toThrow(
      "Fruta não encontrada ou inativa",
    );
    await expect(criarTalhao(fx.sessao("VENDAS"), dados("Talhão 5"))).rejects.toThrow(PermissionError);
  });

  test("schema: área > 0 e ano entre 1950 e o ano atual", () => {
    const base = { nome: "Talhão", frutaId: "f", areaHa: "1", anoPlantio: "" };
    expect(talhaoSchema.safeParse({ ...base, areaHa: "0" }).success).toBe(false);
    expect(talhaoSchema.safeParse({ ...base, anoPlantio: "1900" }).success).toBe(false);
    expect(talhaoSchema.safeParse({ ...base, anoPlantio: String(new Date().getFullYear() + 1) }).success).toBe(false);
    expect(talhaoSchema.parse(base).anoPlantio).toBeUndefined();
  });
});
