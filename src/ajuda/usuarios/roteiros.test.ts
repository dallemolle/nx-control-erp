import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { PERFIS, criarUsuarioSchema } from "@/lib/schemas/usuario";
import { OPCOES_VALIDADE_CHAVE } from "@/lib/validadeChaveApi";
import { podeExecutar } from "@/server/auth/permissions";
import { usuariosDoRoteiro } from "./cenas";
import { CHAVE_NOVA, HOJE, JOANA, LUCIA, PERFIS_RESUMO, SENHA_JOANA } from "./exemplo";
import { ajudaUsuarios } from "./index";

const { roteiros, cenas } = ajudaUsuarios;
const roteiroDe = (id: string) => roteiros.find((r) => r.id === id)!;
const fim = (id: string) => valoresAte(roteiroDe(id), roteiroDe(id).passos.length - 1);

describe("roteiros de Usuários", () => {
  test("são os 4 roteiros, encadeados", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["cadastrar-usuario", "usuario-existente", "perfil-acesso", "chaves-api"]);
    for (const r of roteiros) {
      expect(r.quandoUsar.trim()).not.toBe("");
      if (r.eDepois.proximoRoteiro) expect(roteiros.some((o) => o.id === r.eDepois.proximoRoteiro)).toBe(true);
    }
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s: o alvo de cada passo aparece na cena", (_id, roteiro) => {
    roteiro.passos.forEach((passo, indice) => {
      const markup = renderToStaticMarkup(createElement(cenas[passo.cena], { valores: valoresAte(roteiro, indice) }));
      expect(markup, `passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
    });
  });
});

describe("o exemplo bate com o sistema", () => {
  test("o resumo dos perfis cobre todos e diz o que o podeExecutar real permite", () => {
    expect(PERFIS_RESUMO.map((p) => p.perfil)).toEqual([...PERFIS]);
    for (const p of PERFIS_RESUMO) {
      for (const acao of p.pode) expect(podeExecutar(p.perfil, acao), `${p.perfil} pode ${acao}`).toBe(true);
      for (const acao of p.naoPode) expect(podeExecutar(p.perfil, acao), `${p.perfil} não pode ${acao}`).toBe(false);
    }
  });

  test("a Joana passa na validação do cadastro, e a Lúcia só precisa de email e perfil", () => {
    expect(
      criarUsuarioSchema.safeParse({ nome: JOANA.nome, email: JOANA.email, senha: SENHA_JOANA, perfil: JOANA.perfil })
        .success,
    ).toBe(true);
    expect(criarUsuarioSchema.safeParse({ email: LUCIA.email, perfil: LUCIA.perfil }).success).toBe(true);
    expect(SENHA_JOANA.length).toBeGreaterThanOrEqual(8);
  });

  test("os roteiros deixam a lista como contam, em ordem de nome", () => {
    const lista = usuariosDoRoteiro(fim("perfil-acesso"));
    const nomes = lista.map((u) => u.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
    expect(nomes).toContain(JOANA.nome);
    expect(nomes).toContain(LUCIA.nome);
    const rita = lista.find((u) => u.chave === "rita")!;
    expect(rita.perfil).toBe("FINANCEIRO");
    expect(rita.igarape).toEqual({ leitura: true, alteracao: true });
    expect(lista.find((u) => u.chave === "pedro")?.ativo).toBe(false);
  });

  test("a chave tem o formato real e a validade bate com as opções da tela", () => {
    expect(CHAVE_NOVA.completa).toMatch(/^sk_[A-Za-z0-9_-]{43}$/);
    expect(OPCOES_VALIDADE_CHAVE.map((o) => o.dias)).toContain(CHAVE_NOVA.validadeDias);
    const [dia, mes, ano] = HOJE.split("/").map(Number);
    const expira = new Date(Date.UTC(ano, mes - 1, dia + CHAVE_NOVA.validadeDias));
    expect(expira.toLocaleDateString("pt-BR", { timeZone: "UTC" })).toBe(CHAVE_NOVA.expiraEm);
  });

  test("depois de gerar, a chave inteira só aparece no aviso de copiar", () => {
    const valores = valoresAte(roteiroDe("chaves-api"), 4);
    const markup = renderToStaticMarkup(createElement(cenas.chaves, { valores }));
    expect(markup.split(CHAVE_NOVA.completa)).toHaveLength(2);
    expect(markup).toContain(`${CHAVE_NOVA.completa.slice(0, 11)}...`);
  });
});
