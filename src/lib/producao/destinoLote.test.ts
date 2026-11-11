import { describe, expect, test } from "vitest";
import { destinoDoLote, linhasDoDestino, type MovimentoDoLote } from "./destinoLote";

const mov = (tipo: MovimentoDoLote["tipo"], quantidadeKg: number, motivo: MovimentoDoLote["motivo"] = null): MovimentoDoLote => ({
  tipo,
  quantidadeKg,
  motivo,
});

describe("destinoDoLote", () => {
  test("fruto: entrada, OP, OP cancelada, venda e amostra fecham com o saldo", () => {
    const destino = destinoDoLote(
      [
        mov("ENTRADA", 100),
        mov("CONSUMO_OP", -60),
        mov("CONSUMO_OP", -10),
        mov("ESTORNO_CONSUMO_OP", 10),
        mov("VENDA", -20),
        mov("AJUSTE", -1, "AMOSTRA"),
      ],
      19,
    );
    expect(destino).toEqual({
      entradaKg: 100,
      estornoEntradaKg: 0,
      vendidoKg: 20,
      consumidoOpKg: 60,
      ajustes: [{ motivo: "AMOSTRA", kg: -1 }],
      saldoKg: 19,
      confere: true,
    });
  });

  test("polpa removida: produção e estorno; venda cancelada volta", () => {
    const destino = destinoDoLote(
      [mov("PRODUCAO_OP", 40), mov("VENDA", -5), mov("ESTORNO_VENDA", 5), mov("ESTORNO_PRODUCAO_OP", -40)],
      0,
    );
    expect(destino.entradaKg).toBe(40);
    expect(destino.estornoEntradaKg).toBe(40);
    expect(Object.is(destino.vendidoKg, 0)).toBe(true);
    expect(destino.confere).toBe(true);
  });

  test("ajuste sem motivo conta como Outro; saldo divergente não confere", () => {
    const destino = destinoDoLote([mov("ENTRADA", 10), mov("AJUSTE", 2), mov("AJUSTE", -1, "AVARIA")], 5);
    expect(destino.ajustes).toEqual([
      { motivo: "OUTRO", kg: 2 },
      { motivo: "AVARIA", kg: -1 },
    ]);
    expect(destino.confere).toBe(false);
  });
});

describe("linhasDoDestino", () => {
  test("linhas com sinal; estorno só quando houver", () => {
    const linhas = linhasDoDestino(
      destinoDoLote([mov("ENTRADA", 100), mov("CONSUMO_OP", -60), mov("VENDA", -20), mov("AJUSTE", -1, "AMOSTRA")], 19),
    );
    expect(linhas).toEqual([
      { rotulo: "Entrada", kg: 100 },
      { rotulo: "Vendido", kg: -20 },
      { rotulo: "Consumido em OP", kg: -60 },
      { rotulo: "Ajuste: Amostra (ADEPARA/laboratório)", kg: -1 },
      { rotulo: "Saldo", kg: 19 },
    ]);
    expect(linhasDoDestino(destinoDoLote([mov("ENTRADA", 5), mov("ESTORNO_RECEPCAO", -5)], 0))[1]).toEqual({
      rotulo: "Estorno da entrada",
      kg: -5,
    });
  });

  test("nada vendido nem consumido sai como 0, não -0", () => {
    const linhas = linhasDoDestino(destinoDoLote([mov("ENTRADA", 5)], 5));
    expect(Object.is(linhas.find((l) => l.rotulo === "Vendido")!.kg, 0)).toBe(true);
  });
});
