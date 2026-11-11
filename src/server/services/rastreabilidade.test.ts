import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import { cabecalhoOPSchema, consumoSchema, processoOPSchema, producaoSchema } from "@/lib/schemas/ordemProducao";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import { ajusteSchema } from "@/lib/schemas/ajusteEstoque";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import { criarRecepcao } from "./recepcaoFruto";
import {
  adicionarConsumo,
  adicionarProducao,
  atualizarProcessoOP,
  cancelarOP,
  criarOP,
  encerrarOP,
  removerConsumo,
} from "./ordemProducao";
import { cancelarPedido, criarPedido } from "./pedidoVenda";
import { criarAjuste } from "./ajusteEstoque";
import { buscarLotes, descreverOrigem, rastrearLote } from "./rastreabilidade";

/**
 * Cenário: fruto próprio (100 kg), de terceiro (50 kg) e extra (30 kg).
 * OP1 encerrada consome 60 + 50 + 10 (o extra é removido) e produz AGC 40 e AFN 20.
 * OP2 cancelada consome 10 do próprio e produz AGC 5.
 * Pedido A: AGC 10 kg com entrega. Pedido B: AFN 5 kg, cancelado.
 * Pedido C: 20 kg do fruto próprio in natura. Ajuste: amostra de 1 kg do próprio.
 */
