import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo, cancelarParcela, listarTitulos } from "./titulo";
import type { TipoTitulo } from "@prisma/client";
import { resumirBaixasDaParcela } from "@/lib/financeiro/avisosDaBaixa";
import { valoresDaBaixa } from "./parcela";
import {
  registrarBaixa,
  aprovarBaixa,
  rejeitarBaixa,
  listarBaixasPendentes,
  efetivarBaixa,
  estornarBaixa,
  MSG_ESTORNO_CONCILIADA,
  MSG_ESTORNO_POR_QUEM_REGISTROU,
  BaixaPendenteError,
  BaixaParcelaFechadaError,
  dispensarRejeicao,
  contarRejeicoesEmAberto,
  RejeicaoNaoDispensavelError,
} from "./baixa";
import { formatarMoeda } from "@/lib/formatacao";

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

  test("baixa com desconto, aprovada, deixa a parcela PAGO e o lançamento com o valor pago", async () => {
    const parcela = await criarParcelaDeTeste(fixtureTesouraria, 1000);
    const baixa = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, {
      data: new Date(), valorPago: 950, valorJuros: 0, valorMulta: 0, valorDesconto: 50,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });
    await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);

    const atualizada = await prisma.parcela.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(atualizada.status).toBe("PAGO");
    const lancamento = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } });
    expect(Number(lancamento.valor)).toBe(950);
  });

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
    // Pendente de antes da trava de uma pendente por parcela: gravada direto no banco.
    await prisma.baixa.create({
      data: {
        parcelaId: parcela.id,
        data: dados.data,
        valorPago: 200,
        contaBancariaId: dados.contaBancariaId,
        usuarioId: fixtureTesouraria.usuarioId,
        statusAprovacao: "PENDENTE",
      },
    });
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
          statusAprovacao: b.statusAprovacao,
          ...valoresDaBaixa(b),
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

  describe("uma baixa pendente por parcela", () => {
    const dadosBaixa = (valorPago: number, data = new Date()) => ({
      data,
      valorPago,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fixtureTesouraria.contaBancariaId,
    });

    test("recusa a segunda baixa enquanto a primeira está pendente, dizendo qual é", async () => {
      const parcela = await criarParcelaDeTeste(fixtureTesouraria, 1012);
      await registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(1012, new Date("2026-10-14T00:00:00Z")));
      const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: fixtureTesouraria.usuarioId } });

      const tentativa = registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(1012));

      await expect(tentativa).rejects.toThrow(BaixaPendenteError);
      await expect(tentativa).rejects.toThrow(
        `Esta parcela já tem uma baixa aguardando aprovação: ${formatarMoeda(1012)} de 14/10/2026, ` +
          `registrada por ${usuario.nome}. Peça para aprovarem ou rejeitarem essa baixa antes de registrar outra.`,
      );
      expect(await prisma.baixa.count({ where: { parcelaId: parcela.id } })).toBe(1);
    });

    test("depois de aprovar a primeira (parcial), a segunda é registrada", async () => {
      const parcela = await criarParcelaDeTeste(fixtureTesouraria, 1000);
      const primeira = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(400));
      await aprovarBaixa(fixtureTesouraria.sessao, primeira.id);

      const segunda = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(600));

      expect(segunda.statusAprovacao).toBe("PENDENTE");
    });

    test("depois de rejeitar a primeira, a segunda é registrada", async () => {
      const parcela = await criarParcelaDeTeste(fixtureTesouraria, 700);
      const primeira = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(7000));
      await rejeitarBaixa(fixtureTesouraria.sessao, primeira.id, "valor errado");

      const segunda = await registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(700));

      expect(segunda.statusAprovacao).toBe("PENDENTE");
    });

    test("duas baixas ao mesmo tempo: só uma é registrada", async () => {
      const parcela = await criarParcelaDeTeste(fixtureTesouraria, 900);

      const resultados = await Promise.allSettled([
        registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(900)),
        registrarBaixa(fixtureTesouraria.sessao, parcela.id, dadosBaixa(900)),
      ]);

      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const recusa = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(recusa.reason).toBeInstanceOf(BaixaPendenteError);
      expect(await prisma.baixa.count({ where: { parcelaId: parcela.id } })).toBe(1);
    });

    test("parcela paga ou cancelada não aceita baixa", async () => {
      const paga = await criarParcelaDeTeste(fixtureTesouraria, 300);
      const baixa = await registrarBaixa(fixtureTesouraria.sessao, paga.id, dadosBaixa(300));
      await aprovarBaixa(fixtureTesouraria.sessao, baixa.id);
      await expect(registrarBaixa(fixtureTesouraria.sessao, paga.id, dadosBaixa(300))).rejects.toThrow(
        new BaixaParcelaFechadaError("Esta parcela está paga e não aceita baixa"),
      );

      const cancelada = await criarParcelaDeTeste(fixtureTesouraria, 300);
      await cancelarParcela(fixtureTesouraria.sessaoAdmin, cancelada.id);
      await expect(registrarBaixa(fixtureTesouraria.sessao, cancelada.id, dadosBaixa(300))).rejects.toThrow(
        "Esta parcela está cancelada e não aceita baixa",
      );
    });
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

