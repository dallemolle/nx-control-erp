import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import {
  criarLancamentoManual,
  criarTransferencia,
  calcularSaldoContabil,
  informarSaldoBancario,
  buscarUltimoSaldoInformado,
  listarLancamentos,
  editarLancamentoManual,
  editarTransferencia,
} from "./lancamentoBancario";
import { ErroClassificacaoFiscal } from "./classificacaoFiscal";

describe("lancamentoBancario", () => {
  let fixture: FixtureFinanceiro; // perfil FINANCEIRO: só lancamento:ler
  let fixtureTesouraria: FixtureFinanceiro; // perfil TESOURARIA: lancamento:ler + lancamento:escrever
  let contaDestinoId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("LBF");
    fixtureTesouraria = await criarFixtureFinanceiro("LBT", "TESOURARIA");

    const contaDestino = await prisma.contaBancaria.create({
      data: {
        filialId: fixtureTesouraria.filialId,
        bancoId: fixtureTesouraria.bancoId,
        agencia: "0002",
        conta: "destino-1",
        saldoInicial: 0,
      },
    });
    contaDestinoId = contaDestino.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await limparFixtureFinanceiro(fixtureTesouraria);
    await prisma.$disconnect();
  });

  test("lançamento manual de entrada aumenta o saldo contábil", async () => {
    const saldoAntes = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);

    await criarLancamentoManual(fixtureTesouraria.sessao, {
      contaBancariaId: fixtureTesouraria.contaBancariaId,
      data: new Date(),
      tipo: "ENTRADA",
      valor: 150,
      descricao: "Rendimento de aplicação",
      categoriaFinanceiraId: "__nenhum__",
    });

    const saldoDepois = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);
    expect(saldoDepois).toBe(saldoAntes + 150);
  });

  test("lançamento manual de saída diminui o saldo contábil", async () => {
    const saldoAntes = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);

    await criarLancamentoManual(fixtureTesouraria.sessao, {
      contaBancariaId: fixtureTesouraria.contaBancariaId,
      data: new Date(),
      tipo: "SAIDA",
      valor: 40,
      descricao: "Tarifa bancária",
      categoriaFinanceiraId: "__nenhum__",
    });

    const saldoDepois = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);
    expect(saldoDepois).toBe(saldoAntes - 40);
  });

  test("transferência entre contas move o valor de uma conta para a outra", async () => {
    const saldoOrigemAntes = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);
    const saldoDestinoAntes = await calcularSaldoContabil(contaDestinoId);

    const { saida, entrada } = await criarTransferencia(fixtureTesouraria.sessao, {
      contaOrigemId: fixtureTesouraria.contaBancariaId,
      contaDestinoId,
      data: new Date(),
      valor: 500,
      descricao: "Aplicação de excedente de caixa",
    });

    expect(saida.transferenciaId).toBe(entrada.transferenciaId);

    const saldoOrigemDepois = await calcularSaldoContabil(fixtureTesouraria.contaBancariaId);
    const saldoDestinoDepois = await calcularSaldoContabil(contaDestinoId);
    expect(saldoOrigemDepois).toBe(saldoOrigemAntes - 500);
    expect(saldoDestinoDepois).toBe(saldoDestinoAntes + 500);
  });

  test("conta bancária de outra filial é rejeitada", async () => {
    await expect(
      criarLancamentoManual(fixtureTesouraria.sessao, {
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(),
        tipo: "ENTRADA",
        valor: 10,
        descricao: "Teste cross-tenant",
        categoriaFinanceiraId: "__nenhum__",
      }),
    ).rejects.toThrow(/não pertence à filial ativa/);
  });

  test("perfil sem lancamento:escrever não consegue criar lançamento manual", async () => {
    await expect(
      criarLancamentoManual(fixture.sessao, {
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(),
        tipo: "ENTRADA",
        valor: 10,
        descricao: "Teste permissão",
        categoriaFinanceiraId: "__nenhum__",
      }),
    ).rejects.toThrow(PermissionError);
  });

  test("informar saldo bancário retorna o mais recente por data", async () => {
    await informarSaldoBancario(fixtureTesouraria.sessao, {
      contaBancariaId: fixtureTesouraria.contaBancariaId,
      data: new Date("2026-08-01"),
      saldo: 1000,
    });
    await informarSaldoBancario(fixtureTesouraria.sessao, {
      contaBancariaId: fixtureTesouraria.contaBancariaId,
      data: new Date("2026-09-01"),
      saldo: 1200,
    });

    const ultimo = await buscarUltimoSaldoInformado(fixtureTesouraria.contaBancariaId);
    expect(Number(ultimo?.saldo)).toBe(1200);
  });
});

