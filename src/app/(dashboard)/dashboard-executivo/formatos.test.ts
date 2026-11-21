import { describe, expect, test } from "vitest";
import { dicaEmReais, eixoEmReais, ROTULOS_FAIXA_AGING } from "./formatos";

describe("formatos dos gráficos do Dashboard executivo", () => {
  test("eixo compacto e dica em reais", () => {
    expect(eixoEmReais(38000).replace(/\s/g, " ")).toBe("38 mil");
    expect(dicaEmReais(38000).replace(/\s/g, " ")).toBe("R$ 38.000,00");
  });

  test("faixas do aging em dias de atraso", () => {
    expect(Object.values(ROTULOS_FAIXA_AGING)).toEqual(["1–30 dias", "31–60 dias", "61–90 dias", "Mais de 90 dias"]);
  });
});
