import { describe, expect, test } from "vitest";
import { construirUrlComPagina } from "./paginacao";

describe("construirUrlComPagina", () => {
  test("página 1 remove o param (é o default)", () => {
    const atual = new URLSearchParams("pagina=3&entidade=Titulo");
    const resultado = construirUrlComPagina(atual, "/auditoria", 1);
    expect(resultado).toBe("/auditoria?entidade=Titulo");
  });

  test("página > 1 seta o param", () => {
    const atual = new URLSearchParams("entidade=Titulo");
    const resultado = construirUrlComPagina(atual, "/auditoria", 2);
    expect(resultado).toBe("/auditoria?entidade=Titulo&pagina=2");
  });

  test("preserva os demais params da URL", () => {
    const atual = new URLSearchParams("entidade=Titulo&acao=CRIAR&pagina=1");
    const resultado = construirUrlComPagina(atual, "/auditoria", 3);
    expect(resultado).toBe("/auditoria?entidade=Titulo&acao=CRIAR&pagina=3");
  });

  test("sem nenhum param restante e página 1 devolve só o pathname", () => {
    const atual = new URLSearchParams("pagina=2");
    const resultado = construirUrlComPagina(atual, "/auditoria", 1);
    expect(resultado).toBe("/auditoria");
  });
});
