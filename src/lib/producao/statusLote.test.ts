import { describe, expect, test } from "vitest";
import { diasParaVencer, statusDoLote } from "./statusLote";

const ALERTAS = { alertaVencimentoCongeladoDias: 30, alertaVencimentoResfriadoDias: 1 };
const HOJE = new Date("2026-11-09");
const em = (dias: number) => new Date(HOJE.getTime() + dias * 86_400_000);

describe("status do lote (RN-16)", () => {
  test("dias para vencer", () => {
    expect(diasParaVencer(em(3), HOJE)).toBe(3);
    expect(diasParaVencer(em(-1), HOJE)).toBe(-1);
  });
  test("zerado vence qualquer outra situação", () => {
    expect(statusDoLote({ saldoKg: 0, validade: em(-5), conservacao: "CONGELADO" }, HOJE, ALERTAS)).toBe("ZERADO");
  });
  test("vencido", () => {
    expect(statusDoLote({ saldoKg: 5, validade: em(-1), conservacao: "CONGELADO" }, HOJE, ALERTAS)).toBe("VENCIDO");
  });
  test("congelado usa o alerta de 30 dias", () => {
    expect(statusDoLote({ saldoKg: 5, validade: em(30), conservacao: "CONGELADO" }, HOJE, ALERTAS)).toBe("VENCENDO");
    expect(statusDoLote({ saldoKg: 5, validade: em(31), conservacao: "CONGELADO" }, HOJE, ALERTAS)).toBe("OK");
  });
  test("in natura e resfriado usam o alerta de 1 dia", () => {
    expect(statusDoLote({ saldoKg: 5, validade: em(1), conservacao: "IN_NATURA" }, HOJE, ALERTAS)).toBe("VENCENDO");
    expect(statusDoLote({ saldoKg: 5, validade: em(2), conservacao: "IN_NATURA" }, HOJE, ALERTAS)).toBe("OK");
    expect(statusDoLote({ saldoKg: 5, validade: em(1), conservacao: "RESFRIADO" }, HOJE, ALERTAS)).toBe("VENCENDO");
  });
  test("vence hoje ainda não está vencido", () => {
    expect(statusDoLote({ saldoKg: 5, validade: HOJE, conservacao: "CONGELADO" }, HOJE, ALERTAS)).toBe("VENCENDO");
  });
});
