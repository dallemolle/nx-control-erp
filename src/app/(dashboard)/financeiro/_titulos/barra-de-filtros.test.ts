import { describe, expect, test } from "vitest";
import { construirUrlComFiltro } from "./barra-de-filtros";

describe("construirUrlComFiltro", () => {
  test("adiciona um novo filtro preservando os demais params da URL", () => {
    const atual = new URLSearchParams("status=VENCIDO");
    const resultado = construirUrlComFiltro(atual, "/financeiro/contas-a-pagar", "categoria", "cat-1");
    expect(resultado).toBe("/financeiro/contas-a-pagar?status=VENCIDO&categoria=cat-1");
  });

  test('sentinela "__nenhum__" remove o param', () => {
    const atual = new URLSearchParams("status=VENCIDO&categoria=cat-1");
    const resultado = construirUrlComFiltro(atual, "/financeiro/contas-a-pagar", "categoria", "__nenhum__");
    expect(resultado).toBe("/financeiro/contas-a-pagar?status=VENCIDO");
  });

  test("string vazia remove o param (usado pelos campos de data)", () => {
    const atual = new URLSearchParams("vencimentoDe=2026-01-01");
    const resultado = construirUrlComFiltro(atual, "/financeiro/contas-a-pagar", "vencimentoDe", "");
    expect(resultado).toBe("/financeiro/contas-a-pagar");
  });

  test("sem nenhum param restante devolve só o pathname", () => {
    const atual = new URLSearchParams("categoria=cat-1");
    const resultado = construirUrlComFiltro(atual, "/financeiro/contas-a-pagar", "categoria", "__nenhum__");
    expect(resultado).toBe("/financeiro/contas-a-pagar");
  });
});
