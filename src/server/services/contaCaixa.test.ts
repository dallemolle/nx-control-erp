import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { contaBancariaSchema } from "@/lib/schemas/contaBancaria";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { atualizarContaBancaria, criarContaBancaria } from "./contaBancaria";
import { atualizarBanco, criarBanco, listarBancos } from "./banco";
import { criarLancamentoManual, criarTransferencia } from "./lancamentoBancario";
import { aprovarBaixa, registrarBaixa } from "./baixa";
import { criarTitulo } from "./titulo";
import { importarExtratoOfx } from "./conciliacao";
import { CODIGO_BANCO_CAIXA } from "@/lib/schemas/contaBancaria";

/** Conta Caixa (Fase B fiscal, FG4): dinheiro em espécie entra no realizado sem extrato. */
describe("conta Caixa", () => {
  let fx: FixtureFinanceiro;
  let caixaId: string;

  const dadosCaixa = (extra: Record<string, unknown> = {}) =>
    contaBancariaSchema.parse({ tipo: "CAIXA", conta: "Escritório", moeda: "BRL", saldoInicial: "0", ...extra });

  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("CXA", "ADMINISTRADOR");
    caixaId = (await criarContaBancaria(fx.sessao, dadosCaixa())).id;
  });
  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
  });

  test("conta Caixa usa o banco CX e agência '-', mesmo sem banco no formulário", async () => {
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: caixaId }, include: { banco: true } });
    expect(conta.tipo).toBe("CAIXA");
    expect(conta.banco.codigo).toBe(CODIGO_BANCO_CAIXA);
    expect(conta.agencia).toBe("-");
  });

  test("schema exige banco e agência só fora do tipo Caixa", () => {
    expect(contaBancariaSchema.safeParse({ tipo: "CORRENTE", conta: "1", moeda: "BRL", saldoInicial: "0" }).success).toBe(
      false,
    );
    expect(contaBancariaSchema.safeParse({ tipo: "CAIXA", conta: "Fazenda", moeda: "BRL", saldoInicial: "0" }).success).toBe(
      true,
    );
  });

  test("conta de outro tipo não pode usar o banco CX", async () => {
    const cx = await prisma.banco.findUniqueOrThrow({ where: { codigo: CODIGO_BANCO_CAIXA } });
    await expect(
      criarContaBancaria(
        fx.sessao,
        contaBancariaSchema.parse({ tipo: "CORRENTE", bancoId: cx.id, agencia: "1", conta: "2", moeda: "BRL", saldoInicial: "0" }),
      ),
    ).rejects.toThrow("O banco CX é reservado às contas Caixa");
  });

  test("lançamento manual em conta Caixa já nasce conciliado; em conta corrente, não", async () => {
    const manual = (contaBancariaId: string) =>
      criarLancamentoManual(fx.sessao, {
        contaBancariaId,
        data: new Date("2026-11-09"),
        tipo: "SAIDA",
        valor: 50,
        descricao: "Diária em dinheiro",
        categoriaFinanceiraId: "__nenhum__",
        classificacaoFiscal: "GERENCIAL",
        tipoComprovante: "RECIBO",
      });
    expect((await manual(caixaId)).conciliado).toBe(true);
    expect((await manual(fx.contaBancariaId)).conciliado).toBe(false);
  });

  test("transferência do banco para o caixa: só o lado do caixa nasce conciliado", async () => {
    const { saida, entrada } = await criarTransferencia(fx.sessao, {
      contaOrigemId: fx.contaBancariaId,
      contaDestinoId: caixaId,
      data: new Date("2026-11-09"),
      valor: 300,
      descricao: "Saque para o caixa",
    });
    expect(saida.conciliado).toBe(false);
    expect(entrada.conciliado).toBe(true);
  });

  test("baixa aprovada em conta Caixa gera lançamento conciliado", async () => {
    const titulo = await criarTitulo(fx.sessao, "PAGAR", {
      contraparteId: fx.fornecedorId,
      documento: `REC-${Date.now()}`,
      dataEmissao: new Date("2026-11-09"),
      dataCompetencia: new Date("2026-11-09"),
      categoriaFinanceiraId: fx.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: caixaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date("2026-11-09"), valorOriginal: 80 }],
    });
    const baixa = await registrarBaixa(fx.sessao, titulo.parcelas[0].id, {
      data: new Date("2026-11-09"),
      valorPago: 80,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: caixaId,
    });
    await aprovarBaixa(fx.sessao, baixa.id);
    const lancamento = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } });
    expect(lancamento.conciliado).toBe(true);
  });

  test("mudar o tipo de/para Caixa é recusado quando a conta já tem lançamentos", async () => {
    await expect(atualizarContaBancaria(fx.sessao, caixaId, dadosCaixa({ tipo: "CORRENTE", bancoId: fx.bancoId, agencia: "1" }))).rejects.toThrow(
      "Não é possível mudar de ou para o tipo Caixa uma conta que já tem lançamentos",
    );
    const corrente = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fx.contaBancariaId } });
    await expect(
      atualizarContaBancaria(fx.sessao, corrente.id, dadosCaixa({ conta: corrente.conta })),
    ).rejects.toThrow("Não é possível mudar de ou para o tipo Caixa uma conta que já tem lançamentos");
  });

  test("conta corrente sem lançamentos pode virar Caixa e passa a usar o banco CX", async () => {
    const nova = await criarContaBancaria(
      fx.sessao,
      contaBancariaSchema.parse({ tipo: "CORRENTE", bancoId: fx.bancoId, agencia: "9", conta: "nova", moeda: "BRL", saldoInicial: "0" }),
    );
    const virou = await atualizarContaBancaria(fx.sessao, nova.id, dadosCaixa({ conta: "Fazenda" }));
    expect(virou.tipo).toBe("CAIXA");
    expect(virou.agencia).toBe("-");
  });

  test("conta Caixa não recebe extrato", async () => {
    const arquivo = new File(["OFXHEADER:100"], "extrato.ofx");
    await expect(importarExtratoOfx(fx.sessao, caixaId, arquivo)).rejects.toThrow("Conta Caixa não recebe extrato");
  });

  test("banco CX fica fora da lista de bancos e não pode ser criado nem editado", async () => {
    expect((await listarBancos()).some((b) => b.codigo === CODIGO_BANCO_CAIXA)).toBe(false);
    await expect(criarBanco(fx.sessao, { codigo: "cx", nome: "Outro" })).rejects.toThrow("O código CX é reservado");
    const cx = await prisma.banco.findUniqueOrThrow({ where: { codigo: CODIGO_BANCO_CAIXA } });
    await expect(atualizarBanco(fx.sessao, cx.id, { codigo: "CX", nome: "Mudado" })).rejects.toThrow(
      "O código CX é reservado",
    );
    await expect(atualizarBanco(fx.sessao, fx.bancoId, { codigo: "CX", nome: "Mudado" })).rejects.toThrow(
      "O código CX é reservado",
    );
  });
});
