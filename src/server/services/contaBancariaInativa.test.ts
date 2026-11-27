import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { definirAtivoContaBancaria } from "./contaBancaria";
import { buscarSaldoConciliado } from "./fluxoDeCaixa";
import { listarResumoContas } from "./lancamentoBancario";
import { criarTitulo } from "./titulo";
import { registrarBaixa } from "./baixa";
import { formatarMoeda } from "@/lib/formatacao";

describe("conta bancária inativa", () => {
  let fx: FixtureFinanceiro;
  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("CONTAINATIVA");
  });
  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
  });

  let seq = 0;
  const novaConta = (saldoInicial = 0) =>
    prisma.contaBancaria.create({
      data: { filialId: fx.filialId, bancoId: fx.bancoId, agencia: "1", conta: `INAT-${Date.now()}-${seq++}`, tipo: "CORRENTE", saldoInicial },
    });
  const lancar = (contaBancariaId: string, tipo: "ENTRADA" | "SAIDA", valor: number) =>
    prisma.lancamentoBancario.create({
      data: {
        filialId: fx.filialId,
        contaBancariaId,
        data: new Date("2026-10-10"),
        tipo,
        valor,
        descricao: "teste",
        conciliado: true,
        usuarioId: fx.usuarioId,
        classificacaoFiscal: "GERENCIAL",
      },
    });

  test("inativar recusa conta com saldo contábil diferente de zero; com saldo zero, inativa", async () => {
    const conta = await novaConta(1500);
    await expect(definirAtivoContaBancaria(fx.sessao, conta.id, false)).rejects.toThrow(
      `A conta tem saldo contábil de ${formatarMoeda(1500)}: zere o saldo`,
    );
    await lancar(conta.id, "SAIDA", 1500);
    await definirAtivoContaBancaria(fx.sessao, conta.id, false);
    expect((await prisma.contaBancaria.findUniqueOrThrow({ where: { id: conta.id } })).ativo).toBe(false);
  });

  test("os relatórios contam o histórico da conta inativa (o passado não muda ao inativar)", async () => {
    const antes = await buscarSaldoConciliado(fx.filialId);
    const conta = await novaConta(200);
    await lancar(conta.id, "ENTRADA", 100);
    await lancar(conta.id, "SAIDA", 300);
    const comConta = await buscarSaldoConciliado(fx.filialId);
    expect(comConta).toBeCloseTo(antes, 2);
    await definirAtivoContaBancaria(fx.sessao, conta.id, false);
    expect(await buscarSaldoConciliado(fx.filialId)).toBeCloseTo(comConta, 2);
  });

  test("Tesouraria: conta inativa com saldo (de antes da regra) aparece; zerada, não", async () => {
    const antiga = await novaConta(50);
    await prisma.contaBancaria.update({ where: { id: antiga.id }, data: { ativo: false } });
    const zerada = await novaConta(0);
    await prisma.contaBancaria.update({ where: { id: zerada.id }, data: { ativo: false } });
    const ids = (await listarResumoContas(fx.filialId)).map((r) => r.conta.id);
    expect(ids).toContain(antiga.id);
    expect(ids).not.toContain(zerada.id);
  });

  test("título novo e baixa recusam conta inativa", async () => {
    const conta = await novaConta(0);
    await definirAtivoContaBancaria(fx.sessao, conta.id, false);
    const dados = {
      contraparteId: fx.fornecedorId,
      documento: "NF-CONTA-INATIVA",
      dataEmissao: new Date("2026-11-20"),
      dataCompetencia: new Date("2026-11-20"),
      categoriaFinanceiraId: fx.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: conta.id,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2026-12-20"), valorOriginal: 100 }],
    };
    await expect(criarTitulo(fx.sessao, "PAGAR", dados)).rejects.toThrow("Conta bancária inativa");

    const titulo = await criarTitulo(fx.sessao, "PAGAR", { ...dados, contaBancariaId: fx.contaBancariaId });
    await expect(
      registrarBaixa(fx.sessaoAdmin, titulo.parcelas[0].id, {
        data: new Date("2026-11-25"),
        valorPago: 100,
        valorJuros: 0,
        valorMulta: 0,
        valorDesconto: 0,
        contaBancariaId: conta.id,
      }),
    ).rejects.toThrow("Conta bancária inativa");
  });
});
