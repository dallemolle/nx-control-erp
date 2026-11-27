import { describe, expect, test } from "vitest";
import { formatarMoeda } from "@/lib/formatacao";
import {
  atrasoEntregaDias,
  calcularItem,
  calcularPedido,
  condicaoDasParcelas,
  gerarParcelasPorPrazos,
  interpretarPrazos,
  loteVencidoNaData,
  vencimentoNaVenda,
  rotuloSituacaoPagamento,
  situacaoPagamento,
  validarParcelasVenda,
} from "./venda";

test("rotuloSituacaoPagamento troca o texto só na maquininha", () => {
  expect(rotuloSituacaoPagamento("EM_ABERTO", true)).toBe("Aguardando repasse");
  expect(rotuloSituacaoPagamento("VENCIDO", true)).toBe("Repasse atrasado");
  expect(rotuloSituacaoPagamento("PAGO", true)).toBe("Pago");
  expect(rotuloSituacaoPagamento("EM_ABERTO", false)).toBe("Em aberto");
});

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("calcularItem", () => {
  test("arredonda valor, custo e margem a 2 casas no fim", () => {
    expect(calcularItem({ quantidadeKg: 10.5, precoKg: 4.3333, custoKg: 1.5 })).toEqual({
      valor: 45.5,
      custo: 15.75,
      margem: 29.75,
    });
  });

  test("margem negativa quando o preço é menor que o custo", () => {
    expect(calcularItem({ quantidadeKg: 2, precoKg: 1, custoKg: 1.5 }).margem).toBe(-1);
  });
});

describe("calcularPedido", () => {
  test("soma os itens e calcula a margem %", () => {
    const r = calcularPedido([
      { quantidadeKg: 10.5, precoKg: 4.3333, custoKg: 1.5 },
      { quantidadeKg: 2, precoKg: 3, custoKg: 1 },
    ]);
    expect(r).toMatchObject({ valor: 51.5, custo: 17.75, margem: 33.75 });
    expect(r.margemPercentual).toBeCloseTo(0.6553, 4);
  });

  test("margem % é 0 quando o valor é 0", () => {
    expect(calcularPedido([]).margemPercentual).toBe(0);
  });
});

describe("atrasoEntregaDias", () => {
  const hoje = d("2026-11-13");

  test("entregue: realizada − prevista", () => {
    expect(
      atrasoEntregaDias({ status: "ENTREGUE", dataPrevista: d("2026-11-10"), dataRealizada: d("2026-11-12") }, hoje),
    ).toBe(2);
  });

  test("entregue antes do previsto: 0", () => {
    expect(
      atrasoEntregaDias({ status: "ENTREGUE", dataPrevista: d("2026-11-10"), dataRealizada: d("2026-11-08") }, hoje),
    ).toBe(0);
  });

  test("pendente: hoje − prevista", () => {
    expect(atrasoEntregaDias({ status: "PENDENTE", dataPrevista: d("2026-11-10"), dataRealizada: null }, hoje)).toBe(3);
  });

  test("em rota com previsão futura: 0", () => {
    expect(atrasoEntregaDias({ status: "EM_ROTA", dataPrevista: d("2026-11-20"), dataRealizada: null }, hoje)).toBe(0);
  });

  test("cancelada: null", () => {
    expect(
      atrasoEntregaDias({ status: "CANCELADA", dataPrevista: d("2026-11-01"), dataRealizada: null }, hoje),
    ).toBeNull();
  });
});

describe("situacaoPagamento", () => {
  const hoje = d("2026-11-13");

  test("todas pagas: PAGO", () => {
    expect(situacaoPagamento([{ status: "PAGO", dataVencimento: d("2026-11-01") }], hoje)).toBe("PAGO");
  });

  test("em aberto no prazo: EM_ABERTO", () => {
    expect(situacaoPagamento([{ status: "A_VENCER", dataVencimento: d("2026-11-15") }], hoje)).toBe("EM_ABERTO");
  });

  test("vencimento passado, mesmo com status gravado desatualizado: VENCIDO", () => {
    expect(situacaoPagamento([{ status: "EM_ABERTO", dataVencimento: d("2026-11-12") }], hoje)).toBe("VENCIDO");
  });

  test("parcialmente paga e vencida: VENCIDO", () => {
    expect(situacaoPagamento([{ status: "PARCIALMENTE_PAGO", dataVencimento: d("2026-11-01") }], hoje)).toBe(
      "VENCIDO",
    );
  });

  test("todas canceladas: CANCELADO", () => {
    expect(situacaoPagamento([{ status: "CANCELADO", dataVencimento: d("2026-11-01") }], hoje)).toBe("CANCELADO");
  });
});

describe("loteVencidoNaData", () => {
  test("validade igual à data não está vencido; um dia antes está", () => {
    expect(loteVencidoNaData(d("2026-11-10"), d("2026-11-10"))).toBe(false);
    expect(loteVencidoNaData(d("2026-11-09"), d("2026-11-10"))).toBe(true);
  });
});

