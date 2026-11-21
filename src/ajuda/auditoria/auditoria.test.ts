import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { ROTULOS_ACAO_AUDITORIA, ROTULOS_ENTIDADE_AUDITORIA } from "@/lib/auditoria/rotulos";
import { USUARIOS } from "@/ajuda/usuarios/exemplo";
import { ajudaAuditoria, REGISTROS, registrosDoRoteiro } from "./index";

function roteiroPorId(id: string) {
  return ajudaAuditoria.roteiros.find((r) => r.id === id)!;
}

describe("ajuda da Auditoria", () => {
  test("tem os três roteiros, com o alvo de cada passo na cena", () => {
    expect(ajudaAuditoria.roteiros.map((r) => r.id)).toEqual(["quem-alterou", "o-que-fez", "exportar"]);
    for (const roteiro of ajudaAuditoria.roteiros) {
      roteiro.passos.forEach((passo, indice) => {
        const markup = renderToStaticMarkup(
          createElement(ajudaAuditoria.cenas[passo.cena], { valores: valoresAte(roteiro, indice) }),
        );
        expect(markup, `${roteiro.id}, passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
      });
    }
  });

  test("os registros usam códigos que o sistema grava, gente da ajuda de Usuários, e vêm do mais recente", () => {
    const nomes = new Set(USUARIOS.map((u) => u.nome));
    for (const r of REGISTROS) {
      expect(Object.hasOwn(ROTULOS_ENTIDADE_AUDITORIA, r.entidade), r.entidade).toBe(true);
      expect(Object.hasOwn(ROTULOS_ACAO_AUDITORIA, r.acao), r.acao).toBe(true);
      expect(nomes.has(r.usuario), r.usuario).toBe(true);
    }
    const instantes = REGISTROS.map((r) => {
      const [d, m, a] = r.dia.split("/");
      return `${a}${m}${d}${r.hora}`;
    });
    expect([...instantes].sort().reverse()).toEqual(instantes);
  });

  test("filtrar por Fruta deixa só o açaí", () => {
    const roteiro = roteiroPorId("quem-alterou");
    expect(registrosDoRoteiro(valoresAte(roteiro, 1)).map((r) => r.chave)).toEqual(["acai"]);
    expect(registrosDoRoteiro(valoresAte(roteiro, roteiro.passos.length - 1))).toHaveLength(REGISTROS.length);
  });

  test("o dia 21/11 do Paulo traz a troca da Rita das 21h40 e deixa de fora o dia 19", () => {
    const roteiro = roteiroPorId("o-que-fez");
    const chaves = registrosDoRoteiro(valoresAte(roteiro, 2)).map((r) => r.chave);
    expect(chaves).toEqual(["rita", "pedro", "acai", "energia"]);
  });
});
