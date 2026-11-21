import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import type { TipoTitulo } from "@prisma/client";
import { resumirBaixasDaParcela } from "@/lib/financeiro/avisosDaBaixa";
import { registrarBaixa, aprovarBaixa, rejeitarBaixa, listarBaixasPendentes, efetivarBaixa } from "./baixa";

describe("baixa (fluxo de aprovação)", () => {
  let fixture: FixtureFinanceiro; // perfil FINANCEIRO: pode registrar baixa, não aprovar
  let fixtureTesouraria: FixtureFinanceiro; // perfil TESOURARIA: pode aprovar

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("BXF");
    fixtureTesouraria = await criarFixtureFinanceiro("BXT", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await limparFixtureFinanceiro(fixtureTesouraria);
    await prisma.$disconnect();
  });

  async function criarParcelaDeTeste(fx: FixtureFinanceiro, valor: number, tipo: TipoTitulo = "PAGAR") {
    // Usa sessaoAdmin (não fx.sessao) porque fixtureTesouraria não tem titulo:escrever —
    // este helper só monta dados de setup, não é o que está sendo testado.
    const titulo = await criarTitulo(fx.sessaoAdmin, tipo, {
      contraparteId: tipo === "PAGAR" ? fx.fornecedorId : fx.clienteId,
      documento: `NF-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fx.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fx.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: valor }],
    });
    return titulo.parcelas[0];
  }

  test("baixa pendente não altera o status da parcela", async () => {
    const parcela = await criarParcelaDeTeste(fixture, 100);
    await registrarBaixa(fixture.sessao, parcela.id, {
      data: new Date(),
      valorPago: 100,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });

    const parcelaAposBaixa = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaAposBaixa.status).not.toBe("PAGO");
  });

  test("aprovar a baixa recalcula o status da parcela para PAGO", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 200);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 200,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    const parcelaAprovada = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaAprovada.status).toBe("PAGO");
  });

  test("aprovar a baixa de um título PAGAR cria um lançamento bancário de saída", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 250);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 250,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    const lancamento = await prisma.lancamentoBancario.findFirst({ where: { baixaId: baixa.id } });
    expect(lancamento).not.toBeNull();
    expect(lancamento?.tipo).toBe("SAIDA");
    expect(lancamento?.origem).toBe("BAIXA");
    expect(Number(lancamento?.valor)).toBe(250);
    expect(lancamento?.contaBancariaId).toBe(fixtureTesouraria.contaBancariaId);
  });

  test("aprovar a baixa de um título RECEBER cria um lançamento bancário de entrada", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 270, "RECEBER");
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 270,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    const lancamento = await prisma.lancamentoBancario.findFirst({ where: { baixaId: baixa.id } });
    expect(lancamento?.tipo).toBe("ENTRADA");
    expect(lancamento?.origem).toBe("BAIXA");
  });

  test("rejeitar a baixa não cria lançamento bancário nenhum", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 260);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 260,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await rejeitarBaixa(fixtureTesouraria.sessao, baixa.id, "Valor incorreto");

    const lancamento = await prisma.lancamentoBancario.findFirst({ where: { baixaId: baixa.id } });
    expect(lancamento).toBeNull();
  });

  test("rejeitar a baixa não altera o status nem o saldo, e grava o motivo", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 300);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 300,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    const rejeitada = await rejeitarBaixa(fixtureTesouraria.sessao, baixa.id, "Comprovante ilegível");
    expect(rejeitada.motivoRejeicao).toBe("Comprovante ilegível");

    const parcelaAposRejeicao = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaAposRejeicao.status).not.toBe("PAGO");
  });

  test("perfil sem titulo:aprovar não consegue aprovar", async () => {
    const parcela = await criarParcelaDeTeste(fixture, 50);
    const baixa = await registrarBaixa(fixture.sessao, parcela.id, {
      data: new Date(),
      valorPago: 50,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });

    await expect(aprovarBaixa(fixture.sessao, baixa.id)).rejects.toThrow(PermissionError);
  });

  test("listarBaixasPendentes só retorna baixas PENDENTE da filial", async () => {
    const pendentes = await listarBaixasPendentes(fixtureTesouraria.filialId);
    expect(pendentes.every((baixa) => baixa.statusAprovacao === "PENDENTE")).toBe(true);
  });

  test("listarBaixasPendentes traz banco da conta, total de parcelas e as baixas da parcela", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 300);
    const dados = {
      data: new Date(),
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    };
    const aprovada = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, { ...dados, valorPago: 100 });
    await aprovarBaixa(fixtureTesouraria.sessao, aprovada.id);
    const primeira = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, { ...dados, valorPago: 200 });
    await registrarBaixa(fixtureTesouraria.sessao, parcela.id, { ...dados, valorPago: 200 });
    const parcelaOutraFilial = await criarParcelaDeTeste(fixture, 50);
    const deOutraFilial = await registrarBaixa(fixture.sessao, parcelaOutraFilial.id, {
      ...dados,
      valorPago: 50,
      contaBancariaId: fixture.contaBancariaId,
    });

    const pendentes = await listarBaixasPendentes(fixtureTesouraria.filialId);
    const linha = pendentes.find((b) => b.id === primeira.id);

    expect(linha).toBeDefined();
    expect(linha!.contaBancaria.banco.nome).not.toBe("");
    expect(linha!.parcela.titulo._count.parcelas).toBe(1);
    expect(
      resumirBaixasDaParcela(
        linha!.id,
        linha!.parcela.baixas.map((b) => ({
          id: b.id,
          valorPago: Number(b.valorPago),
          statusAprovacao: b.statusAprovacao,
        })),
      ),
    ).toEqual({ totalAprovado: 100, outrasPendentes: 1 });
    expect(pendentes.some((b) => b.id === aprovada.id)).toBe(false);
    // Baixa pendente de outra filial não aparece.
    expect(pendentes.some((b) => b.id === deOutraFilial.id)).toBe(false);
    expect(pendentes.every((b) => b.parcela.titulo.filialId === fixtureTesouraria.filialId)).toBe(true);
  });

  test("não é possível aprovar uma baixa já rejeitada", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 400);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 400,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await rejeitarBaixa(fixtureTesouraria.sessao, baixa.id, "Valor divergente");

    await expect(aprovarBaixa(fixtureTesouraria.sessao, baixa.id)).rejects.toThrow(/já foi avaliada/);

    const parcelaFinal = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaFinal.status).not.toBe("PAGO");
  });

  test("não é possível rejeitar uma baixa já aprovada", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 500);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 500,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    await expect(
      rejeitarBaixa(fixtureTesouraria.sessao, baixa.id, "Arrependimento"),
    ).rejects.toThrow(/já foi avaliada/);
  });

  test("rejeita baixa contra conta bancária de outra filial", async () => {
    const parcela = await criarParcelaDeTeste(fixture, 600);

    await expect(
      registrarBaixa(fixture.sessao, parcela.id, {
        data: new Date(),
        valorPago: 600,
        valorJuros: 0,
        valorMulta: 0,
        valorDesconto: 0,
        // Conta bancária da OUTRA fixture (outra empresa/filial).
        contaBancariaId: fixtureTesouraria.contaBancariaId,
      }),
    ).rejects.toThrow(/não pertence à filial ativa/);
  });

  test("aprovarBaixa copia a categoria do titulo para o lancamento bancario gerado", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 300);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 300,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });
    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    const lancamento = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } });
    expect(lancamento.categoriaFinanceiraId).toBe(fixtureTesouraria.categoriaFinanceiraId);
  });

  test("aprovarBaixa copia centro de custo, centro de lucro, safra e projeto do titulo", async () => {
    const centroCusto = await prisma.centroCusto.create({
      data: { filialId: fixtureTesouraria.filialId, nome: "Centro Baixa", codigo: "CXB" },
    });
    const centroLucro = await prisma.centroLucro.create({
      data: { filialId: fixtureTesouraria.filialId, nome: "Lucro Baixa", codigo: "LXB" },
    });
    const safra = await prisma.safra.create({
      data: {
        filialId: fixtureTesouraria.filialId,
        nome: "Safra Baixa",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-12-31"),
      },
    });
    const projeto = await prisma.projeto.create({
      data: { filialId: fixtureTesouraria.filialId, nome: "Projeto Baixa", codigo: "PXB" },
    });

    const titulo = await criarTitulo(fixtureTesouraria.sessaoAdmin, "PAGAR", {
      contraparteId: fixtureTesouraria.fornecedorId,
      documento: `NF-DIM-${Date.now()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fixtureTesouraria.categoriaFinanceiraId,
      centroCustoId: centroCusto.id,
      centroLucroId: centroLucro.id,
      safraId: safra.id,
      projetoId: projeto.id,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 350 }],
    });
    const parcela = titulo.parcelas[0];

    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(),
      valorPago: 350,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });
    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    const lancamento = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } });
    expect(lancamento.centroCustoId).toBe(centroCusto.id);
    expect(lancamento.centroLucroId).toBe(centroLucro.id);
    expect(lancamento.safraId).toBe(safra.id);
    expect(lancamento.projetoId).toBe(projeto.id);
  });

  test("efetivarBaixa aprova sem exigir titulo:aprovar (usada pela venda à vista)", async () => {
    // Perfil FINANCEIRO não tem titulo:aprovar; o núcleo não checa perfil.
    const parcela = await criarParcelaDeTeste(fixture, 120, "RECEBER");
    const baixa = await registrarBaixa(fixture.sessao, parcela.id, {
      data: new Date(),
      valorPago: 120,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixture.contaBancariaId,
    });
    const contexto = { empresaId: fixture.empresaId, filialId: fixture.filialId, usuarioId: fixture.usuarioId };

    const { lancamentoId } = await prisma.$transaction((tx) => efetivarBaixa(tx, contexto, baixa.id));

    expect((await prisma.baixa.findUniqueOrThrow({ where: { id: baixa.id } })).statusAprovacao).toBe("APROVADO");
    expect((await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } })).status).toBe("PAGO");
    const lancamento = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamentoId } });
    expect(lancamento).toMatchObject({ tipo: "ENTRADA", baixaId: baixa.id });

    await expect(prisma.$transaction((tx) => efetivarBaixa(tx, contexto, baixa.id))).rejects.toThrow(
      "Esta baixa já foi avaliada",
    );
  });
});

