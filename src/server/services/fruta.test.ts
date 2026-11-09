import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { FilialSomenteLeituraError, PermissionError } from "@/server/auth/permissions";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import { atualizarFruta, criarFruta, definirAtivoFruta, listarFrutas, requireFrutaAtiva } from "./fruta";

const nova = (nome: string) => ({ nome, custoPadraoKg: 0, exigeBranqueamento: false });

describe("fruta (por empresa)", () => {
  let fx: FixtureProducao;
  beforeAll(async () => {
    fx = await criarFixtureProducao("fruta");
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("PRODUCAO cria, atualiza e inativa, com auditoria", async () => {
    const sessao = fx.sessao("PRODUCAO");
    const fruta = await criarFruta(sessao, { nome: "Açaí", custoPadraoKg: 1.5, exigeBranqueamento: true });
    expect(fruta.empresaId).toBe(fx.empresaId);
    await atualizarFruta(sessao, fruta.id, { nome: "Açaí", custoPadraoKg: 2, exigeBranqueamento: true });
    await definirAtivoFruta(sessao, fruta.id, false);
    const gravada = await prisma.fruta.findUniqueOrThrow({ where: { id: fruta.id } });
    expect(Number(gravada.custoPadraoKg)).toBe(2);
    expect(gravada.ativo).toBe(false);
    const acoes = await prisma.auditLog.findMany({ where: { entidadeId: fruta.id }, select: { acao: true } });
    expect(acoes.map((a) => a.acao).sort()).toEqual(["ATUALIZAR", "CRIAR", "INATIVAR"]);
  });

  test("é da empresa: visível pela listagem da empresa", async () => {
    await criarFruta(fx.sessao("PRODUCAO", { filial: "B" }), nova("Acerola"));
    const nomes = (await listarFrutas(fx.empresaId)).map((f) => f.nome);
    expect(nomes).toContain("Acerola");
  });

  test("somenteAtivas filtra as inativas", async () => {
    const f = await criarFruta(fx.sessao("PRODUCAO"), nova("Bacuri"));
    await definirAtivoFruta(fx.sessao("PRODUCAO"), f.id, false);
    const nomes = (await listarFrutas(fx.empresaId, { somenteAtivas: true })).map((x) => x.nome);
    expect(nomes).not.toContain("Bacuri");
  });

  test("nome repetido é recusado com mensagem", async () => {
    await criarFruta(fx.sessao("PRODUCAO"), nova("Cupuaçu"));
    await expect(criarFruta(fx.sessao("PRODUCAO"), nova("Cupuaçu"))).rejects.toThrow(
      "Já existe uma fruta com este nome",
    );
  });

  test("FINANCEIRO não escreve; filial somente leitura é recusada", async () => {
    await expect(criarFruta(fx.sessao("FINANCEIRO"), nova("Bacaba"))).rejects.toThrow(PermissionError);
    await expect(criarFruta(fx.sessao("PRODUCAO", { somenteLeitura: true }), nova("Bacaba"))).rejects.toThrow(
      FilialSomenteLeituraError,
    );
  });

  test("não altera nem inativa fruta de outra empresa", async () => {
    const alheia = await prisma.fruta.create({ data: { empresaId: fx.outraEmpresaId, nome: "Alheia" } });
    await expect(atualizarFruta(fx.sessao("PRODUCAO"), alheia.id, nova("Tomada"))).rejects.toThrow();
    await expect(definirAtivoFruta(fx.sessao("PRODUCAO"), alheia.id, false)).rejects.toThrow();
    expect((await prisma.fruta.findUniqueOrThrow({ where: { id: alheia.id } })).nome).toBe("Alheia");
  });

  test("requireFrutaAtiva recusa inativa e de outra empresa", async () => {
    const inativa = await criarFruta(fx.sessao("PRODUCAO"), nova("Inativa"));
    await definirAtivoFruta(fx.sessao("PRODUCAO"), inativa.id, false);
    await expect(requireFrutaAtiva(fx.empresaId, inativa.id)).rejects.toThrow("Fruta não encontrada ou inativa");
    const alheia = await prisma.fruta.create({ data: { empresaId: fx.outraEmpresaId, nome: "Alheia 2" } });
    await expect(requireFrutaAtiva(fx.empresaId, alheia.id)).rejects.toThrow("Fruta não encontrada ou inativa");
    const ativa = await criarFruta(fx.sessao("PRODUCAO"), nova("Ativa"));
    await expect(requireFrutaAtiva(fx.empresaId, ativa.id)).resolves.toBeUndefined();
  });
});
