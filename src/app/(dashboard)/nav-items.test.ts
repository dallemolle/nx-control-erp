import { describe, expect, test } from "vitest";
import type { Perfil } from "@prisma/client";
import { secoesVisiveis } from "./nav-items";

function hrefs(perfil: Perfil): string[] {
  return secoesVisiveis(perfil).flatMap((s) => s.itens.map((i) => i.href));
}

describe("secoesVisiveis", () => {
  test("ADMINISTRADOR vê tudo, inclusive Configuração de produção e os cadastros novos", () => {
    const h = hrefs("ADMINISTRADOR");
    expect(h).toContain("/configuracao-producao");
    expect(h).toContain("/cadastros/produtos");
    expect(h).toContain("/financeiro/aprovacoes");
  });

  test("Aprovações só para quem aprova (ADMINISTRADOR e TESOURARIA)", () => {
    expect(hrefs("TESOURARIA")).toContain("/financeiro/aprovacoes");
    expect(hrefs("FINANCEIRO")).not.toContain("/financeiro/aprovacoes");
  });

  test("Fluxo de caixa estratégico some para quem não pode abrir a página", () => {
    for (const perfil of ["FINANCEIRO", "TESOURARIA", "CONSULTA"] as const) {
      expect(hrefs(perfil)).not.toContain("/financeiro/fluxo-de-caixa-estrategico");
    }
    expect(hrefs("GESTOR")).toContain("/financeiro/fluxo-de-caixa-estrategico");
  });

  test("Auditoria e Dashboard executivo seguem os mesmos perfis de antes", () => {
    for (const perfil of ["ADMINISTRADOR", "AUDITOR", "GESTOR"] as const) {
      expect(hrefs(perfil)).toContain("/auditoria");
      expect(hrefs(perfil)).toContain("/dashboard-executivo");
    }
    for (const perfil of ["FINANCEIRO", "TESOURARIA", "CONSULTA"] as const) {
      expect(hrefs(perfil)).not.toContain("/auditoria");
      expect(hrefs(perfil)).not.toContain("/dashboard-executivo");
    }
  });

  test("PRODUCAO e VENDAS não veem Financeiro, Controladoria nem Administração", () => {
    for (const perfil of ["PRODUCAO", "VENDAS"] as const) {
      const titulos = secoesVisiveis(perfil).map((s) => s.titulo);
      expect(titulos).not.toContain("Financeiro");
      expect(titulos).not.toContain("Controladoria");
      expect(titulos).not.toContain("Administração");
      expect(titulos).toContain("Cadastros");
      expect(titulos).toContain("Ajuda");
    }
  });

  test("seção sem itens visíveis é omitida", () => {
    expect(secoesVisiveis("CONSULTA").every((s) => s.itens.length > 0)).toBe(true);
  });
});
