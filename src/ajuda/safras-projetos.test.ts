import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import type { DefinicaoAjuda, Roteiro } from "@/ajuda/tipos";
import { SAFRAS as SAFRAS_DA_COMPARACAO } from "@/ajuda/comparacao-safras/exemplo";
import { POR_SAFRA } from "@/ajuda/fluxo-por-dimensao/exemplo";
import { SAFRA as SAFRA_DA_RECEPCAO } from "@/ajuda/recepcao/exemplo";
import { projetoSchema } from "@/lib/schemas/projeto";
import { safraSchema } from "@/lib/schemas/safra";
import { ajudaProjetos, CAMARA, projetosDoRoteiro } from "./projetos";
import { ajudaSafras, NOVA, safrasDoRoteiro } from "./safras";

const fim = (r: Roteiro) => valoresAte(r, r.passos.length - 1);
const roteiroDe = (ajuda: DefinicaoAjuda, id: string) => ajuda.roteiros.find((r) => r.id === id)!;

describe.each([
  ["Safras", ajudaSafras, ["cadastrar-safra", "encerrar-safra"]],
  ["Projetos", ajudaProjetos, ["cadastrar-projeto"]],
] as const)("ajuda de %s", (_tela, ajuda, ids) => {
  test("tem os roteiros esperados", () => {
    expect(ajuda.roteiros.map((r) => r.id)).toEqual(ids);
  });

  test.each(ajuda.roteiros.map((r) => [r.id, r] as const))("%s tem conteúdo completo", (_id, roteiro) => {
    expect(roteiro.quandoUsar.trim()).not.toBe("");
    expect(roteiro.eDepois.texto.trim()).not.toBe("");
    if (roteiro.eDepois.proximoRoteiro) {
      expect(ajuda.roteiros.some((r) => r.id === roteiro.eDepois.proximoRoteiro)).toBe(true);
    }
    for (const passo of roteiro.passos) expect(ajuda.cenas[passo.cena]).toBeDefined();
  });

  test.each(ajuda.roteiros.map((r) => [r.id, r] as const))("%s: o alvo de cada passo aparece na cena", (_id, roteiro) => {
    roteiro.passos.forEach((passo, indice) => {
      const markup = renderToStaticMarkup(createElement(ajuda.cenas[passo.cena], { valores: valoresAte(roteiro, indice) }));
      expect(markup, `passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
    });
  });
});

describe("os exemplos batem com o resto da ajuda e com o cadastro", () => {
  test("safras: depois do cadastro, a lista é a da Comparação entre safras, com os mesmos status", () => {
    const lista = safrasDoRoteiro(fim(roteiroDe(ajudaSafras, "cadastrar-safra")));
    const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome);
    expect(lista.map(({ nome, status }) => ({ nome, status }))).toEqual(
      SAFRAS_DA_COMPARACAO.map(({ nome, status }) => ({ nome, status })).sort(porNome),
    );
    const nomes = lista.map((s) => s.nome);
    for (const linha of POR_SAFRA.filter((l) => l.chave !== "nao-classificado")) expect(nomes).toContain(linha.nome);
    expect(nomes).toContain(SAFRA_DA_RECEPCAO);
  });

  test("safras: cada ciclo começa no dia seguinte ao fim do anterior, e passa na validação", () => {
    const lista = safrasDoRoteiro({ "lista.nova-safra": "sim" });
    for (let i = 1; i < lista.length; i++) {
      const diaSeguinte = new Date(`${lista[i - 1].fim}T00:00:00Z`);
      diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1);
      expect(lista[i].inicio).toBe(diaSeguinte.toISOString().slice(0, 10));
    }
    expect(safraSchema.safeParse({ nome: NOVA.nome, dataInicio: NOVA.inicio, dataFim: NOVA.fim, status: NOVA.status }).success).toBe(true);
    expect(safraSchema.safeParse({ nome: NOVA.nome, dataInicio: NOVA.fim, dataFim: NOVA.inicio }).success).toBe(false);
  });

  test("safras: ao encerrar, só a 2025/26 muda de status", () => {
    const lista = safrasDoRoteiro(fim(roteiroDe(ajudaSafras, "encerrar-safra")));
    expect(lista.find((s) => s.nome === "2025/26")?.status).toBe("ENCERRADO");
    expect(lista.find((s) => s.nome === NOVA.nome)?.status).toBe("PLANEJADO");
  });

  test("projetos: o PRJ-02 entra depois do PRJ-01, e passa na validação", () => {
    const lista = projetosDoRoteiro(fim(roteiroDe(ajudaProjetos, "cadastrar-projeto")));
    expect(lista.map((p) => p.codigo)).toEqual(["PRJ-01", "PRJ-02"]);
    expect(projetoSchema.safeParse(CAMARA).success).toBe(true);
  });
});
