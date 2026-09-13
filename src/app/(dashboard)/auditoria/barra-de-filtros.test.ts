import { describe, expect, test } from "vitest";
import { construirUrlComFiltro } from "./barra-de-filtros";

describe("construirUrlComFiltro", () => {
  test("adiciona um novo filtro preservando os demais params da URL", () => {
    const atual = new URLSearchParams("acao=CRIAR");
    const resultado = construirUrlComFiltro(atual, "/auditoria", "entidade", "Titulo");
    expect(resultado).toBe("/auditoria?acao=CRIAR&entidade=Titulo");
  });

  test('sentinela "__nenhum__" remove o param', () => {
    const atual = new URLSearchParams("acao=CRIAR&entidade=Titulo");
    const resultado = construirUrlComFiltro(atual, "/auditoria", "entidade", "__nenhum__");
    expect(resultado).toBe("/auditoria?acao=CRIAR");
  });

  test("string vazia remove o param (usado pelos campos de data)", () => {
    const atual = new URLSearchParams("dataDe=2026-01-01");
    const resultado = construirUrlComFiltro(atual, "/auditoria", "dataDe", "");
    expect(resultado).toBe("/auditoria");
  });

  test("sem nenhum param restante devolve só o pathname", () => {
    const atual = new URLSearchParams("entidade=Titulo");
    const resultado = construirUrlComFiltro(atual, "/auditoria", "entidade", "__nenhum__");
    expect(resultado).toBe("/auditoria");
  });

  test("mudar um filtro sempre remove o param pagina da URL", () => {
    const atual = new URLSearchParams("pagina=3&acao=CRIAR");
    const resultado = construirUrlComFiltro(atual, "/auditoria", "entidade", "Titulo");
    expect(resultado).toBe("/auditoria?acao=CRIAR&entidade=Titulo");
  });
});
