import { describe, expect, test } from "vitest";
import {
  requirePermission,
  PermissionError,
  podeAlterarFilialAtiva,
  podeEscreverTitulo,
  podeBaixarTitulo,
  podeAprovarBaixa,
  podeEscreverOrcamento,
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

describe("permissões de planejamento estratégico", () => {
  test("GESTOR pode ler e escrever premissas — primeira escrita do perfil no sistema", () => {
    expect(() => requirePermission("GESTOR", "planejamentoEstrategico:ler")).not.toThrow();
    expect(() => requirePermission("GESTOR", "planejamentoEstrategico:escrever")).not.toThrow();
  });

  test("AUDITOR pode ler mas não escrever premissas estratégicas", () => {
    expect(() => requirePermission("AUDITOR", "planejamentoEstrategico:ler")).not.toThrow();
    expect(() => requirePermission("AUDITOR", "planejamentoEstrategico:escrever")).toThrow(PermissionError);
  });

  test("FINANCEIRO, TESOURARIA e CONSULTA não acessam planejamento estratégico — é dado consolidado de toda a empresa, não só da filial do perfil", () => {
    for (const perfil of ["FINANCEIRO", "TESOURARIA", "CONSULTA"] as const) {
      expect(() => requirePermission(perfil, "planejamentoEstrategico:ler")).toThrow(PermissionError);
      expect(() => requirePermission(perfil, "planejamentoEstrategico:escrever")).toThrow(PermissionError);
    }
  });
});

describe("permissões de orçamento", () => {
  test("FINANCEIRO pode ler e escrever orçamento", () => {
    expect(() => requirePermission("FINANCEIRO", "orcamento:ler")).not.toThrow();
    expect(() => requirePermission("FINANCEIRO", "orcamento:escrever")).not.toThrow();
  });

  test("TESOURARIA, GESTOR, AUDITOR e CONSULTA só leem, não escrevem", () => {
    for (const perfil of ["TESOURARIA", "GESTOR", "AUDITOR", "CONSULTA"] as const) {
      expect(() => requirePermission(perfil, "orcamento:ler")).not.toThrow();
      expect(() => requirePermission(perfil, "orcamento:escrever")).toThrow(PermissionError);
    }
  });
});

describe("podeEscreverOrcamento", () => {
  test("FINANCEIRO com podeAlterarFilial=true pode escrever orçamento", () => {
    expect(podeEscreverOrcamento("FINANCEIRO", true)).toBe(true);
  });

  test("FINANCEIRO com podeAlterarFilial=false não pode escrever, mesmo tendo o perfil certo", () => {
    expect(podeEscreverOrcamento("FINANCEIRO", false)).toBe(false);
  });

  test("TESOURARIA com podeAlterarFilial=true ainda não pode escrever, porque o perfil só lê orçamento", () => {
    expect(podeEscreverOrcamento("TESOURARIA", true)).toBe(false);
  });

  test("ADMINISTRADOR com podeAlterarFilial=false não pode escrever — a checagem de filial vale mesmo pro admin", () => {
    expect(podeEscreverOrcamento("ADMINISTRADOR", false)).toBe(false);
  });
});
