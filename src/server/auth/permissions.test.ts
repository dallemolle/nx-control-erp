import { describe, expect, test } from "vitest";
import { requirePermission, PermissionError, podeAlterarFilialAtiva } from "./permissions";

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