describe("dimensões analíticas em criarLancamentoManual", () => {
  let fixture: FixtureFinanceiro;
  let centroCustoId: string;
  let centroLucroId: string;
  let safraId: string;
  let projetoId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("LBD", "TESOURARIA");

    const centroCusto = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Administrativo", codigo: "ADM" },
    });
    centroCustoId = centroCusto.id;

    const centroLucro = await prisma.centroLucro.create({
      data: { filialId: fixture.filialId, nome: "Unidade 1", codigo: "U1" },
    });
    centroLucroId = centroLucro.id;

    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra 2026",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-12-31"),
      },
    });
    safraId = safra.id;

    const projeto = await prisma.projeto.create({
      data: { filialId: fixture.filialId, nome: "Expansão", codigo: "EXP" },
    });
    projetoId = projeto.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("grava as 4 dimensões quando informadas", async () => {
    const lancamento = await criarLancamentoManual(fixture.sessao, {
      contaBancariaId: fixture.contaBancariaId,
      data: new Date(),
      tipo: "SAIDA",
      valor: 80,
      descricao: "Compra de insumo",
      categoriaFinanceiraId: "__nenhum__",
      centroCustoId,
      centroLucroId,
      safraId,
      projetoId,
    });

    expect(lancamento.centroCustoId).toBe(centroCustoId);
    expect(lancamento.centroLucroId).toBe(centroLucroId);
    expect(lancamento.safraId).toBe(safraId);
    expect(lancamento.projetoId).toBe(projetoId);
  });

  test("aceita omitir as 4 dimensões (todas opcionais)", async () => {
    const lancamento = await criarLancamentoManual(fixture.sessao, {
      contaBancariaId: fixture.contaBancariaId,
      data: new Date(),
      tipo: "SAIDA",
      valor: 20,
      descricao: "Sem dimensão",
      categoriaFinanceiraId: "__nenhum__",
    });

    expect(lancamento.centroCustoId).toBeNull();
    expect(lancamento.centroLucroId).toBeNull();
    expect(lancamento.safraId).toBeNull();
    expect(lancamento.projetoId).toBeNull();
  });

  test("recusa centro de custo que não pertence à filial ativa", async () => {
    const outraFixture = await criarFixtureFinanceiro("LBD2", "TESOURARIA");
    try {
      const centroCustoDeOutraFilial = await prisma.centroCusto.create({
        data: { filialId: outraFixture.filialId, nome: "De outra filial", codigo: "OUT" },
      });

      await expect(
        criarLancamentoManual(fixture.sessao, {
          contaBancariaId: fixture.contaBancariaId,
          data: new Date(),
          tipo: "SAIDA",
          valor: 10,
          descricao: "Cross-tenant",
          categoriaFinanceiraId: "__nenhum__",
          centroCustoId: centroCustoDeOutraFilial.id,
        }),
      ).rejects.toThrow(/não pertence à filial ativa/);
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });

  test("recusa categoria financeira que não pertence à filial ativa", async () => {
    const outraFixture = await criarFixtureFinanceiro("LBD3", "TESOURARIA");
    try {
      await expect(
        criarLancamentoManual(fixture.sessao, {
          contaBancariaId: fixture.contaBancariaId,
          data: new Date(),
          tipo: "SAIDA",
          valor: 10,
          descricao: "Categoria de outra filial",
          categoriaFinanceiraId: outraFixture.categoriaFinanceiraId,
        }),
      ).rejects.toThrow(/Categoria financeira não pertence à filial ativa/);
    } finally {
      await limparFixtureFinanceiro(outraFixture);
    }
  });

  test("grava a categoria financeira da própria filial", async () => {
    const lancamento = await criarLancamentoManual(fixture.sessao, {
      contaBancariaId: fixture.contaBancariaId,
      data: new Date(),
      tipo: "SAIDA",
      valor: 15,
      descricao: "Com categoria",
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
    });

    expect(lancamento.categoriaFinanceiraId).toBe(fixture.categoriaFinanceiraId);
  });
});

