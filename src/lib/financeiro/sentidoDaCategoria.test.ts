import { describe, expect, test } from "vitest";
import { valorNoSentidoDaCategoria } from "./sentidoDaCategoria";

describe("valorNoSentidoDaCategoria", () => {
  test("despesa: saída soma, entrada (devolução, estorno) abate", () => {
    expect(valorNoSentidoDaCategoria("DESPESA", "SAIDA", 250)).toBe(250);
    expect(valorNoSentidoDaCategoria("DESPESA", "ENTRADA", 200)).toBe(-200);
  });

  test("receita: entrada soma, saída (devolução ao cliente) abate", () => {
    expect(valorNoSentidoDaCategoria("RECEITA", "ENTRADA", 1000)).toBe(1000);
    expect(valorNoSentidoDaCategoria("RECEITA", "SAIDA", 30)).toBe(-30);
  });
});
