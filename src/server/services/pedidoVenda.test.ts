import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { FilialSomenteLeituraError, PermissionError } from "@/server/auth/permissions";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  criarLoteDeTeste,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import {
  criarPedido,
  listarPedidos,
  lotesParaVenda,
  MSG_SEM_CATEGORIA_VENDA,
  MSG_SEM_CONTA_CAIXA,
  MSG_SEM_CONTA_RECEBIMENTO,
  obterPedido,
} from "./pedidoVenda";
import { cancelarRecepcao, criarRecepcao } from "./recepcaoFruto";
import { registrarMovimento } from "./estoque";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("pedido de venda", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;

  /** Lote de polpa com 100 kg a R$ 2,00/kg, válido até 2027. */
  const novoLote = (opcoes: { kg?: number; validade?: Date; custoKg?: number } = {}) =>
    criarLoteDeTeste(fx, {
      produtoId: cat.produtoPolpaId,
      localId: cat.localCamaraId,
      kg: opcoes.kg ?? 100,
      custoKg: opcoes.custoKg ?? 2,
      data: d("2026-11-01"),
      validade: opcoes.validade ?? d("2027-11-01"),
    });

  const pedido = (itens: unknown[], extra: Record<string, unknown> = {}) =>
    pedidoVendaSchema.parse({
      data: "2026-11-10",
      clienteId: cad.clienteId,
      formaPagamento: "A_PRAZO",
      vencimento: "2026-12-10",
      retiraNaPropriedade: "true",
      itens: JSON.stringify(itens),
      ...extra,
    });

  const saldo = async (loteId: string) =>
    Number((await prisma.lote.findUniqueOrThrow({ where: { id: loteId } })).saldoKg);

  const tituloDo = async (pedidoId: string) => {
    const p = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: pedidoId } });
    return prisma.titulo.findUniqueOrThrow({ where: { id: p.tituloId! }, include: { parcelas: true } });
  };

  beforeAll(async () => {
    fx = await criarFixtureProducao("venda");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
  });
  afterAll(async () => {
    await fx.limpar();
  });
  beforeEach(async () => {
    await configurarVendas(fx, cad);
  });

  test("a prazo: número 1 e depois 2, estoque baixado e título a receber sem baixa", async () => {
    const lote = await novoLote();
    const primeiro = await criarPedido(fx.sessao("VENDAS"), pedido([{ loteId: lote.id, quantidadeKg: 10, precoKg: 5 }]));
    const segundo = await criarPedido(fx.sessao("VENDAS"), pedido([{ loteId: lote.id, quantidadeKg: 10, precoKg: 5 }]));
    expect([primeiro.numero, segundo.numero]).toEqual([1, 2]);
    expect(await saldo(lote.id)).toBe(80);

    const item = await prisma.itemPedidoVenda.findFirstOrThrow({ where: { pedidoId: primeiro.pedidoId } });
    expect(Number(item.custoKg)).toBe(2);
    const movimentos = await prisma.movimentoEstoque.findMany({ where: { itemPedidoId: item.id } });
    expect(movimentos.map((m) => [m.tipo, Number(m.quantidadeKg)])).toEqual([["VENDA", -10]]);

    const titulo = await tituloDo(primeiro.pedidoId);
    expect(titulo).toMatchObject({
      tipo: "RECEBER",
      clienteId: cad.clienteId,
      documento: "PV-1",
      categoriaFinanceiraId: cad.categoriaVendaId,
      classificacaoFiscal: "GERENCIAL",
      tipoComprovante: "RECIBO",
    });
    expect(titulo.parcelas).toHaveLength(1);
    expect(Number(titulo.parcelas[0].valorOriginal)).toBe(50);
    expect(titulo.parcelas[0].dataVencimento.toISOString().slice(0, 10)).toBe("2026-12-10");
    expect(await prisma.baixa.count({ where: { parcela: { tituloId: titulo.id } } })).toBe(0);
    const gravado = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: primeiro.pedidoId } });
    expect(gravado.baixaAutomaticaId).toBeNull();
    expect(gravado.contaBancariaId).toBeNull();
  });

  test("dinheiro: baixa aprovada e lançamento conciliado na conta Caixa", async () => {
    const lote = await novoLote();
    const r = await criarPedido(
      fx.sessao("VENDAS"),
      pedido([{ loteId: lote.id, quantidadeKg: 10, precoKg: 5 }], { formaPagamento: "DINHEIRO", vencimento: "" }),
    );
    const gravado = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: r.pedidoId } });
    const baixa = await prisma.baixa.findUniqueOrThrow({ where: { id: gravado.baixaAutomaticaId! } });
    expect(baixa).toMatchObject({ statusAprovacao: "APROVADO", contaBancariaId: cad.contaCaixaId });
    const lancamento = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: baixa.id } });
    expect(lancamento).toMatchObject({ tipo: "ENTRADA", conciliado: true, contaBancariaId: cad.contaCaixaId });
    expect(Number(lancamento.valor)).toBe(50);
    const titulo = await tituloDo(r.pedidoId);
    expect(titulo.parcelas[0].status).toBe("PAGO");
    expect(titulo.parcelas[0].dataVencimento.toISOString().slice(0, 10)).toBe("2026-11-10");
  });

  test("Pix: lançamento não conciliado na conta de recebimento", async () => {
    const lote = await novoLote();
    const r = await criarPedido(
      fx.sessao("VENDAS"),
      pedido([{ loteId: lote.id, quantidadeKg: 10, precoKg: 5 }], { formaPagamento: "PIX" }),
    );
    const gravado = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: r.pedidoId } });
    expect(gravado.contaBancariaId).toBe(cad.contaCorrenteId);
    expect(gravado.vencimento).toBeNull();
    const lancamento = await prisma.lancamentoBancario.findFirstOrThrow({ where: { baixaId: gravado.baixaAutomaticaId! } });
    expect(lancamento).toMatchObject({ conciliado: false, contaBancariaId: cad.contaCorrenteId });
  });

  test("VENDAS cria venda à vista com baixa aprovada sem permissões de título", async () => {
    const lote = await novoLote();
    const r = await criarPedido(
      fx.sessao("VENDAS"),
      pedido([{ loteId: lote.id, quantidadeKg: 1, precoKg: 5 }], { formaPagamento: "CARTAO" }),
    );
    const gravado = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: r.pedidoId } });
    expect((await prisma.baixa.findUniqueOrThrow({ where: { id: gravado.baixaAutomaticaId! } })).statusAprovacao).toBe(
      "APROVADO",
    );
  });

  test("recusas de configuração", async () => {
    const lote = await novoLote();
    const itens = [{ loteId: lote.id, quantidadeKg: 1, precoKg: 5 }];
    const configurar = (dados: Record<string, string | null>) =>
      prisma.configuracaoProducao.update({ where: { filialId: fx.filialAId }, data: dados });

    await configurar({ categoriaVendaId: null });
    await expect(criarPedido(fx.sessao("VENDAS"), pedido(itens))).rejects.toThrow(MSG_SEM_CATEGORIA_VENDA);

    await configurarVendas(fx, cad);
    await configurar({ contaRecebimentoPadraoId: null, contaCaixaPadraoId: null });
    await expect(criarPedido(fx.sessao("VENDAS"), pedido(itens, { formaPagamento: "PIX" }))).rejects.toThrow(
      MSG_SEM_CONTA_RECEBIMENTO,
    );
    await expect(criarPedido(fx.sessao("VENDAS"), pedido(itens, { formaPagamento: "DINHEIRO" }))).rejects.toThrow(
      MSG_SEM_CONTA_CAIXA,
    );
    // A prazo não usa conta.
    await expect(criarPedido(fx.sessao("VENDAS"), pedido(itens))).resolves.toMatchObject({ numero: expect.any(Number) });
  });

  test("dinheiro em conta corrente e Pix na conta Caixa são recusados", async () => {
    const lote = await novoLote();
    const itens = [{ loteId: lote.id, quantidadeKg: 1, precoKg: 5 }];
    await expect(
      criarPedido(
        fx.sessao("VENDAS"),
        pedido(itens, { formaPagamento: "DINHEIRO", contaBancariaId: cad.contaCorrenteId }),
      ),
    ).rejects.toThrow("Venda em dinheiro entra numa conta Caixa");
    await expect(
      criarPedido(fx.sessao("VENDAS"), pedido(itens, { formaPagamento: "PIX", contaBancariaId: cad.contaCaixaId })),
    ).rejects.toThrow("Pix, transferência e cartão não entram na conta Caixa");
  });

  test("falha no segundo item não grava nada", async () => {
    const lote1 = await novoLote();
    const lote2 = await novoLote({ kg: 5 });
    const filial = { filialId: fx.filialAId };
    const contar = async () => ({
      pedidos: await prisma.pedidoVenda.count({ where: filial }),
      itens: await prisma.itemPedidoVenda.count({ where: { pedido: filial } }),
      movimentos: await prisma.movimentoEstoque.count({ where: filial }),
      titulos: await prisma.titulo.count({ where: filial }),
      baixas: await prisma.baixa.count({ where: { parcela: { titulo: filial } } }),
    });
    const antes = await contar();
    await expect(
      criarPedido(
        fx.sessao("VENDAS"),
        pedido(
          [
            { loteId: lote1.id, quantidadeKg: 10, precoKg: 5 },
            { loteId: lote2.id, quantidadeKg: 6, precoKg: 5 },
          ],
          { formaPagamento: "DINHEIRO" },
        ),
      ),
    ).rejects.toThrow(`Saldo insuficiente no lote ${lote2.codigo}`);
    expect(await contar()).toEqual(antes);
    expect(await saldo(lote1.id)).toBe(100);

    const { _max } = await prisma.pedidoVenda.aggregate({ where: filial, _max: { numero: true } });
    const proximo = await criarPedido(fx.sessao("VENDAS"), pedido([{ loteId: lote1.id, quantidadeKg: 1, precoKg: 5 }]));
    expect(proximo.numero).toBe((_max.numero ?? 0) + 1);
  });

  test("lote repetido, de recepção excluída e de outra filial são recusados", async () => {
    const lote = await novoLote();
    await expect(
      criarPedido(
        fx.sessao("VENDAS"),
        pedido([
          { loteId: lote.id, quantidadeKg: 1, precoKg: 5 },
          { loteId: lote.id, quantidadeKg: 2, precoKg: 5 },
        ]),
      ),
    ).rejects.toThrow(`O lote ${lote.codigo} aparece mais de uma vez no pedido`);

    const recepcao = await criarRecepcao(
      fx.sessao("PRODUCAO"),
      recepcaoSchema.parse({
        data: "2026-11-09",
        produtoId: cat.produtoFrutoId,
        origem: "PROPRIA",
        talhaoId: cat.talhaoId,
        localId: cat.localRecepcaoId,
        unidade: "KG",
        pesoBruto: "50",
        descarte: "0",
      }),
    );
    await cancelarRecepcao(fx.sessao("PRODUCAO"), recepcao.recepcaoId, "Lançada por engano");
    // Saldo devolvido à mão: a regra é a recepção excluída, não o saldo.
    await prisma.$transaction((tx) =>
      registrarMovimento(tx, {
        filialId: fx.filialAId,
        loteId: recepcao.loteId,
        data: d("2026-11-09"),
        tipo: "AJUSTE",
        quantidadeKg: 10,
        usuarioId: fx.usuarioId,
      }),
    );
    await expect(
      criarPedido(fx.sessao("VENDAS"), pedido([{ loteId: recepcao.loteId, quantidadeKg: 1, precoKg: 5 }])),
    ).rejects.toThrow(`O lote ${recepcao.codigoLote} é de uma recepção excluída`);

    const deOutraFilial = await prisma.lote.create({
      data: {
        filialId: fx.filialBId,
        codigo: `B-${Date.now()}`,
        produtoId: cat.produtoPolpaId,
        origem: "PRODUCAO",
        data: d("2026-11-01"),
        validade: d("2027-11-01"),
        localId: cat.localCamaraId,
        quantidadeInicialKg: 10,
        saldoKg: 10,
        custoKg: 1,
      },
    });
    await expect(
      criarPedido(fx.sessao("VENDAS"), pedido([{ loteId: deOutraFilial.id, quantidadeKg: 1, precoKg: 5 }])),
    ).rejects.toThrow("Lote não encontrado");
  });

  test("lote vencido na data do pedido: bloqueado, liberado só por quem pode e com motivo", async () => {
    const vencido = await novoLote({ validade: d("2026-11-09") });
    const semMotivo = [{ loteId: vencido.id, quantidadeKg: 1, precoKg: 5 }];
    const comMotivo = [{ ...semMotivo[0], motivoLiberacaoVencido: "Cliente ciente; uso imediato" }];

    await expect(criarPedido(fx.sessao("ADMINISTRADOR"), pedido(semMotivo))).rejects.toThrow(
      `O lote ${vencido.codigo} venceu em 09/11/2026`,
    );
    await expect(criarPedido(fx.sessao("VENDAS"), pedido(comMotivo))).rejects.toThrow(
      `O lote ${vencido.codigo} venceu em 09/11/2026`,
    );
    const liberado = await criarPedido(fx.sessao("ADMINISTRADOR"), pedido(comMotivo));
    const item = await prisma.itemPedidoVenda.findFirstOrThrow({ where: { pedidoId: liberado.pedidoId } });
    expect(item.motivoLiberacaoVencido).toBe("Cliente ciente; uso imediato");

    // Validade igual à data do pedido não está vencido; motivo enviado é descartado.
    const noLimite = await novoLote({ validade: d("2026-11-10") });
    const r = await criarPedido(
      fx.sessao("VENDAS"),
      pedido([{ loteId: noLimite.id, quantidadeKg: 1, precoKg: 5, motivoLiberacaoVencido: "sem necessidade" }]),
    );
    const itemNoLimite = await prisma.itemPedidoVenda.findFirstOrThrow({ where: { pedidoId: r.pedidoId } });
    expect(itemNoLimite.motivoLiberacaoVencido).toBeNull();
  });

  test("pedidos simultâneos recebem números distintos e consecutivos", async () => {
    const lote = await novoLote();
    const resultados = await Promise.all(
      [1, 2].map(() => criarPedido(fx.sessao("VENDAS"), pedido([{ loteId: lote.id, quantidadeKg: 1, precoKg: 5 }]))),
    );
    const numeros = resultados.map((r) => r.numero).sort((a, b) => a - b);
    expect(numeros[1]).toBe(numeros[0] + 1);
    expect(await saldo(lote.id)).toBe(98);
  });

  test("classificação: do cliente, pela nota, ou gerencial", async () => {
    const lote = await novoLote();
    const itens = [{ loteId: lote.id, quantidadeKg: 1, precoKg: 5 }];

    const fiscalDoCliente = await criarPedido(fx.sessao("VENDAS"), pedido(itens, { clienteId: cad.clienteFiscalId }));
    expect(await tituloDo(fiscalDoCliente.pedidoId)).toMatchObject({
      classificacaoFiscal: "FISCAL",
      tipoComprovante: "NFE",
      numeroDocumentoFiscal: null,
      documento: `PV-${fiscalDoCliente.numero}`,
    });

    const nota = `NF-${Date.now()}`;
    const comNota = await criarPedido(fx.sessao("VENDAS"), pedido(itens, { numeroDocumentoFiscal: nota }));
    expect(await tituloDo(comNota.pedidoId)).toMatchObject({
      classificacaoFiscal: "FISCAL",
      numeroDocumentoFiscal: nota,
      documento: nota,
    });

    const semNota = await criarPedido(fx.sessao("VENDAS"), pedido(itens));
    expect(await tituloDo(semNota.pedidoId)).toMatchObject({ classificacaoFiscal: "GERENCIAL", tipoComprovante: "RECIBO" });

    const gerencialComNumero = await criarPedido(
      fx.sessao("VENDAS"),
      pedido(itens, { classificacaoFiscal: "GERENCIAL", numeroDocumentoFiscal: "999" }),
    );
    expect(await tituloDo(gerencialComNumero.pedidoId)).toMatchObject({
      classificacaoFiscal: "GERENCIAL",
      numeroDocumentoFiscal: null,
    });
    const gravado = await prisma.pedidoVenda.findUniqueOrThrow({ where: { id: gerencialComNumero.pedidoId } });
    expect(gravado.numeroDocumentoFiscal).toBeNull();
  });

  test("entrega só quando não retira; padrões do pedido e do cliente", async () => {
    const lote = await novoLote();
    const itens = [{ loteId: lote.id, quantidadeKg: 1, precoKg: 5 }];
    const comEntrega = await criarPedido(fx.sessao("VENDAS"), pedido(itens, { retiraNaPropriedade: "false" }));
    const entrega = await prisma.entrega.findUniqueOrThrow({ where: { pedidoId: comEntrega.pedidoId } });
    expect(entrega).toMatchObject({ status: "PENDENTE", endereco: "Rua A, 10" });
    expect(entrega.dataPrevista.toISOString().slice(0, 10)).toBe("2026-11-10");

    const retira = await criarPedido(fx.sessao("VENDAS"), pedido(itens));
    expect(await prisma.entrega.findUnique({ where: { pedidoId: retira.pedidoId } })).toBeNull();
  });

  test("canal herdado do cliente, ou o informado", async () => {
    const lote = await novoLote();
    const itens = [{ loteId: lote.id, quantidadeKg: 1, precoKg: 5 }];
    const herdado = await criarPedido(fx.sessao("VENDAS"), pedido(itens));
    const informado = await criarPedido(fx.sessao("VENDAS"), pedido(itens, { canal: "VAREJO" }));
    const canais = await prisma.pedidoVenda.findMany({
      where: { id: { in: [herdado.pedidoId, informado.pedidoId] } },
      select: { id: true, canal: true },
    });
    expect(canais.find((p) => p.id === herdado.pedidoId)?.canal).toBe("ATACADO");
    expect(canais.find((p) => p.id === informado.pedidoId)?.canal).toBe("VAREJO");
  });

  test("permissões", async () => {
    const lote = await novoLote();
    const dados = pedido([{ loteId: lote.id, quantidadeKg: 1, precoKg: 5 }]);
    await expect(criarPedido(fx.sessao("CONSULTA"), dados)).rejects.toThrow(PermissionError);
    await expect(criarPedido(fx.sessao("PRODUCAO"), dados)).rejects.toThrow(PermissionError);
    await expect(criarPedido(fx.sessao("VENDAS", { somenteLeitura: true }), dados)).rejects.toThrow(
      FilialSomenteLeituraError,
    );
  });

  test("lotesParaVenda: FEFO, sem zerados e com a marca de vencido na data", async () => {
    const depois = await novoLote({ validade: d("2027-01-01") });
    const antes = await novoLote({ validade: d("2026-12-01") });
    const zerado = await novoLote({ kg: 0 });
    const ids = new Set([depois.id, antes.id, zerado.id]);

    const lotes = (await lotesParaVenda(fx.filialAId, d("2026-12-15"))).filter((l) => ids.has(l.id));
    expect(lotes.map((l) => l.id)).toEqual([antes.id, depois.id]);
    expect(lotes.map((l) => l.vencido)).toEqual([true, false]);
    expect(lotes[0]).toMatchObject({ saldoKg: 100, custoKg: 2, produto: { codigo: "AGC" } });
  });

  test("listarPedidos filtra por período, cliente, status e situação, com totais", async () => {
    const cliente = await prisma.cliente.create({ data: { empresaId: fx.empresaId, nome: "Cliente da lista" } });
    const lote = await novoLote();
    const itens = [{ loteId: lote.id, quantidadeKg: 10, precoKg: 5 }];
    await criarPedido(fx.sessao("VENDAS"), pedido(itens, { clienteId: cliente.id }));
    await criarPedido(fx.sessao("VENDAS"), pedido(itens, { clienteId: cliente.id, formaPagamento: "DINHEIRO" }));

    const periodo = { inicio: d("2026-11-01"), fim: d("2026-11-30") };
    const hoje = d("2026-11-10");
    const todos = await listarPedidos(fx.filialAId, { ...periodo, clienteId: cliente.id }, hoje);
    expect(todos).toHaveLength(2);
    expect(todos[0]).toMatchObject({ valor: 50, custo: 20, margem: 30, cliente: { nome: "Cliente da lista" } });

    const pagos = await listarPedidos(fx.filialAId, { ...periodo, clienteId: cliente.id, situacao: "PAGO" }, hoje);
    expect(pagos.map((p) => p.formaPagamento)).toEqual(["DINHEIRO"]);
    expect(
      await listarPedidos(fx.filialAId, { ...periodo, clienteId: cliente.id, status: "CANCELADO" }, hoje),
    ).toHaveLength(0);
    expect(
      await listarPedidos(fx.filialAId, { inicio: d("2026-12-01"), fim: d("2026-12-31"), clienteId: cliente.id }, hoje),
    ).toHaveLength(0);
  });

  test("obterPedido por número, só na filial", async () => {
    const lote = await novoLote();
    const r = await criarPedido(fx.sessao("VENDAS"), pedido([{ loteId: lote.id, quantidadeKg: 10, precoKg: 5 }]));
    const detalhe = await obterPedido(fx.filialAId, r.numero, d("2026-11-10"));
    expect(detalhe).toMatchObject({ numero: r.numero, totais: { valor: 50 }, situacao: "EM_ABERTO" });
    expect(detalhe?.itens[0]).toMatchObject({ valor: 50, custo: 20, margem: 30, lote: { codigo: lote.codigo } });
    expect(await obterPedido(fx.filialBId, r.numero, d("2026-11-10"))).toBeNull();
  });
});
