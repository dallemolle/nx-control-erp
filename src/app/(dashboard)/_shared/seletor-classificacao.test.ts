import { describe, expect, test } from "vitest";
import { queryComClassificacao } from "./seletor-classificacao";

describe("queryComClassificacao", () => {
  test("define a classificação preservando os demais parâmetros", () => {
    expect(queryComClassificacao("granularidade=MES&data=2026-11-01", "GERENCIAL")).toBe(
      "granularidade=MES&data=2026-11-01&classificacao=GERENCIAL",
    );
  });

  test("troca uma classificação já presente", () => {
    expect(queryComClassificacao("classificacao=FISCAL&ano=2026", "GERENCIAL")).toBe("classificacao=GERENCIAL&ano=2026");
  });

  test("Todos (sentinela, vazio ou null) remove o parâmetro", () => {
    expect(queryComClassificacao("ano=2026&classificacao=FISCAL", "__nenhum__")).toBe("ano=2026");
    expect(queryComClassificacao("classificacao=FISCAL", "")).toBe("");
    expect(queryComClassificacao("classificacao=FISCAL", null)).toBe("");
  });
});