describe("classificação fiscal × gerencial em lançamentos", () => {
  let fixture: FixtureFinanceiro;
  let contaDestinoId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("LBC", "TESOURARIA");
    const contaDestino = await prisma.contaBancaria.create({
      data: { filialId: fixture.filialId, bancoId: fixture.bancoId, agencia: "0003", conta: "destino-lbc", saldoInicial: 0 },
    });
    contaDestinoId = contaDestino.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  const dadosBase = () => ({
    contaBancariaId: fixture.contaBancariaId,
    data: new Date(),
    tipo: "SAIDA" as const,
    valor: 30,
    descricao: "Lançamento classificado",
    categoriaFinanceiraId: "__nenhum__",
  });

  test("sem classificação informada, o lançamento manual nasce FISCAL", async () => {
    const lancamento = await criarLancamentoManual(fixture.sessao, dadosBase());
    expect(lancamento.classificacaoFiscal).toBe("FISCAL");
    expect(lancamento.tipoComprovante).toBeNull();
  });

  test("grava GERENCIAL com recibo e número do comprovante", async () => {
    const lancamento = await criarLancamentoManual(fixture.sessao, {
      ...dadosBase(),
      classificacaoFiscal: "GERENCIAL",
      tipoComprovante: "RECIBO",
      numeroComprovante: "R-15",
    });
    expect(lancamento.classificacaoFiscal).toBe("GERENCIAL");
    expect(lancamento.tipoComprovante).toBe("RECIBO");
    expect(lancamento.numeroComprovante).toBe("R-15");
  });

  test("recusa comprovante fiscal em lançamento gerencial", async () => {
    await expect(
      criarLancamentoManual(fixture.sessao, { ...dadosBase(), classificacaoFiscal: "GERENCIAL", tipoComprovante: "NFE" }),
    ).rejects.toThrow(ErroClassificacaoFiscal);
  });

  test("transferência fica sem classificação nos dois lados", async () => {
    const { saida, entrada } = await criarTransferencia(fixture.sessao, {
      contaOrigemId: fixture.contaBancariaId,
      contaDestinoId,
      data: new Date(),
      valor: 10,
      descricao: "Transferência",
    });
    expect(saida.classificacaoFiscal).toBeNull();
    expect(entrada.classificacaoFiscal).toBeNull();
  });

  test("listarLancamentos filtra por classificação; transferências só aparecem sem filtro", async () => {
    const todos = await listarLancamentos(fixture.filialId);
    const fiscais = await listarLancamentos(fixture.filialId, { classificacao: "FISCAL" });
    const gerenciais = await listarLancamentos(fixture.filialId, { classificacao: "GERENCIAL" });
    const transferencias = todos.filter((lancamento) => lancamento.origem === "TRANSFERENCIA");

    expect(transferencias.length).toBe(2);
    expect(fiscais.every((lancamento) => lancamento.classificacaoFiscal === "FISCAL")).toBe(true);
    expect(gerenciais.every((lancamento) => lancamento.classificacaoFiscal === "GERENCIAL")).toBe(true);
    expect(fiscais.length + gerenciais.length + transferencias.length).toBe(todos.length);
  });
});