describe("rastreabilidade", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  const adm = () => fx.sessao("ADMINISTRADOR");

  const lotes = { proprio: "", terceiro: "", extra: "", grosso: "", fino: "" };
  const numeros = { op1: "", op2: "", pedidoA: 0, pedidoB: 0, pedidoC: 0 };

  const receber = (extra: Record<string, unknown>) =>
    criarRecepcao(
      adm(),
      recepcaoSchema.parse({
        data: "2026-11-10",
        produtoId: cat.produtoFrutoId,
        localId: cat.localRecepcaoId,
        unidade: "KG",
        descarte: "0",
        ...extra,
      }),
    );
  const consumir = (opId: string, loteId: string, kg: number) =>
    adicionarConsumo(adm(), opId, consumoSchema.parse({ loteId, quantidadeKg: kg, motivoLiberacaoVencido: "" }));
  const produzir = (opId: string, produtoId: string, kg: number) =>
    adicionarProducao(adm(), opId, producaoSchema.parse({ produtoId, quantidadeKg: kg, localId: cat.localCamaraId }));
  const vender = (loteId: string, kg: number, extra: Record<string, unknown> = {}) =>
    criarPedido(
      adm(),
      pedidoVendaSchema.parse({
        data: "2026-11-10",
        clienteId: cad.clienteId,
        formaPagamento: "A_PRAZO",
        vencimento: "2026-12-10",
        retiraNaPropriedade: "true",
        itens: JSON.stringify([{ loteId, quantidadeKg: kg, precoKg: 10 }]),
        ...extra,
      }),
    );

  beforeAll(async () => {
    fx = await criarFixtureProducao("rastreio");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: cat.categoriaCompraId, prazoPagamentoProdutorDias: 7 },
    });
    await prisma.cliente.update({
      where: { id: cad.clienteId },
      data: { telefone: "(93) 99999-0000", municipio: "Santarém" },
    });

    const proprio = await receber({ origem: "PROPRIA", talhaoId: cat.talhaoId, pesoBruto: "100", qualidade: "A" });
    const terceiro = await receber({ origem: "TERCEIRO", fornecedorId: cat.fornecedorId, pesoBruto: "50", preco: "2" });
    const extra = await receber({ origem: "PROPRIA", talhaoId: cat.talhaoId, pesoBruto: "30" });
    lotes.proprio = proprio.codigoLote;
    lotes.terceiro = terceiro.codigoLote;
    lotes.extra = extra.codigoLote;

    const op1 = await criarOP(
      adm(),
      cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId, responsavel: "Joana" }),
    );
    await consumir(op1.id, proprio.loteId, 60);
    await consumir(op1.id, terceiro.loteId, 50);
    const linhaExtra = await consumir(op1.id, extra.loteId, 10);
    await removerConsumo(adm(), linhaExtra.id);
    const grosso = await produzir(op1.id, cat.produtoPolpaId, 40);
    const fino = await produzir(op1.id, cat.produtoPolpaFinoId, 20);
    await atualizarProcessoOP(
      adm(),
      op1.id,
      processoOPSchema.parse({
        branqueamentoTemperaturaC: "85",
        branqueamentoTempoS: "12",
        aguaLitros: "0",
        carocoResiduoKg: "48",
        perdaKg: "2",
      }),
    );
    await encerrarOP(adm(), op1.id, { confirmarVerificar: true });
    lotes.grosso = grosso.codigoLote;
    lotes.fino = fino.codigoLote;
    numeros.op1 = op1.numero;

    const op2 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op2.id, proprio.loteId, 10);
    await produzir(op2.id, cat.produtoPolpaId, 5);
    await cancelarOP(adm(), op2.id, "Lançada por engano");
    numeros.op2 = op2.numero;

    numeros.pedidoA = (await vender(grosso.loteId, 10, { retiraNaPropriedade: "false" })).numero;
    const pedidoB = await vender(fino.loteId, 5, { clienteId: cad.clienteFiscalId });
    await cancelarPedido(adm(), pedidoB.pedidoId, "Cliente desistiu");
    numeros.pedidoB = pedidoB.numero;
    numeros.pedidoC = (await vender(proprio.loteId, 20, { clienteId: cad.clienteFiscalId })).numero;

    await criarAjuste(
      adm(),
      ajusteSchema.parse({
        loteId: proprio.loteId,
        data: "2026-11-10",
        sentido: "SAIDA",
        quantidadeKg: "1",
        motivo: "AMOSTRA",
      }),
    );
  });

  afterAll(async () => {
    await fx.limpar();
  });

  test("polpa: OP de origem, frutos consumidos e clientes diretos", async () => {
    const r = (await rastrearLote(adm(), lotes.grosso, { incluirCancelados: false }))!;
    expect(r.lote).toMatchObject({ codigo: lotes.grosso, categoria: "POLPA", quantidadeInicialKg: 40, saldoKg: 30 });
    expect(r.recepcao).toBeNull();
    expect(r.opOrigem).toMatchObject({
      numero: numeros.op1,
      status: "ENCERRADA",
      responsavel: "Joana",
      branqueamento: "OK",
    });
    // 60 kg de polpa ÷ 110 kg de fruto, arredondado como na OP.
    expect(r.opOrigem!.rendimento).toBe(0.5455);
    expect(r.opOrigem!.balanco.status).toBe("OK");
    expect(r.frutosConsumidos.map((f) => [f.codigo, f.kgConsumido])).toEqual([
      [lotes.proprio, 60],
      [lotes.terceiro, 50],
    ]);
    expect(descreverOrigem(r.frutosConsumidos[0].origem)).toBe("Própria · Talhão 1");
    expect(descreverOrigem(r.frutosConsumidos[1].origem)).toBe("Terceiro · Produtor exemplo");
    expect(r.opsQueConsumiram).toEqual([]);
    expect(r.clientes).toHaveLength(1);
    expect(r.clientes[0]).toMatchObject({
      caminho: "DIRETO",
      loteVendido: lotes.grosso,
      opNumero: null,
      pedidoNumero: numeros.pedidoA,
      pedidoCancelado: false,
      kg: 10,
      entrega: { status: "PENDENTE" },
      cliente: {
        nome: "Cliente exemplo",
        telefone: "(93) 99999-0000",
        municipio: "Santarém",
        enderecoEntrega: "Rua A, 10",
      },
    });
    expect(r.destino).toMatchObject({ entradaKg: 40, vendidoKg: 10, saldoKg: 30, confere: true });
  });

  test("polpa com cancelados: consumo removido e pedido cancelado marcados", async () => {
    const r = (await rastrearLote(adm(), lotes.grosso, { incluirCancelados: true }))!;
    expect(r.frutosConsumidos.find((f) => f.codigo === lotes.extra)?.removido).toBe(true);

    const fino = (await rastrearLote(adm(), lotes.fino, { incluirCancelados: false }))!;
    expect(fino.clientes).toEqual([]);
    const finoComCancelados = (await rastrearLote(adm(), lotes.fino, { incluirCancelados: true }))!;
    expect(finoComCancelados.clientes.map((c) => [c.pedidoNumero, c.pedidoCancelado])).toEqual([
      [numeros.pedidoB, true],
    ]);
    expect(finoComCancelados.destino).toMatchObject({ vendidoKg: 0, saldoKg: 20, confere: true });
  });

  test("fruto: recepção, OPs, polpas geradas e todos os clientes", async () => {
    const r = (await rastrearLote(adm(), lotes.proprio, { incluirCancelados: false }))!;
    expect(r.lote).toMatchObject({ categoria: "FRUTO", quantidadeInicialKg: 100, saldoKg: 19 });
    expect(r.recepcao).toMatchObject({
      origem: "PROPRIA",
      talhao: "Talhão 1",
      qualidade: "A",
      pesoBrutoKg: 100,
      cancelada: false,
    });
    expect(r.opOrigem).toBeNull();
    expect(r.opsQueConsumiram.map((o) => [o.numero, o.kgDesteLote])).toEqual([[numeros.op1, 60]]);
    expect(r.opsQueConsumiram[0].lotesPolpa.map((l) => [l.codigo, l.kg])).toEqual([
      [lotes.grosso, 40],
      [lotes.fino, 20],
    ]);
    expect(r.clientes.map((c) => [c.caminho, c.loteVendido, c.opNumero, c.pedidoNumero])).toEqual([
      ["POLPA", lotes.grosso, numeros.op1, numeros.pedidoA],
      ["DIRETO", lotes.proprio, null, numeros.pedidoC],
    ]);
    expect(r.clientes[1].entrega).toBeNull();
    expect(r.destino).toEqual({
      entradaKg: 100,
      estornoEntradaKg: 0,
      vendidoKg: 20,
      consumidoOpKg: 60,
      ajustes: [{ motivo: "AMOSTRA", kg: -1 }],
      saldoKg: 19,
      confere: true,
    });
  });

  test("fruto com cancelados: OP cancelada e pedido cancelado da polpa entram marcados", async () => {
    const r = (await rastrearLote(adm(), lotes.proprio, { incluirCancelados: true }))!;
    expect(r.opsQueConsumiram.map((o) => [o.numero, o.status])).toEqual([
      [numeros.op1, "ENCERRADA"],
      [numeros.op2, "CANCELADA"],
    ]);
    expect(r.clientes.find((c) => c.pedidoNumero === numeros.pedidoB)).toMatchObject({
      caminho: "POLPA",
      loteVendido: lotes.fino,
      pedidoCancelado: true,
    });
    // O destino vem do ledger e não muda com a opção.
    expect(r.destino.consumidoOpKg).toBe(60);
  });

  test("fruto com consumo removido só aparece com cancelados", async () => {
    const sem = (await rastrearLote(adm(), lotes.extra, { incluirCancelados: false }))!;
    expect(sem.opsQueConsumiram).toEqual([]);
    expect(sem.clientes).toEqual([]);
    const com = (await rastrearLote(adm(), lotes.extra, { incluirCancelados: true }))!;
    expect(com.opsQueConsumiram).toHaveLength(1);
    expect(com.opsQueConsumiram[0]).toMatchObject({ numero: numeros.op1, consumoRemovido: true, kgDesteLote: 0 });
  });

  test("terceiro: fornecedor na recepção", async () => {
    const r = (await rastrearLote(adm(), lotes.terceiro, { incluirCancelados: false }))!;
    expect(r.recepcao).toMatchObject({ origem: "TERCEIRO", fornecedor: "Produtor exemplo", talhao: null });
  });

  test("código em minúsculas e com espaços; outra filial e código inexistente dão null", async () => {
    const porMinusculas = await rastrearLote(adm(), `  ${lotes.grosso.toLowerCase()} `, { incluirCancelados: false });
    expect(porMinusculas?.lote.codigo).toBe(lotes.grosso);
    const filialB = fx.sessao("ADMINISTRADOR", { filial: "B" });
    expect(await rastrearLote(filialB, lotes.grosso, { incluirCancelados: false })).toBeNull();
    expect(await rastrearLote(adm(), "NAO-EXISTE", { incluirCancelados: false })).toBeNull();
    expect(await rastrearLote(adm(), "   ", { incluirCancelados: false })).toBeNull();
  });

  test("buscarLotes por trecho, só na filial", async () => {
    const codigos = (await buscarLotes(adm(), "fa-261110")).map((l) => l.codigo);
    expect(codigos).toEqual(expect.arrayContaining([lotes.proprio, lotes.terceiro, lotes.extra]));
    expect(codigos).not.toContain(lotes.grosso);
    expect(await buscarLotes(fx.sessao("ADMINISTRADOR", { filial: "B" }), "FA-261110")).toEqual([]);
    expect(await buscarLotes(adm(), "  ")).toEqual([]);
  });
});
