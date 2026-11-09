import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { FilialSomenteLeituraError, PermissionError } from "@/server/auth/permissions";
import { criarFixtureProducao, type FixtureProducao } from "./producaoTestFixtures";
import {
  CONFIGURACAO_PRODUCAO_PADRAO,
  obterConfiguracaoProducao,
  salvarConfiguracaoProducao,
} from "./configuracaoProducao";
import { configuracaoProducaoSchema } from "@/lib/schemas/configuracaoProducao";

describe("configuração de produção", () => {
  let fx: FixtureProducao;
  beforeAll(async () => {
    fx = await criarFixtureProducao("config");
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("sem registro devolve os padrões e não grava", async () => {
    expect(await obterConfiguracaoProducao(fx.filialAId)).toEqual(CONFIGURACAO_PRODUCAO_PADRAO);
    expect(await prisma.configuracaoProducao.count({ where: { filialId: fx.filialAId } })).toBe(0);
  });

  test("salvar cria e depois atualiza (upsert), só na filial da sessão", async () => {
    const valores = { ...CONFIGURACAO_PRODUCAO_PADRAO, registroAdepara: "REG-1", toleranciaBalancoMassa: 0.05 };
    await salvarConfiguracaoProducao(fx.sessao("ADMINISTRADOR"), valores);
    await salvarConfiguracaoProducao(fx.sessao("ADMINISTRADOR"), { ...valores, branqueamentoTempoMinS: 15 });
    expect(await obterConfiguracaoProducao(fx.filialAId)).toMatchObject({
      registroAdepara: "REG-1",
      toleranciaBalancoMassa: 0.05,
      branqueamentoTempoMinS: 15,
    });
    expect(await obterConfiguracaoProducao(fx.filialBId)).toEqual(CONFIGURACAO_PRODUCAO_PADRAO);
    expect(
      await prisma.auditLog.count({ where: { entidade: "ConfiguracaoProducao", filialId: fx.filialAId } }),
    ).toBe(2);
  });

  test("só producao:configurar salva, e respeita filial somente leitura", async () => {
    await expect(salvarConfiguracaoProducao(fx.sessao("PRODUCAO"), CONFIGURACAO_PRODUCAO_PADRAO)).rejects.toThrow(
      PermissionError,
    );
    await expect(
      salvarConfiguracaoProducao(fx.sessao("ADMINISTRADOR", { somenteLeitura: true }), CONFIGURACAO_PRODUCAO_PADRAO),
    ).rejects.toThrow(FilialSomenteLeituraError);
  });

  test("schema converte a tolerância de % para fração e valida limites", () => {
    const base = {
      registroAdepara: "",
      alertaVencimentoCongeladoDias: "30",
      alertaVencimentoResfriadoDias: "1",
      branqueamentoTemperaturaMinC: "80",
      branqueamentoTempoMinS: "10",
      toleranciaBalancoMassaPercentual: "3",
    };
    expect(configuracaoProducaoSchema.parse(base)).toEqual({ ...CONFIGURACAO_PRODUCAO_PADRAO });
    expect(configuracaoProducaoSchema.safeParse({ ...base, toleranciaBalancoMassaPercentual: "101" }).success).toBe(
      false,
    );
    expect(configuracaoProducaoSchema.safeParse({ ...base, branqueamentoTemperaturaMinC: "151" }).success).toBe(false);
    expect(configuracaoProducaoSchema.safeParse({ ...base, alertaVencimentoResfriadoDias: "-1" }).success).toBe(false);
  });
});

describe("configuração de produção - compra de fruto (7b)", () => {
  let fx: FixtureProducao;
  beforeAll(async () => {
    fx = await criarFixtureProducao("config7b");
  });
  afterAll(async () => {
    await fx.limpar();
  });

  test("salvar grava categoria de compra e prazo", async () => {
    const categoria = await prisma.categoriaFinanceira.create({
      data: { filialId: fx.filialAId, nome: "Compra de fruto", tipo: "DESPESA" },
    });
    await salvarConfiguracaoProducao(fx.sessao("ADMINISTRADOR"), {
      ...CONFIGURACAO_PRODUCAO_PADRAO,
      categoriaCompraFrutoId: categoria.id,
      prazoPagamentoProdutorDias: 7,
    });
    expect(await obterConfiguracaoProducao(fx.filialAId)).toMatchObject({
      categoriaCompraFrutoId: categoria.id,
      prazoPagamentoProdutorDias: 7,
    });
  });

  test("recusa categoria de outra filial", async () => {
    const deOutra = await prisma.categoriaFinanceira.create({
      data: { filialId: fx.filialBId, nome: "Compra B", tipo: "DESPESA" },
    });
    await expect(
      salvarConfiguracaoProducao(fx.sessao("ADMINISTRADOR"), {
        ...CONFIGURACAO_PRODUCAO_PADRAO,
        categoriaCompraFrutoId: deOutra.id,
      }),
    ).rejects.toThrow("Categoria de compra de fruto inválida");
  });

  test("recusa categoria de receita", async () => {
    const receita = await prisma.categoriaFinanceira.create({
      data: { filialId: fx.filialAId, nome: "Venda", tipo: "RECEITA" },
    });
    await expect(
      salvarConfiguracaoProducao(fx.sessao("ADMINISTRADOR"), {
        ...CONFIGURACAO_PRODUCAO_PADRAO,
        categoriaCompraFrutoId: receita.id,
      }),
    ).rejects.toThrow("Categoria de compra de fruto inválida");
  });

  test("schema: prazo negativo falha e categoria 'nenhuma' vira null", () => {
    const base = {
      registroAdepara: "",
      alertaVencimentoCongeladoDias: "30",
      alertaVencimentoResfriadoDias: "1",
      branqueamentoTemperaturaMinC: "80",
      branqueamentoTempoMinS: "10",
      toleranciaBalancoMassaPercentual: "3",
      categoriaCompraFrutoId: "__nenhum__",
      prazoPagamentoProdutorDias: "0",
    };
    expect(configuracaoProducaoSchema.parse(base)).toMatchObject({
      categoriaCompraFrutoId: null,
      prazoPagamentoProdutorDias: 0,
    });
    expect(configuracaoProducaoSchema.safeParse({ ...base, prazoPagamentoProdutorDias: "-1" }).success).toBe(false);
  });
});