describe("editarLancamentoManual", () => {
  let fx: FixtureFinanceiro;
  let contaCaixaId: string;

  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("LBE", "TESOURARIA");
    const caixa = await prisma.contaBancaria.create({
      data: { filialId: fx.filialId, bancoId: fx.bancoId, agencia: "0000", conta: "caixa-lbe", tipo: "CAIXA", saldoInicial: 0 },
    });
    contaCaixaId = caixa.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
  });

  function dadosBase(overrides: Partial<Parameters<typeof criarLancamentoManual>[1]> = {}) {
    return {
      contaBancariaId: fx.contaBancariaId,
      data: new Date("2026-11-20T00:00:00Z"),
      tipo: "SAIDA" as const,
      valor: 459,
      descricao: "Tarifa de manutenção",
      categoriaFinanceiraId: fx.categoriaFinanceiraId,
      ...overrides,
    };
  }

  async function conciliar(lancamentoId: string) {
    const lanc = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamentoId } });
    const grupo = await prisma.grupoConciliacao.create({
      data: { filialId: fx.filialId, contaBancariaId: lanc.contaBancariaId, usuarioId: fx.usuarioId },
    });
    await prisma.lancamentoBancario.update({
      where: { id: lancamentoId },
      data: { grupoConciliacaoId: grupo.id, conciliado: true },
    });
    return grupo.id;
  }

  test("sem grupo, corrige o valor e todos os campos, e audita antes e depois", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    const editado = await editarLancamentoManual(fx.sessao, lanc.id, dadosBase({ valor: 45.9, descricao: "Tarifa corrigida", tipo: "SAIDA" }));

    expect(Number(editado.valor)).toBe(45.9);
    expect(editado.descricao).toBe("Tarifa corrigida");

    const log = await prisma.auditLog.findFirstOrThrow({ where: { entidadeId: lanc.id, acao: "EDITAR" } });
    expect(log.valorAnterior).toMatchObject({ valor: "459", descricao: "Tarifa de manutenção" });
    expect(log.valorNovo).toMatchObject({ valor: "45.9", descricao: "Tarifa corrigida" });
  });

  test("trocar de banco para Caixa deixa conciliado; de Caixa para banco, não", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    expect(lanc.conciliado).toBe(false);

    const noCaixa = await editarLancamentoManual(fx.sessao, lanc.id, dadosBase({ contaBancariaId: contaCaixaId }));
    expect(noCaixa.conciliado).toBe(true);
    expect(noCaixa.grupoConciliacaoId).toBeNull();

    const deVolta = await editarLancamentoManual(fx.sessao, lanc.id, dadosBase());
    expect(deVolta.conciliado).toBe(false);
  });

  test("com grupo, muda descrição e categoria, mas não valor, data, tipo ou conta", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    const grupoId = await conciliar(lanc.id);

    const editado = await editarLancamentoManual(
      fx.sessao,
      lanc.id,
      dadosBase({ descricao: "Tarifa de novembro", categoriaFinanceiraId: "__nenhum__" }),
    );
    expect(editado.descricao).toBe("Tarifa de novembro");
    expect(editado.categoriaFinanceiraId).toBeNull();
    expect(editado.grupoConciliacaoId).toBe(grupoId);
    expect(editado.conciliado).toBe(true);

    for (const mudanca of [
      { valor: 45.9 },
      { data: new Date("2026-11-21T00:00:00Z") },
      { tipo: "ENTRADA" as const },
      { contaBancariaId: contaCaixaId },
    ]) {
      await expect(editarLancamentoManual(fx.sessao, lanc.id, dadosBase(mudanca))).rejects.toThrow(
        /conciliado com o extrato: só descrição e classificação podem mudar/,
      );
    }
  });

  test("com grupo, data no mesmo dia em outro horário não conta como mudança", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase({ data: new Date("2026-11-20T15:30:00Z") }));
    await conciliar(lanc.id);
    const editado = await editarLancamentoManual(fx.sessao, lanc.id, dadosBase({ descricao: "Mesmo dia" }));
    expect(editado.data.toISOString()).toBe("2026-11-20T15:30:00.000Z");
  });

  test("origem BAIXA e TRANSFERENCIA são recusadas", async () => {
    const { saida } = await criarTransferencia(fx.sessao, {
      contaOrigemId: fx.contaBancariaId,
      contaDestinoId: contaCaixaId,
      data: new Date("2026-11-20T00:00:00Z"),
      valor: 100,
      descricao: "Saque",
    });
    await expect(editarLancamentoManual(fx.sessao, saida.id, dadosBase())).rejects.toThrow(/Transferência/);

    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    await prisma.lancamentoBancario.update({ where: { id: lanc.id }, data: { origem: "BAIXA" } });
    await expect(editarLancamentoManual(fx.sessao, lanc.id, dadosBase())).rejects.toThrow(
      "Lançamento de baixa: corrija estornando a baixa",
    );
  });

  test("lançamento de outra filial não é encontrado; conta de outra filial é recusada", async () => {
    const outra = await criarFixtureFinanceiro("LBE2", "TESOURARIA");
    try {
      const lancOutra = await criarLancamentoManual(outra.sessao, {
        ...dadosBase(),
        contaBancariaId: outra.contaBancariaId,
        categoriaFinanceiraId: "__nenhum__",
      });
      await expect(editarLancamentoManual(fx.sessao, lancOutra.id, dadosBase())).rejects.toThrow(
        "Lançamento não encontrado na filial ativa",
      );

      const meu = await criarLancamentoManual(fx.sessao, dadosBase());
      await expect(
        editarLancamentoManual(fx.sessao, meu.id, dadosBase({ contaBancariaId: outra.contaBancariaId })),
      ).rejects.toThrow(/não pertence à filial ativa/);
      await expect(
        editarLancamentoManual(fx.sessao, meu.id, dadosBase({ categoriaFinanceiraId: outra.categoriaFinanceiraId })),
      ).rejects.toThrow(/não pertence à filial ativa/);
    } finally {
      await limparFixtureFinanceiro(outra);
    }
  });

  test("perfil sem lancamento:escrever é recusado", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    await expect(
      editarLancamentoManual({ ...fx.sessao, perfil: "FINANCEIRO" }, lanc.id, dadosBase()),
    ).rejects.toThrow(PermissionError);
  });

  test("se o lançamento ganhar grupo entre a leitura e a gravação, nada é gravado", async () => {
    const lanc = await criarLancamentoManual(fx.sessao, dadosBase());
    const lido = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lanc.id } });
    await conciliar(lanc.id);
    // Simula a leitura feita antes da conciliação.
    const espiao = vi.spyOn(prisma.lancamentoBancario, "findFirst").mockResolvedValueOnce(lido);
    try {
      await expect(editarLancamentoManual(fx.sessao, lanc.id, dadosBase({ valor: 45.9 }))).rejects.toThrow(
        /conciliado ou desconciliado agora há pouco/,
      );
    } finally {
      espiao.mockRestore();
    }
    const depois = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lanc.id } });
    expect(Number(depois.valor)).toBe(459);
  });
});

