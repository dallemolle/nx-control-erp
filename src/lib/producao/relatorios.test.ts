import { describe, expect, test } from "vitest";
import {
  agregarVendasDetalhadas,
  agruparPorMes,
  blocosMensais,
  canalPrincipal,
  frutasComMovimento,
  montarColunasMensais,
  mesUTC,
  polpaPorProdutoMes,
  rotuloCanal,
  somarSaldos,
  type ItemDatado,
  type ItemVenda,
  type OPDatada,
  type RecepcaoDatada,
  type SaldoAReceber,
} from "./relatorios";

const d = (iso: string) => new Date(iso);

describe("mês UTC", () => {
  test("dia 31 às 23h UTC continua no mês; virada de ano", () => {
    expect(mesUTC(d("2026-01-31T23:00:00.000Z"))).toBe(0);
    expect(mesUTC(d("2026-12-31T00:00:00.000Z"))).toBe(11);
    expect(mesUTC(d("2027-01-01T00:00:00.000Z"))).toBe(0);
  });

  test("agruparPorMes devolve 12 baldes", () => {
    const baldes = agruparPorMes(
      [d("2026-03-05T00:00:00Z"), d("2026-03-20T00:00:00Z"), d("2026-12-01T00:00:00Z")],
      (x) => x,
    );
    expect(baldes).toHaveLength(12);
    expect(baldes[2]).toHaveLength(2);
    expect(baldes[11]).toHaveLength(1);
    expect(baldes[0]).toEqual([]);
  });
});

describe("colunas do relatório mensal", () => {
  const recepcoes: RecepcaoDatada[] = [
    { frutaId: "a", origem: "PROPRIA", brutoKg: 100, descarteKg: 10, valorTotal: 0, data: d("2026-10-05T00:00:00Z") },
    { frutaId: "b", origem: "TERCEIRO", brutoKg: 40, descarteKg: 4, valorTotal: 108, data: d("2026-10-05T00:00:00Z") },
    { frutaId: "a", origem: "TERCEIRO", brutoKg: 50, descarteKg: 0, valorTotal: 100, data: d("2026-11-10T00:00:00Z") },
  ];
  const op = (extra: Partial<OPDatada>): OPDatada => ({
    frutaId: "a",
    status: "ENCERRADA",
    frutoKg: 0,
    polpaKg: 0,
    custoTotal: 0,
    balancoVerificar: false,
    branqueamentoVerificar: false,
    data: d("2026-10-05T00:00:00Z"),
    ...extra,
  });
  const ops: OPDatada[] = [
    op({ frutoKg: 50, polpaKg: 20, custoTotal: 80 }),
    op({ status: "ABERTA", frutoKg: 40, polpaKg: 15, custoTotal: 999, data: d("2026-11-10T00:00:00Z") }),
    op({ status: "CANCELADA", frutoKg: 5, polpaKg: 2, custoTotal: 1, data: d("2026-11-10T00:00:00Z") }),
  ];
  const itens: ItemDatado[] = [
    { pedidoId: "p1", produtoId: "fa", categoria: "FRUTO", frutaId: "a", quantidadeKg: 5, precoKg: 8, custoKg: 1, data: d("2026-10-05T00:00:00Z") },
    { pedidoId: "p2", produtoId: "agc", categoria: "POLPA", frutaId: "a", quantidadeKg: 10, precoKg: 30, custoKg: 4, data: d("2026-11-12T00:00:00Z") },
  ];
  const colunas = montarColunasMensais(recepcoes, ops, itens);

  test("12 meses e o total", () => {
    expect(colunas).toHaveLength(13);
    expect(colunas.map((c) => c.mes)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, null]);
  });

  test("cada mês pelas funções do painel", () => {
    expect(colunas[9].recepcao.recebidoKg).toBe(126);
    expect(colunas[9].recepcaoPorFruta.b.terceirosKg).toBe(36);
    expect(colunas[9].pagoTerceiros).toBe(108);
    expect(colunas[9].processamento).toMatchObject({ quantidade: 1, frutoKg: 50, polpaKg: 20, custoMedioPolpa: 4 });
    expect(colunas[10].processamento).toMatchObject({ quantidade: 1, frutoKg: 40, polpaKg: 15, custoMedioPolpa: null });
    expect(colunas[9].vendas.faturamentoInNatura).toBe(40);
    expect(colunas[10].polpaPorFruta.a).toBe(300);
    expect(colunas[0].vendas.faturamento).toBe(0);
    expect(colunas[0].processamento.rendimento).toBeNull();
  });

  test("total do ano", () => {
    expect(colunas[12]).toMatchObject({ mes: null, pagoTerceiros: 208 });
    expect(colunas[12].recepcao.recebidoKg).toBe(176);
    expect(colunas[12].processamento).toMatchObject({ quantidade: 2, frutoKg: 90, polpaKg: 35 });
    expect(colunas[12].vendas.faturamento).toBe(340);
  });

  test("frutas com movimento, na ordem recebida", () => {
    const frutas = [
      { id: "a", nome: "Açaí" },
      { id: "b", nome: "Cupuaçu" },
      { id: "c", nome: "Graviola" },
    ];
    expect(frutasComMovimento(colunas[12], frutas)).toEqual(frutas.slice(0, 2));
  });

  test("blocos: próprio = recebido − terceiros; fruta sem movimento no mês = 0 ou —", () => {
    const blocos = blocosMensais([{ id: "a", nome: "Açaí" }]);
    expect(blocos.map((b) => b.titulo)).toEqual(["Recepção", "Processamento", "Vendas", "Custos"]);
    const ind = (titulo: string, rotulo: string) =>
      blocos.find((b) => b.titulo === titulo)!.indicadores.find((i) => i.rotulo === rotulo)!;
    expect(ind("Recepção", "Próprio").valor(colunas[9])).toBe(90);
    expect(ind("Recepção", "Terceiros").valor(colunas[10])).toBe(50);
    expect(ind("Processamento", "Rendimento").valor(colunas[0])).toBeNull();
    expect(ind("Custos", "Custo da polpa").valor(colunas[9])).toBe(4);
    expect(ind("Custos", "Fruto pago a terceiros").valor(colunas[12])).toBe(208);
  });
});

