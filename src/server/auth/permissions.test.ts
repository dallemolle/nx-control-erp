import { describe, expect, test } from "vitest";
import type { Perfil } from "@prisma/client";
import {
  requirePermission,
  PermissionError,
  podeAlterarFilialAtiva,
  podeEscreverTitulo,
  podeBaixarTitulo,
  podeAprovarBaixa,
  podeEscreverOrcamento,
  podeExecutar,
  podeEscreverCadastroProducao,
  podeEscreverCliente,
  podeConfigurarProducao,
  type Acao,
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

describe("permissões de dashboard executivo", () => {
  test("ADMINISTRADOR, GESTOR e AUDITOR podem ler o dashboard executivo", () => {
    for (const perfil of ["ADMINISTRADOR", "GESTOR", "AUDITOR"] as const) {
      expect(() => requirePermission(perfil, "dashboardExecutivo:ler")).not.toThrow();
    }
  });

  test("FINANCEIRO, TESOURARIA e CONSULTA não acessam o dashboard executivo — é dado consolidado de toda a empresa, não só da filial do perfil", () => {
    for (const perfil of ["FINANCEIRO", "TESOURARIA", "CONSULTA"] as const) {
      expect(() => requirePermission(perfil, "dashboardExecutivo:ler")).toThrow(PermissionError);
    }
  });
});

const ACOES_FASE_7: Acao[] = [
  "cadastroProducao:escrever",
  "cliente:escrever",
  "producao:configurar",
  "producao:ler",
  "producao:escrever",
  "estoque:ajustar",
  "venda:ler",
  "venda:escrever",
  "venda:cancelar",
  "venda:liberarVencido",
];

const ESPERADO_FASE_7: Record<Exclude<Perfil, "ADMINISTRADOR">, Acao[]> = {
  FINANCEIRO: ["cliente:escrever", "producao:ler", "venda:ler", "venda:escrever", "venda:cancelar"],
  TESOURARIA: ["cliente:escrever", "producao:ler", "venda:ler"],
  GESTOR: ["producao:ler", "venda:ler", "venda:liberarVencido"],
  AUDITOR: ["producao:ler", "venda:ler"],
  CONSULTA: ["producao:ler", "venda:ler"],
  PRODUCAO: ["cadastroProducao:escrever", "producao:ler", "producao:escrever", "estoque:ajustar", "venda:ler"],
  VENDAS: ["cliente:escrever", "producao:ler", "venda:ler", "venda:escrever"],
};

describe("matriz da Fase 7 (produção, estoque e vendas)", () => {
  for (const [perfil, permitidas] of Object.entries(ESPERADO_FASE_7) as [Perfil, Acao[]][]) {
    test(`${perfil} tem exatamente as ações esperadas da Fase 7`, () => {
      const obtidas = ACOES_FASE_7.filter((acao) => podeExecutar(perfil, acao));
      expect(obtidas.sort()).toEqual([...permitidas].sort());
    });
  }

  test("ADMINISTRADOR tem todas", () => {
    expect(ACOES_FASE_7.every((acao) => podeExecutar("ADMINISTRADOR", acao))).toBe(true);
  });

  test("PRODUCAO e VENDAS leem cadastros e não tocam no financeiro", () => {
    for (const perfil of ["PRODUCAO", "VENDAS"] as const) {
      expect(podeExecutar(perfil, "cadastro:ler")).toBe(true);
      expect(podeExecutar(perfil, "cadastro:escrever")).toBe(false);
      for (const acao of ["titulo:ler", "lancamento:ler", "conciliacao:ler", "orcamento:ler"] as const) {
        expect(podeExecutar(perfil, acao)).toBe(false);
      }
    }
  });

  test("helpers respeitam perfil e filial somente leitura", () => {
    expect(podeEscreverCadastroProducao("PRODUCAO", true)).toBe(true);
    expect(podeEscreverCadastroProducao("PRODUCAO", false)).toBe(false);
    expect(podeEscreverCadastroProducao("FINANCEIRO", true)).toBe(false);
    expect(podeEscreverCliente("VENDAS", true)).toBe(true);
    expect(podeEscreverCliente("VENDAS", false)).toBe(false);
    expect(podeEscreverCliente("CONSULTA", true)).toBe(false);
    expect(podeConfigurarProducao("ADMINISTRADOR", true)).toBe(true);
    expect(podeConfigurarProducao("PRODUCAO", true)).toBe(false);
  });
});
