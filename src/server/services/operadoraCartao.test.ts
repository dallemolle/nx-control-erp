import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { operadoraCartaoSchema } from "@/lib/schemas/operadoraCartao";
import {
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import { atualizarOperadora, criarOperadora, definirAtivoOperadora, listarOperadoras } from "./operadoraCartao";

const DEBITO = { modalidade: "DEBITO", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 1.5, prazoDias: 1, antecipado: false };

describe("operadora de cartão", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  let seq = 0;
  const cnpj = () => `12.345.${String(Date.now()).slice(-3)}/0001-${String(10 + ++seq).padStart(2, "0")}`;

  const dados = (extra: Record<string, unknown> = {}) =>
    operadoraCartaoSchema.parse({
      nome: `Stone ${++seq}`,
      cnpjCpf: cnpj(),
      contaBancariaId: cad.contaCorrenteId,
      categoriaTaxaId: cat.categoriaCompraId,
      condicoes: JSON.stringify([DEBITO]),
      ...extra,
    });

  beforeAll(async () => {
    fx = await criarFixtureProducao("operadora");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("cria cliente e fornecedor pelo CNPJ e grava as condições", async () => {
    const entrada = dados();
    const op = await criarOperadora(fx.sessao("FINANCEIRO"), entrada);
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: op.fornecedorId } });
    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: op.clienteId } });
    expect(fornecedor).toMatchObject({ nome: entrada.nome, cnpjCpf: entrada.cnpjCpf });
    expect(cliente).toMatchObject({ nome: entrada.nome, cnpjCpf: entrada.cnpjCpf });
    const lida = (await listarOperadoras(fx.filialAId)).find((o) => o.id === op.id)!;
    expect(lida.condicoes).toHaveLength(1);
    expect(Number(lida.condicoes[0].taxaPercentual)).toBe(1.5);
  });

  test("reaproveita cliente e fornecedor existentes", async () => {
    const entrada = dados();
    const fornecedor = await prisma.fornecedor.create({
      data: { empresaId: fx.empresaId, nome: "Já existia", cnpjCpf: entrada.cnpjCpf },
    });
    const op = await criarOperadora(fx.sessao("FINANCEIRO"), entrada);
    expect(op.fornecedorId).toBe(fornecedor.id);
  });

  test("recusa fornecedor inativo com o CNPJ", async () => {
    const entrada = dados();
    await prisma.fornecedor.create({
      data: { empresaId: fx.empresaId, nome: "Inativo", cnpjCpf: entrada.cnpjCpf, ativo: false },
    });
    await expect(criarOperadora(fx.sessao("FINANCEIRO"), entrada)).rejects.toThrow(
      "O fornecedor com este CNPJ está inativo; reative o cadastro",
    );
  });

  test("recusa conta Caixa, categoria de receita, nome repetido e perfil sem permissão", async () => {
    await expect(criarOperadora(fx.sessao("FINANCEIRO"), dados({ contaBancariaId: cad.contaCaixaId }))).rejects.toThrow(
      "A conta de depósito não pode ser uma conta Caixa",
    );
    await expect(
      criarOperadora(fx.sessao("FINANCEIRO"), dados({ categoriaTaxaId: cad.categoriaVendaId })),
    ).rejects.toThrow("A categoria da taxa deve ser de despesa");
    const primeira = dados();
    await criarOperadora(fx.sessao("FINANCEIRO"), primeira);
    await expect(criarOperadora(fx.sessao("FINANCEIRO"), { ...dados(), nome: primeira.nome })).rejects.toThrow(
      "Já existe uma operadora com este nome",
    );
    await expect(criarOperadora(fx.sessao("PRODUCAO"), dados())).rejects.toThrow(PermissionError);
  });

  test("schema recusa faixas sobrepostas", () => {
    const parcelado = { ...DEBITO, modalidade: "CREDITO_PARCELADO", taxaPercentual: 3, prazoDias: 30 };
    const r = operadoraCartaoSchema.safeParse({
      nome: "Cielo",
      cnpjCpf: cnpj(),
      contaBancariaId: cad.contaCorrenteId,
      categoriaTaxaId: cat.categoriaCompraId,
      condicoes: JSON.stringify([
        { ...parcelado, parcelasDe: 2, parcelasAte: 6 },
        { ...parcelado, parcelasDe: 5, parcelasAte: 12 },
      ]),
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("As faixas do parcelado se sobrepõem");
  });

  test("atualizar troca as condições e inativar marca a operadora", async () => {
    const op = await criarOperadora(fx.sessao("FINANCEIRO"), dados());
    const novos = dados({
      condicoes: JSON.stringify([{ ...DEBITO, modalidade: "CREDITO_VISTA", taxaPercentual: 2.5, prazoDias: 30 }]),
    });
    await atualizarOperadora(fx.sessao("FINANCEIRO"), op.id, novos);
    const condicoes = await prisma.condicaoOperadoraCartao.findMany({ where: { operadoraId: op.id } });
    expect(condicoes.map((c) => c.modalidade)).toEqual(["CREDITO_VISTA"]);
    await definirAtivoOperadora(fx.sessao("FINANCEIRO"), op.id, false);
    expect((await prisma.operadoraCartao.findUniqueOrThrow({ where: { id: op.id } })).ativo).toBe(false);
  });
});