describe("polpa por produto × mês", () => {
  test("soma por mês e total", () => {
    const m = polpaPorProdutoMes([
      { produtoId: "agc", data: d("2026-10-05T00:00:00Z"), kg: 20 },
      { produtoId: "agc", data: d("2026-10-20T00:00:00Z"), kg: 0.5 },
      { produtoId: "afn", data: d("2026-11-10T00:00:00Z"), kg: 15 },
    ]);
    expect(m.get("agc")!.meses[9]).toBe(20.5);
    expect(m.get("agc")!.total).toBe(20.5);
    expect(m.get("afn")!.meses[10]).toBe(15);
    expect(m.get("afn")!.meses[9]).toBe(0);
  });
});

describe("relatório de vendas", () => {
  const item = (extra: Partial<ItemVenda>): ItemVenda => ({
    pedidoId: "p",
    produtoId: "agc",
    categoria: "POLPA",
    frutaId: "a",
    quantidadeKg: 1,
    precoKg: 10,
    custoKg: 4,
    clienteId: "c1",
    cliente: "Cliente exemplo",
    canal: "ATACADO",
    formaPagamento: "A_PRAZO",
    ...extra,
  });

  test("canal principal: maior faturamento; empate pela ordem do cadastro; sem canal por último", () => {
    expect(canalPrincipal([item({ canal: "VAREJO", quantidadeKg: 2 }), item({ canal: "ATACADO" })])).toBe("VAREJO");
    expect(canalPrincipal([item({ canal: "VAREJO" }), item({ canal: "ATACADO" })])).toBe("ATACADO");
    expect(canalPrincipal([item({ canal: null }), item({ canal: "OUTRO" })])).toBe("OUTRO");
    expect(canalPrincipal([item({ canal: null })])).toBeNull();
    expect(canalPrincipal([])).toBeNull();
  });

  test("rótulo do canal", () => {
    expect(rotuloCanal(null)).toBe("Sem canal");
    expect(rotuloCanal("ATACADO")).toBe("Atacado / distribuidor");
  });

  const itens: ItemVenda[] = [
    item({ pedidoId: "p2", quantidadeKg: 20, precoKg: 30, custoKg: 4 }),
    item({ pedidoId: "p3", produtoId: "cpc", quantidadeKg: 4, precoKg: 20, custoKg: 5, canal: "VAREJO", formaPagamento: "PIX" }),
    item({
      pedidoId: "p4",
      produtoId: "cpc",
      clienteId: "c2",
      cliente: "Mercado B",
      quantidadeKg: 10,
      precoKg: 20,
      custoKg: 5,
      canal: "VAREJO",
      formaPagamento: "DINHEIRO",
    }),
    item({
      pedidoId: "p5",
      clienteId: "c3",
      cliente: "Cliente fiscal",
      quantidadeKg: 5,
      precoKg: 32,
      custoKg: 4,
      canal: null,
      formaPagamento: "PIX",
    }),
  ];
  const saldos: SaldoAReceber[] = [
    { clienteId: "c1", cliente: "Cliente exemplo", formaPagamento: "A_PRAZO", saldo: 600 },
    { clienteId: "c4", cliente: "Cliente antigo", formaPagamento: "A_PRAZO", saldo: 300 },
  ];
  const r = agregarVendasDetalhadas(itens, saldos);

  test("total", () => {
    expect(r.total).toMatchObject({ kg: 39, faturamento: 1040, custo: 170, margem: 870, aReceber: 900, percentual: 1 });
    expect(somarSaldos(saldos)).toBe(900);
  });

  test("por cliente: faturamento, depois quem só tem saldo", () => {
    expect(r.porCliente.map((c) => [c.cliente, c.kg, c.faturamento, c.margem, c.canal, c.aReceber])).toEqual([
      ["Cliente exemplo", 24, 680, 580, "ATACADO", 600],
      ["Mercado B", 10, 200, 150, "VAREJO", 0],
      ["Cliente fiscal", 5, 160, 140, null, 0],
      ["Cliente antigo", 0, 0, 0, null, 300],
    ]);
    expect(r.porCliente[0].percentual).toBeCloseTo(680 / 1040, 10);
    expect(r.porCliente[3].precoMedio).toBeNull();
  });

  test("por produto, canal e forma", () => {
    expect(r.porProduto.map((p) => [p.produtoId, p.kg, p.faturamento, p.custoMedio])).toEqual([
      ["agc", 25, 760, 4],
      ["cpc", 14, 280, 5],
    ]);
    expect(r.porProduto[0].margemPercentual).toBeCloseTo(660 / 760, 10);
    expect(r.porCanal.map((c) => [c.canal, c.kg, c.faturamento])).toEqual([
      ["ATACADO", 20, 600],
      ["VAREJO", 14, 280],
      [null, 5, 160],
    ]);
    expect(r.porForma.map((f) => [f.formaPagamento, f.faturamento, f.aReceber])).toEqual([
      ["A_PRAZO", 600, 900],
      ["PIX", 240, 0],
      ["DINHEIRO", 200, 0],
    ]);
  });

  test("sem venda e sem saldo: listas vazias e razões nulas", () => {
    const vazio = agregarVendasDetalhadas([], []);
    expect(vazio.porCliente).toEqual([]);
    expect(vazio.total).toMatchObject({
      faturamento: 0,
      aReceber: 0,
      precoMedio: null,
      margemPercentual: null,
      percentual: null,
    });
  });
});
