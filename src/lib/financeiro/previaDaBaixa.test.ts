import { describe, expect, it } from "vitest";
import { previaDaBaixa } from "./previaDaBaixa";

const semNbsp = (t: string) => t.replace(/\u00a0/g, " ");
const v = (valorPago: string, valorJuros = "0", valorMulta = "0", valorDesconto = "0") => ({ valorPago, valorJuros, valorMulta, valorDesconto });

describe("previaDaBaixa", () => {
  it("sem valor pago, sem prévia", () => expect(previaDaBaixa(1000, v(""))).toBeNull());
  it("quita com desconto", () =>
    expect(semNbsp(previaDaBaixa(1000, v("950", "0", "0", "50"))!.texto)).toBe("Abate R$ 1.000,00 da parcela · fica R$ 0,00 em aberto"));
  it("parcial", () =>
    expect(semNbsp(previaDaBaixa(1000, v("400"))!.texto)).toBe("Abate R$ 400,00 da parcela · fica R$ 600,00 em aberto"));
  it("acima do saldo", () =>
    expect(semNbsp(previaDaBaixa(1000, v("1100"))!.texto)).toBe("Abate R$ 1.100,00 da parcela · R$ 100,00 acima do saldo"));
  it("não abate nada: erro com a mensagem da recusa", () =>
    expect(previaDaBaixa(1000, v("20", "30"))).toEqual({ texto: "Juros e multa não podem ser maiores que o valor pago mais o desconto", erro: true }));
  it("campo vazio de ajuste conta como zero", () =>
    expect(semNbsp(previaDaBaixa(1000, v("1000", "", "", ""))!.texto)).toBe("Abate R$ 1.000,00 da parcela · fica R$ 0,00 em aberto"));
});
