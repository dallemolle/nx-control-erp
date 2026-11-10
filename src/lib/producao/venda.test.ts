import { describe, expect, test } from "vitest";
import {
  atrasoEntregaDias,
  calcularItem,
  calcularPedido,
  loteVencidoNaData,
  situacaoPagamento,
} from "./venda";

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