describe("editarTransferencia", () => {
  let fx: FixtureFinanceiro;
  let contaDestinoId: string;
  let contaCaixaId: string;

  beforeAll(async () => {
    fx = await criarFixtureFinanceiro("LBX", "TESOURARIA");
    const destino = await prisma.contaBancaria.create({
      data: { filialId: fx.filialId, bancoId: fx.bancoId, agencia: "0002", conta: "destino-lbx", saldoInicial: 0 },
    });
    contaDestinoId = destino.id;
    const caixa = await prisma.contaBancaria.create({
      data: { filialId: fx.filialId, bancoId: fx.bancoId, agencia: "0000", conta: "caixa-lbx", tipo: "CAIXA", saldoInicial: 0 },
    });
    contaCaixaId = caixa.id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fx);
  });

  async function conciliar(lancamentoId: string) {
    const lanc = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamentoId } });
    const grupo = await prisma.grupoConciliacao.create({
      data: { filialId: fx.filialId, contaBancariaId: lanc.contaBancariaId, usuarioId: fx.usuarioId },
    });
    await prisma.lancamentoBancario.update({
      where: { id: lancamentoId },
      data: { grupoConciliacaoId: grupo.id, conciliado: true },
    });
    return grupo.id;
  }

  function dadosTransf(overrides: Partial<Parameters<typeof criarTransferencia>[1]> = {}) {
    return {
      contaOrigemId: fx.contaBancariaId,
      contaDestinoId,
      data: new Date("2026-11-18T00:00:00Z"),
      valor: 2000,
      descricao: "Saque para o caixa",
      ...overrides,
    };
  }

  test("sem grupo, muda contas, data e valor nos dois lados e audita", async () => {
    const { saida, entrada } = await criarTransferencia(fx.sessao, dadosTransf());
    await editarTransferencia(
      fx.sessao,
      saida.transferenciaId!,
      dadosTransf({ contaDestinoId: contaCaixaId, valor: 1500, data: new Date("2026-11-19T00:00:00Z"), descricao: "Saque corrigido" }),
    );

    const novaSaida = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: saida.id } });
    const novaEntrada = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: entrada.id } });
    expect(Number(novaSaida.valor)).toBe(1500);
    expect(Number(novaEntrada.valor)).toBe(1500);
    expect(novaEntrada.contaBancariaId).toBe(contaCaixaId);
    expect(novaEntrada.conciliado).toBe(true); // lado Caixa
    expect(novaSaida.conciliado).toBe(false);
    expect(novaSaida.data.toISOString().slice(0, 10)).toBe("2026-11-19");
    expect(novaEntrada.descricao).toBe("Saque corrigido");

    const log = await prisma.auditLog.findFirstOrThrow({ where: { entidadeId: saida.id, acao: "EDITAR_TRANSFERENCIA" } });
    expect(log.valorNovo).toMatchObject({ valor: "1500", contaDestinoId: contaCaixaId });
  });

  test("com um lado no grupo, só a descrição muda", async () => {
    const { saida, entrada } = await criarTransferencia(fx.sessao, dadosTransf());
    await conciliar(saida.id);

    await editarTransferencia(fx.sessao, saida.transferenciaId!, dadosTransf({ descricao: "Saque de novembro" }));
    const novaEntrada = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: entrada.id } });
    expect(novaEntrada.descricao).toBe("Saque de novembro");

    await expect(
      editarTransferencia(fx.sessao, saida.transferenciaId!, dadosTransf({ valor: 1500 })),
    ).rejects.toThrow(/Esta transferência está conciliada com o extrato \(lado de .+\): só a descrição pode mudar/);
    const intacta = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: entrada.id } });
    expect(Number(intacta.valor)).toBe(2000);
  });

  test("transferência de outra filial não é encontrada", async () => {
    await expect(editarTransferencia(fx.sessao, crypto.randomUUID(), dadosTransf())).rejects.toThrow(
      "Transferência não encontrada na filial ativa",
    );
  });
});
