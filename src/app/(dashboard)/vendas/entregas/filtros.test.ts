import { describe, expect, test } from "vitest";
import { filtrosDeEntregas } from "./filtros";

describe("filtrosDeEntregas", () => {
  test("atraso=1 liga o filtro; outro valor não", () => {
    expect(filtrosDeEntregas({ atraso: "1" }).atrasadas).toBe(true);
    expect(filtrosDeEntregas({ atraso: "x" }).atrasadas).toBe(false);
    expect(filtrosDeEntregas({}).atrasadas).toBe(false);
  });
});