describe("interpretarPrazos", () => {
  test("dias separados por barra, com espaços", () => {
    expect(interpretarPrazos(" 28 / 56 ")).toEqual({ ok: true, prazos: [28, 56] });
  });
  test("zero é vencimento no dia do pedido", () => {
    expect(interpretarPrazos("0/30")).toEqual({ ok: true, prazos: [0, 30] });
  });
  test("vazio", () => {
    expect(interpretarPrazos("  ")).toEqual({ ok: false, erro: "Informe os prazos" });
  });
  test("não numérico, negativo ou decimal", () => {
    expect(interpretarPrazos("28/abc")).toEqual({ ok: false, erro: "Prazo inválido: abc" });
    expect(interpretarPrazos("-5")).toEqual({ ok: false, erro: "Prazo inválido: -5" });
    expect(interpretarPrazos("10.5")).toEqual({ ok: false, erro: "Prazo inválido: 10.5" });
    expect(interpretarPrazos("28//56")).toEqual({ ok: false, erro: "Prazo inválido: (vazio)" });
  });
  test("fora de ordem ou repetido", () => {
    expect(interpretarPrazos("56/28")).toEqual({ ok: false, erro: "Os prazos devem ser crescentes" });
    expect(interpretarPrazos("28/28")).toEqual({ ok: false, erro: "Os prazos devem ser crescentes" });
  });
  test("até 60 parcelas", () => {
    const sessenta = Array.from({ length: 60 }, (_, i) => (i + 1) * 30).join("/");
    expect(interpretarPrazos(sessenta)).toMatchObject({ ok: true });
    expect(interpretarPrazos(`${sessenta}/9999`)).toEqual({ ok: false, erro: "No máximo 60 parcelas" });
  });
});

describe("gerarParcelasPorPrazos", () => {
  test("divide igual e a última leva os centavos", () => {
    const parcelas = gerarParcelasPorPrazos(d("2026-11-10"), 100, [30, 60, 90]);
    expect(parcelas.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(parcelas.map((p) => p.dataVencimento.toISOString().slice(0, 10))).toEqual([
      "2026-12-10",
      "2027-01-09",
      "2027-02-08",
    ]);
  });
  test("uma parcela leva o total; prazo 0 vence na data", () => {
    expect(gerarParcelasPorPrazos(d("2026-11-10"), 50, [0])).toEqual([{ dataVencimento: d("2026-11-10"), valor: 50 }]);
  });
});

describe("condicaoDasParcelas", () => {
  test("dias desde a data do pedido", () => {
    expect(condicaoDasParcelas(d("2026-11-10"), [d("2026-12-08"), d("2027-01-09")])).toBe("28/60");
  });
});

describe("validarParcelasVenda", () => {
  const p = (iso: string, valor: number) => ({ dataVencimento: d(iso), valor });
  test("válidas", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 100, [p("2026-12-10", 33.33), p("2027-01-09", 66.67)])).toBeNull();
  });
  test("sem parcelas ou acima do limite", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 100, [])).toBe("Informe os prazos");
    const muitas = Array.from({ length: 61 }, (_, i) => ({
      dataVencimento: new Date(d("2026-11-10").getTime() + i * 86_400_000),
      valor: 1,
    }));
    expect(validarParcelasVenda(d("2026-11-10"), 61, muitas)).toBe("No máximo 60 parcelas");
  });
  test("vencimento ou valor em branco", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 50, [p("2026-12-10", NaN)])).toBe(
      "Preencha vencimento e valor de cada parcela",
    );
    expect(validarParcelasVenda(d("2026-11-10"), 50, [{ dataVencimento: new Date(NaN), valor: 50 }])).toBe(
      "Preencha vencimento e valor de cada parcela",
    );
  });
  test("vencimento antes da data do pedido", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 50, [p("2026-11-09", 50)])).toBe(
      "O vencimento não pode ser antes da data do pedido",
    );
  });
  test("datas fora de ordem ou repetidas", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 100, [p("2026-12-10", 50), p("2026-12-10", 50)])).toBe(
      "Os vencimentos devem ser crescentes",
    );
  });
  test("valor zero ou negativo", () => {
    expect(validarParcelasVenda(d("2026-11-10"), 50, [p("2026-12-10", 50), p("2027-01-10", 0)])).toBe(
      "O valor de cada parcela deve ser maior que zero",
    );
  });
  test("soma diferente do total", () => {
    // formatarMoeda usa espaço não separável depois do "R$": montar a mensagem com ele.
    expect(validarParcelasVenda(d("2026-11-10"), 100, [p("2026-12-10", 50), p("2027-01-10", 49.99)])).toBe(
      `A soma das parcelas (${formatarMoeda(99.99)}) difere do total do pedido (${formatarMoeda(100)})`,
    );
  });
});

describe("vencimentoNaVenda", () => {
  const lote = (validade: string, liberadoAte: string | null = null) => ({ validade, liberadoAte });

  test("no prazo até o dia da validade", () => {
    expect(vencimentoNaVenda(lote("2026-11-21"), "2026-11-21")).toBe("NO_PRAZO");
  });

  test("vencido sem liberação, ou com liberação que não cobre a data", () => {
    expect(vencimentoNaVenda(lote("2026-11-18"), "2026-11-21")).toBe("VENCIDO");
    expect(vencimentoNaVenda(lote("2026-11-18", "2026-11-20"), "2026-11-21")).toBe("VENCIDO");
  });

  test("liberado quando a liberação cobre a data do pedido (último dia inclusive)", () => {
    expect(vencimentoNaVenda(lote("2026-11-17", "2026-11-21"), "2026-11-21")).toBe("LIBERADO");
  });
});
