import { describe, expect, test } from "vitest";
import { TEMA_PADRAO } from "./padrao";
import { validarTema } from "./validar";

describe("TEMA_PADRAO", () => {
  test("passa na validação sem erros nem avisos", () => {
    expect(validarTema(TEMA_PADRAO)).toMatchObject({ ok: true, avisos: [] });
  });

  test("tem claro e escuro e deixa no automático o que não cabe em #RRGGBB", () => {
    expect(TEMA_PADRAO.cores.escuro).toBeDefined();
    expect(TEMA_PADRAO.cores.claro.borda).toBeUndefined();
    expect(TEMA_PADRAO.cores.claro.erro).toBeUndefined();
    expect(TEMA_PADRAO.cores.escuro?.borda).toBeUndefined();
    expect(TEMA_PADRAO.fontes).toBeUndefined();
    expect(TEMA_PADRAO.raio).toBeUndefined();
  });
});
