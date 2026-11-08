import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import { atualizarProduto, criarProduto, definirAtivoProduto, listarProdutos } from "./produto";
import type { ProdutoFormValues } from "@/lib/schemas/produto";

describe("produto (por empresa)", () => {
  let fx: FixtureProducao;
  let frutaId: string;
  const dados = (sobrescrever: Partial<ProdutoFormValues> = {}): ProdutoFormValues => ({
    codigo: "FA",
    descricao: "Fruto de açaí",
    categoria: "FRUTO",
    frutaId,
    conservacao: "IN_NATURA",
    validadeDias: 1,
    precoReferenciaKg: undefined,
    armazenamento: null,
    unidadeComercial: "rasa",
    fatorUnidadeKg: 14,
    ...sobrescrever,
  });

  beforeAll(async () => {
    fx = await criarFixtureProducao("produto");
    frutaId = (await prisma.fruta.create({ data: { empresaId: fx.empresaId, nome: "Açaí" } })).id;
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("cria com rasa e lista com o nome da fruta", async () => {
    const p = await criarProduto(fx.sessao("PRODUCAO"), dados());
    expect(Number(p.fatorUnidadeKg)).toBe(14);
    expect(p.precoReferenciaKg).toBeNull();
    const lista = await listarProdutos(fx.empresaId);
    expect(lista.find((x) => x.id === p.id)?.fruta.nome).toBe("Açaí");
  });

  test("código repetido na empresa é recusado com mensagem", async () => {
    await expect(criarProduto(fx.sessao("PRODUCAO"), dados())).rejects.toThrow(
      "Já existe um produto com este código",
    );
  });

  test("recusa fruta inativa ou de outra empresa", async () => {
    const alheia = await prisma.fruta.create({ data: { empresaId: fx.outraEmpresaId, nome: "Açaí" } });
    await expect(criarProduto(fx.sessao("PRODUCAO"), dados({ codigo: "X1", frutaId: alheia.id }))).rejects.toThrow(
      "Fruta não encontrada ou inativa",
    );
    const inativa = await prisma.fruta.create({ data: { empresaId: fx.empresaId, nome: "Inativa", ativo: false } });
    await expect(criarProduto(fx.sessao("PRODUCAO"), dados({ codigo: "X2", frutaId: inativa.id }))).rejects.toThrow(
      "Fruta não encontrada ou inativa",
    );
  });

  test("VENDAS não escreve produto", async () => {
    await expect(criarProduto(fx.sessao("VENDAS"), dados({ codigo: "X3" }))).rejects.toThrow(PermissionError);
  });

  test("atualiza, remove a unidade comercial e audita", async () => {
    const p = await criarProduto(fx.sessao("ADMINISTRADOR"), dados({ codigo: "AGC", categoria: "POLPA" }));
    await atualizarProduto(
      fx.sessao("PRODUCAO"),
      p.id,
      dados({ codigo: "AGC", categoria: "POLPA", validadeDias: 300, unidadeComercial: null, fatorUnidadeKg: undefined }),
    );
    const gravado = await prisma.produto.findUniqueOrThrow({ where: { id: p.id } });
    expect(gravado.validadeDias).toBe(300);
    expect(gravado.unidadeComercial).toBeNull();
    expect(gravado.fatorUnidadeKg).toBeNull();
    expect(await prisma.auditLog.count({ where: { entidadeId: p.id } })).toBe(2);
  });

  test("não altera nem inativa produto de outra empresa", async () => {
    const fAlheia = await prisma.fruta.create({ data: { empresaId: fx.outraEmpresaId, nome: "Fruta alheia" } });
    const alheio = await prisma.produto.create({
      data: {
        empresaId: fx.outraEmpresaId,
        codigo: "ZZ",
        descricao: "Alheio",
        categoria: "FRUTO",
        frutaId: fAlheia.id,
        conservacao: "IN_NATURA",
        validadeDias: 1,
      },
    });
    await expect(definirAtivoProduto(fx.sessao("PRODUCAO"), alheio.id, false)).rejects.toThrow();
    await expect(atualizarProduto(fx.sessao("PRODUCAO"), alheio.id, dados({ codigo: "ZZ" }))).rejects.toThrow();
  });
});
