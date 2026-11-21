import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import type { DefinicaoAjuda, Roteiro } from "@/ajuda/tipos";
import { CATEGORIAS as CATEGORIAS_DO_ORCAMENTO } from "@/ajuda/orcamento/exemplo";
import { POR_CENTRO_DE_CUSTO } from "@/ajuda/fluxo-por-dimensao/exemplo";
import { bancoSchema } from "@/lib/schemas/banco";
import { categoriaFinanceiraSchema } from "@/lib/schemas/categoriaFinanceira";
import { centroCustoSchema } from "@/lib/schemas/centroCusto";
import { centroLucroSchema } from "@/lib/schemas/centroLucro";
import { ajudaBancos, bancosDoRoteiro, ITAU_CORRIGIDO, SICREDI } from "./bancos";
import { ajudaCategorias, categoriasDoRoteiro, INATIVADA, TAXAS } from "./categorias";
import { ajudaCentrosDeCusto, CAMARA, centrosDoRoteiro as centrosDeCusto, FABRICA } from "./centros-de-custo";
import { ajudaCentrosDeLucro, centrosDoRoteiro as centrosDeLucro, LOJA } from "./centros-de-lucro";

const fim = (r: Roteiro) => valoresAte(r, r.passos.length - 1);
const roteiroDe = (ajuda: DefinicaoAjuda, id: string) => ajuda.roteiros.find((r) => r.id === id)!;

describe.each([
  ["Bancos", ajudaBancos, ["cadastrar-banco", "corrigir-banco"]],
  ["Categorias", ajudaCategorias, ["cadastrar-categoria", "inativar-categoria"]],
  ["Centros de custo", ajudaCentrosDeCusto, ["cadastrar-centro-custo", "inativar-centro-custo"]],
  ["Centros de lucro", ajudaCentrosDeLucro, ["cadastrar-centro-lucro"]],
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
  test("bancos: o Sicredi entra e o Itaú é corrigido; os dados passam na validação", () => {
    const lista = bancosDoRoteiro(fim(roteiroDe(ajudaBancos, "corrigir-banco")));
    expect(lista.find((b) => b.codigo === SICREDI.codigo)).toBeDefined();
    expect(lista.find((b) => b.codigo === "341")?.nome).toBe(ITAU_CORRIGIDO);
    expect(lista.map((b) => b.nome)).toEqual([...lista.map((b) => b.nome)].sort((a, b) => a.localeCompare(b, "pt-BR")));
    expect(bancoSchema.safeParse(SICREDI).success).toBe(true);
  });

  test("categorias: as ativas são as do Orçamento, e a inativada é a que não aparece nele", () => {
    const antes = categoriasDoRoteiro({}).filter((c) => c.ativo).map((c) => c.nome);
    expect(antes).toEqual(expect.arrayContaining(CATEGORIAS_DO_ORCAMENTO.map((c) => c.nome)));
    expect(CATEGORIAS_DO_ORCAMENTO.map((c) => c.nome)).not.toContain(INATIVADA);
    const depois = categoriasDoRoteiro(fim(roteiroDe(ajudaCategorias, "inativar-categoria")));
    expect(depois.find((c) => c.nome === INATIVADA)?.ativo).toBe(false);
    expect(depois.find((c) => c.nome === TAXAS.nome)?.pai).toBe("Despesas bancárias");
    expect(categoriaFinanceiraSchema.safeParse({ nome: TAXAS.nome, tipo: "DESPESA", parentId: "pai" }).success).toBe(true);
  });

  test("centros de custo: os do Fluxo por dimensão estão na lista, e a ordem é a do código", () => {
    const lista = centrosDeCusto(fim(roteiroDe(ajudaCentrosDeCusto, "inativar-centro-custo")));
    const nomes = lista.map((c) => c.nome);
    for (const linha of POR_CENTRO_DE_CUSTO.filter((l) => l.chave !== "nao-classificado")) {
      expect(nomes).toContain(linha.nome);
    }
    expect(lista.map((c) => c.codigo)).toEqual(["CC-01", "CC-02", "CC-03", "CC-03.1", "CC-09"]);
    expect(lista.find((c) => c.codigo === "CC-09")?.ativo).toBe(false);
    expect(lista.find((c) => c.codigo === CAMARA.codigo)?.pai).toBe(FABRICA.nome);
    expect(centroCustoSchema.safeParse({ nome: CAMARA.nome, codigo: CAMARA.codigo, parentId: "pai" }).success).toBe(true);
  });

  test("centros de lucro: a Loja entra no fim, pela ordem do código", () => {
    const lista = centrosDeLucro(fim(roteiroDe(ajudaCentrosDeLucro, "cadastrar-centro-lucro")));
    expect(lista.map((c) => c.codigo)).toEqual(["CL-01", "CL-02", "CL-03"]);
    expect(centroLucroSchema.safeParse(LOJA).success).toBe(true);
  });
});