describe("estorno de baixa", () => {
  let fx: FixtureFinanceiro; // TESOURARIA, segregação desligada (padrão da fixture)
  let fxFinanceiro: FixtureFinanceiro; // FINANCEIRO: não estorna; também é a "outra filial"

  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("BXE", "TESOURARIA");
    fxFinanceiro = await criarFixtureFinanceiro("BXEF");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
    await limparFixtureFinanceiro(fxFinanceiro);
  });

  async function parcela(f: FixtureFinanceiro, valor: number) {
    const titulo = await criarTitulo(f.sessaoAdmin, "PAGAR", {
      contraparteId: f.fornecedorId,
      documento: `EST-${Date.now()}-${Math.random()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: f.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: f.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: valor }],
    });
    return titulo.parcelas[0];
  }

  async function baixaAprovada(f: FixtureFinanceiro, parcelaId: string, valor: number, contaBancariaId = f.contaBancariaId) {
    const baixa = await registrarBaixa(f.sessaoAdmin, parcelaId, {
      data: new Date(),
      valorPago: valor,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId,
    });
    await aprovarBaixa(f.sessaoAdmin, baixa.id);
    return baixa;
  }

  test("estorna: apaga o lançamento, marca a baixa e reabre a parcela", async () => {
    const p = await parcela(fx, 200);
    const baixa = await baixaAprovada(fx, p.id, 200);
    const lancamento = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } });

    const estornada = await estornarBaixa(fx.sessao, baixa.id, "  conta errada  ");

    expect(estornada).toMatchObject({
      statusAprovacao: "ESTORNADO",
      estornadoPorId: fx.usuarioId,
      motivoEstorno: "conta errada",
    });
    expect(estornada.estornadoEm).toBeInstanceOf(Date);
    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(0);
    const depois = await prisma.parcela.findUniqueOrThrow({ where: { id: p.id } });
    expect(["EM_ABERTO", "A_VENCER", "VENCIDO"]).toContain(depois.status);

    const auditoria = await prisma.auditLog.findFirstOrThrow({ where: { entidadeId: baixa.id, acao: "ESTORNAR" } });
    expect(auditoria.valorAnterior).toMatchObject({
      statusAprovacao: "APROVADO",
      lancamentos: [{ id: lancamento.id, contaBancariaId: fx.contaBancariaId, tipo: "SAIDA", valor: "200" }],
    });
    expect(auditoria.valorNovo).toMatchObject({ statusAprovacao: "ESTORNADO", motivoEstorno: "conta errada" });
  });

  test("com outra baixa aprovada, a parcela fica PARCIALMENTE_PAGO", async () => {
    const p = await parcela(fx, 200);
    await baixaAprovada(fx, p.id, 100);
    const segunda = await baixaAprovada(fx, p.id, 100);
    expect((await prisma.parcela.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PAGO");

    await estornarBaixa(fx.sessao, segunda.id, "lançada em dobro");

    expect((await prisma.parcela.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PARCIALMENTE_PAGO");
  });

  test("só baixa aprovada: pendente, rejeitada e já estornada são recusadas", async () => {
    const p = await parcela(fx, 300);
    const pendente = await registrarBaixa(fx.sessaoAdmin, p.id, {
      data: new Date(),
      valorPago: 10,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fx.contaBancariaId,
    });
    await expect(estornarBaixa(fx.sessao, pendente.id, "teste")).rejects.toThrow(
      "Só baixas aprovadas podem ser estornadas",
    );

    await rejeitarBaixa(fx.sessaoAdmin, pendente.id, "não");
    await expect(estornarBaixa(fx.sessao, pendente.id, "teste")).rejects.toThrow(
      "Só baixas aprovadas podem ser estornadas",
    );

    const aprovada = await baixaAprovada(fx, p.id, 20);
    await estornarBaixa(fx.sessao, aprovada.id, "teste");
    await expect(estornarBaixa(fx.sessao, aprovada.id, "teste")).rejects.toThrow(
      "Só baixas aprovadas podem ser estornadas",
    );
  });

  test("lançamento conciliado bloqueia o estorno", async () => {
    const p = await parcela(fx, 150);
    const baixa = await baixaAprovada(fx, p.id, 150);
    const grupo = await prisma.grupoConciliacao.create({
      data: { filialId: fx.filialId, contaBancariaId: fx.contaBancariaId, usuarioId: fx.usuarioId },
    });
    await prisma.lancamentoBancario.updateMany({
      where: { baixaId: baixa.id },
      data: { grupoConciliacaoId: grupo.id, conciliado: true },
    });

    await expect(estornarBaixa(fx.sessao, baixa.id, "teste")).rejects.toThrow(MSG_ESTORNO_CONCILIADA);
    expect((await prisma.baixa.findUniqueOrThrow({ where: { id: baixa.id } })).statusAprovacao).toBe("APROVADO");
    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(1);
  });

  test("conta Caixa (conciliada sem extrato) pode ser estornada", async () => {
    const caixa = await prisma.contaBancaria.create({
      data: {
        filialId: fx.filialId,
        bancoId: fx.bancoId,
        agencia: "0000",
        conta: `CX-${Date.now()}`,
        tipo: "CAIXA",
        saldoInicial: 0,
      },
    });
    const p = await parcela(fx, 80);
    const baixa = await baixaAprovada(fx, p.id, 80, caixa.id);
    expect((await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } })).conciliado).toBe(true);

    await estornarBaixa(fx.sessao, baixa.id, "não foi pago em dinheiro");

    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(0);
  });

  test("parcela cancelada continua cancelada depois do estorno", async () => {
    const p = await parcela(fx, 100);
    const baixa = await baixaAprovada(fx, p.id, 50);
    await cancelarParcela(fx.sessaoAdmin, p.id);

    await estornarBaixa(fx.sessao, baixa.id, "teste");

    expect((await prisma.parcela.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CANCELADO");
    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(0);
  });

  test("motivo vazio, perfil sem titulo:aprovar e baixa de outra filial são recusados", async () => {
    const p = await parcela(fx, 60);
    const baixa = await baixaAprovada(fx, p.id, 60);
    await expect(estornarBaixa(fx.sessao, baixa.id, "   ")).rejects.toThrow("Informe o motivo do estorno");
    await expect(estornarBaixa(fxFinanceiro.sessao, baixa.id, "teste")).rejects.toThrow(PermissionError);
    // fxFinanceiro.sessaoAdmin tem titulo:aprovar, mas está em outra filial.
    await expect(estornarBaixa(fxFinanceiro.sessaoAdmin, baixa.id, "teste")).rejects.toThrow();
    expect((await prisma.baixa.findUniqueOrThrow({ where: { id: baixa.id } })).statusAprovacao).toBe("APROVADO");
  });
});

describe("segregação no estorno", () => {
  let fx: FixtureFinanceiro; // TESOURARIA

  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("BXES", "TESOURARIA");
    await prisma.empresa.update({ where: { id: fx.empresaId }, data: { exigirAprovacaoPorOutro: true } });
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
  });

  /** Registrada por `fx.sessao` (Tesouraria) e aprovada pelo Administrador. */
  async function registradaPelaTesouraria() {
    const titulo = await criarTitulo(fx.sessaoAdmin, "PAGAR", {
      contraparteId: fx.fornecedorId,
      documento: `ESS-${Date.now()}-${Math.random()}`,
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
    const baixa = await registrarBaixa(fx.sessao, titulo.parcelas[0].id, {
      data: new Date(),
      valorPago: 100,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fx.contaBancariaId,
    });
    await aprovarBaixa(fx.sessaoAdmin, baixa.id);
    return baixa;
  }

  test("quem registrou não estorna; baixa e lançamento ficam como estavam", async () => {
    const baixa = await registradaPelaTesouraria();
    await expect(estornarBaixa(fx.sessao, baixa.id, "teste")).rejects.toThrow(MSG_ESTORNO_POR_QUEM_REGISTROU);
    expect((await prisma.baixa.findUniqueOrThrow({ where: { id: baixa.id } })).statusAprovacao).toBe("APROVADO");
    expect(await prisma.lancamentoBancario.count({ where: { baixaId: baixa.id } })).toBe(1);
  });

  test("outra pessoa estorna, mesmo tendo aprovado", async () => {
    const baixa = await registradaPelaTesouraria();
    const estornada = await estornarBaixa(fx.sessaoAdmin, baixa.id, "teste");
    expect(estornada.statusAprovacao).toBe("ESTORNADO");
  });

  test("com a regra desligada, quem registrou estorna", async () => {
    await prisma.empresa.update({ where: { id: fx.empresaId }, data: { exigirAprovacaoPorOutro: false } });
    try {
      const baixa = await registradaPelaTesouraria();
      const estornada = await estornarBaixa(fx.sessao, baixa.id, "teste");
      expect(estornada.statusAprovacao).toBe("ESTORNADO");
    } finally {
      await prisma.empresa.update({ where: { id: fx.empresaId }, data: { exigirAprovacaoPorOutro: true } });
    }
  });
});

describe("rejeição em aberto e dispensa", () => {
  let fx: FixtureFinanceiro; // FINANCEIRO: registra e dispensa; quem rejeita é o sessaoAdmin
  let fxOutra: FixtureFinanceiro; // outra filial

  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("BXR");
    fxOutra = await criarFixtureFinanceiro("BXRO");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
    await limparFixtureFinanceiro(fxOutra);
  });

  async function parcelaNova(f: FixtureFinanceiro, tipo: TipoTitulo = "PAGAR") {
    const titulo = await criarTitulo(f.sessaoAdmin, tipo, {
      contraparteId: tipo === "PAGAR" ? f.fornecedorId : f.clienteId,
      documento: `NF-R-${Date.now()}-${Math.random()}`,
      dataEmissao: new Date(),
      dataCompetencia: new Date(),
      categoriaFinanceiraId: f.categoriaFinanceiraId,
      centroCustoId: "",
      centroLucroId: "",
      safraId: "",
      projetoId: "",
      contaBancariaId: f.contaBancariaId,
      formaPagamento: "",
      parcelas: [{ numero: 1, dataVencimento: new Date(), valorOriginal: 100 }],
    });
    return titulo.parcelas[0];
  }

  async function baixaRejeitada(f: FixtureFinanceiro, tipo: TipoTitulo = "PAGAR") {
    const parcela = await parcelaNova(f, tipo);
    const baixa = await registrarBaixa(f.sessao, parcela.id, {
      data: new Date(),
      valorPago: 100,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: f.contaBancariaId,
    });
    await rejeitarBaixa(f.sessaoAdmin, baixa.id, "Valor diferente do comprovante");
    return { parcela, baixa };
  }

  test("dispensa grava quem, quando e o motivo, e registra a auditoria", async () => {
    const { baixa } = await baixaRejeitada(fx);
    const dispensada = await dispensarRejeicao(fx.sessao, baixa.id, "  pagamento não aconteceu  ");

    expect(dispensada.dispensadaPorId).toBe(fx.sessao.usuarioId);
    expect(dispensada.dispensadaEm).toBeInstanceOf(Date);
    expect(dispensada.motivoDispensa).toBe("pagamento não aconteceu");
    const auditoria = await prisma.auditLog.findFirst({ where: { entidadeId: baixa.id, acao: "DISPENSAR_REJEICAO" } });
    expect(auditoria).not.toBeNull();
  });

  test("motivo curto, perfil sem titulo:baixar, filial somente leitura e outra filial são recusados", async () => {
    const { baixa } = await baixaRejeitada(fx);
    await expect(dispensarRejeicao(fx.sessao, baixa.id, " a ")).rejects.toThrow("Informe o motivo da dispensa");
    await expect(dispensarRejeicao({ ...fx.sessao, perfil: "GESTOR" }, baixa.id, "motivo ok")).rejects.toThrow(
      PermissionError,
    );
    await expect(dispensarRejeicao(fx.sessaoSomenteLeitura, baixa.id, "motivo ok")).rejects.toThrow();
    await expect(dispensarRejeicao(fxOutra.sessao, baixa.id, "motivo ok")).rejects.toThrow();
    const intacta = await prisma.baixa.findUniqueOrThrow({ where: { id: baixa.id } });
    expect(intacta.dispensadaEm).toBeNull();
  });

  test("baixa que não é rejeitada, já dispensada ou já resolvida não é dispensada", async () => {
    const parcela = await parcelaNova(fx);
    const pendente = await registrarBaixa(fx.sessao, parcela.id, {
      data: new Date(),
      valorPago: 50,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fx.contaBancariaId,
    });
    await expect(dispensarRejeicao(fx.sessao, pendente.id, "motivo ok")).rejects.toThrow(
      "Só uma baixa rejeitada pode ser dispensada",
    );

    const { baixa: dispensada } = await baixaRejeitada(fx);
    await dispensarRejeicao(fx.sessao, dispensada.id, "primeira vez");
    await expect(dispensarRejeicao(fx.sessao, dispensada.id, "segunda vez")).rejects.toThrow(
      RejeicaoNaoDispensavelError,
    );

    // Relançada: a rejeição se resolveu sozinha.
    const { parcela: relancada, baixa: resolvida } = await baixaRejeitada(fx);
    await registrarBaixa(fx.sessao, relancada.id, {
      data: new Date(),
      valorPago: 100,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      contaBancariaId: fx.contaBancariaId,
    });
    await expect(dispensarRejeicao(fx.sessao, resolvida.id, "motivo ok")).rejects.toThrow(
      "Esta rejeição já foi resolvida",
    );
  });

  test("contarRejeicoesEmAberto e o filtro rejeitadas: só as em aberto, por tipo e por filial", async () => {
    const fxConta = await criarFixtureFinanceiro("BXRC");
    try {
      const aberta = await baixaRejeitada(fxConta, "PAGAR");
      const dispensada = await baixaRejeitada(fxConta, "PAGAR");
      await dispensarRejeicao(fxConta.sessao, dispensada.baixa.id, "não houve pagamento");
      const cancelada = await baixaRejeitada(fxConta, "PAGAR");
      await cancelarParcela(fxConta.sessaoAdmin, cancelada.parcela.id);
      await baixaRejeitada(fxConta, "RECEBER");
      await baixaRejeitada(fxOutra, "PAGAR");

      expect(await contarRejeicoesEmAberto(fxConta.filialId, "PAGAR")).toBe(1);
      expect(await contarRejeicoesEmAberto(fxConta.filialId, "RECEBER")).toBe(1);

      const filtrados = await listarTitulos(fxConta.filialId, "PAGAR", { rejeitadas: true });
      expect(filtrados.map((t) => t.parcelas[0].id)).toEqual([aberta.parcela.id]);
      expect(await listarTitulos(fxConta.filialId, "PAGAR")).toHaveLength(3);
    } finally {
      await limparFixtureFinanceiro(fxConta);
    }
  });
});
