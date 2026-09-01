import { describe, expect, test } from "vitest";
import {
  requirePermission,
  PermissionError,
  podeAlterarFilialAtiva,
  podeEscreverTitulo,
  podeBaixarTitulo,
  podeAprovarBaixa,
} from "./permissions";

describe("requirePermission", () => {
  test("ADMINISTRADOR pode executar qualquer ação", () => {
    expect(() => requirePermission("ADMINISTRADOR", "empresa:gerenciar")).not.toThrow();
  });

  test("CONSULTA não pode escrever em cadastros", () => {
    expect(() => requirePermission("CONSULTA", "cadastro:escrever")).toThrow(PermissionError);
  });

  test("CONSULTA pode ler cadastros", () => {
    expect(() => requirePermission("CONSULTA", "cadastro:ler")).not.toThrow();
  });

  test("AUDITOR não pode escrever em cadastros", () => {
    expect(() => requirePermission("AUDITOR", "cadastro:escrever")).toThrow(PermissionError);
  });

  test("FINANCEIRO pode escrever em cadastros", () => {
    expect(() => requirePermission("FINANCEIRO", "cadastro:escrever")).not.toThrow();
  });
});

describe("podeAlterarFilialAtiva", () => {
  test("FINANCEIRO com podeAlterarFilial=true pode alterar", () => {
    expect(podeAlterarFilialAtiva("FINANCEIRO", true)).toBe(true);
  });

  test("FINANCEIRO com podeAlterarFilial=false não pode alterar, mesmo tendo o perfil certo", () => {
    expect(podeAlterarFilialAtiva("FINANCEIRO", false)).toBe(false);
  });

  test("CONSULTA com podeAlterarFilial=true ainda não pode alterar, porque o perfil não permite escrita", () => {
    expect(podeAlterarFilialAtiva("CONSULTA", true)).toBe(false);
  });

  test("ADMINISTRADOR com podeAlterarFilial=false não pode alterar — a checagem de filial vale mesmo pro admin", () => {
    expect(podeAlterarFilialAtiva("ADMINISTRADOR", false)).toBe(false);
  });
});

describe("permissões de título", () => {
  test("FINANCEIRO pode escrever e baixar título, mas não aprovar", () => {
    expect(() => requirePermission("FINANCEIRO", "titulo:escrever")).not.toThrow();
    expect(() => requirePermission("FINANCEIRO", "titulo:baixar")).not.toThrow();
    expect(() => requirePermission("FINANCEIRO", "titulo:aprovar")).toThrow(PermissionError);
  });

  test("TESOURARIA pode baixar e aprovar, mas não cadastrar título", () => {
    expect(() => requirePermission("TESOURARIA", "titulo:baixar")).not.toThrow();
    expect(() => requirePermission("TESOURARIA", "titulo:aprovar")).not.toThrow();
    expect(() => requirePermission("TESOURARIA", "titulo:escrever")).toThrow(PermissionError);
  });

  test("GESTOR, AUDITOR e CONSULTA só leem título", () => {
    for (const perfil of ["GESTOR", "AUDITOR", "CONSULTA"] as const) {
      expect(() => requirePermission(perfil, "titulo:ler")).not.toThrow();
      expect(() => requirePermission(perfil, "titulo:escrever")).toThrow(PermissionError);
      expect(() => requirePermission(perfil, "titulo:baixar")).toThrow(PermissionError);
      expect(() => requirePermission(perfil, "titulo:aprovar")).toThrow(PermissionError);
    }
  });
});

describe("podeBaixarTitulo / podeAprovarBaixa / podeEscreverTitulo", () => {
  test("TESOURARIA com podeAlterarFilial=true pode baixar e aprovar", () => {
    expect(podeBaixarTitulo("TESOURARIA", true)).toBe(true);
    expect(podeAprovarBaixa("TESOURARIA", true)).toBe(true);
  });

  test("TESOURARIA com podeAlterarFilial=false não pode baixar nem aprovar", () => {
    expect(podeBaixarTitulo("TESOURARIA", false)).toBe(false);
    expect(podeAprovarBaixa("TESOURARIA", false)).toBe(false);
  });

  test("FINANCEIRO nunca pode aprovar, mesmo com podeAlterarFilial=true", () => {
    expect(podeAprovarBaixa("FINANCEIRO", true)).toBe(false);
  });

  test("FINANCEIRO com podeAlterarFilial=true pode escrever título", () => {
    expect(podeEscreverTitulo("FINANCEIRO", true)).toBe(true);
  });
});
