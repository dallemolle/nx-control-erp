import { describe, expect, test } from "vitest";
import { filtrosDasOPs } from "./filtros";

describe("filtrosDasOPs", () => {
  test("verificar aceita só balanco e branqueamento", () => {
    expect(filtrosDasOPs({ verificar: "balanco" }).verificar).toBe("balanco");
    expect(filtrosDasOPs({ verificar: "branqueamento" }).verificar).toBe("branqueamento");
    expect(filtrosDasOPs({ verificar: "outro" }).verificar).toBeUndefined();
  });
});