describe("segregação na aprovação", () => {
  const MENSAGEM = "Quem registrou a baixa não pode aprová-la. Peça a outra pessoa com permissão de aprovação.";
  let fx: FixtureFinanceiro; // perfil TESOURARIA: registra e aprova

  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("BXS", "TESOURARIA");
    await prisma.empresa.update({ where: { id: fx.empresaId }, data: { exigirAprovacaoPorOutro: true } });
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
  });

  async function registrar(sessao: FixtureFinanceiro["sessao"]) {
    const titulo = await criarTitulo(fx.sessaoAdmin, "PAGAR", {
      contraparteId: fx.fornecedorId,
      documento: `SEG-${Date.now()}-${Math.random()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: fx.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: fx.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });
    return registrarBaixa(sessao, titulo.parcelas[0].id, {
      data: new Date(),
      valorPago: 100,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fx.contaBancariaId,
    });
  }

  test("quem registrou não aprova: erro, baixa segue PENDENTE e sem lançamento", async () => {
    const baixa = await registrar(fx.sessao);
    await expect(aprovarBaixa(fx.sessao, baixa.id)).rejects.toThrow(MENSAGEM);

    const depois = await prisma.baixa.findUniqueOrThrow({ where: { id: baixa.id } });
    expect(depois.statusAprovacao).toBe("PENDENTE");
    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(0);
  });

  test("outra pessoa aprova", async () => {
    const baixa = await registrar(fx.sessao);
    const aprovada = await aprovarBaixa(fx.sessaoAdmin, baixa.id);
    expect(aprovada.statusAprovacao).toBe("APROVADO");
  });

  test("vale também para o Administrador", async () => {
    const baixa = await registrar(fx.sessaoAdmin);
    await expect(aprovarBaixa(fx.sessaoAdmin, baixa.id)).rejects.toThrow(MENSAGEM);
  });

  test("com a regra desligada, a mesma pessoa aprova", async () => {
    await prisma.empresa.update({ where: { id: fx.empresaId }, data: { exigirAprovacaoPorOutro: false } });
    try {
      const baixa = await registrar(fx.sessao);
      const aprovada = await aprovarBaixa(fx.sessao, baixa.id);
      expect(aprovada.statusAprovacao).toBe("APROVADO");
    } finally {
      await prisma.empresa.update({ where: { id: fx.empresaId }, data: { exigirAprovacaoPorOutro: true } });
    }
  });

  test("rejeitar a própria baixa é permitido", async () => {
    const baixa = await registrar(fx.sessao);
    const rejeitada = await rejeitarBaixa(fx.sessao, baixa.id, "desisti");
    expect(rejeitada.statusAprovacao).toBe("REJEITADO");
  });
});
