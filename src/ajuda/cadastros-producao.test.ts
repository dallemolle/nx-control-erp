import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import type { DefinicaoAjuda, Roteiro } from "@/ajuda/tipos";
import { LOCAIS as LOCAIS_DO_ESTOQUE } from "@/ajuda/estoque/exemplo";
import { INSUMOS as INSUMOS_DA_OP } from "@/ajuda/processamento/exemplo";
import { COLHEITA } from "@/ajuda/recepcao/exemplo";
import { FRUTAS as FRUTAS_DA_ORIGEM, TALHOES as TALHOES_DA_ORIGEM } from "@/ajuda/relatorio-origem/exemplo";
import { PRODUTOS } from "@/ajuda/produtos/exemplo";
import { frutaSchema } from "@/lib/schemas/fruta";
import { insumoSchema } from "@/lib/schemas/insumo";
import { localArmazenamentoSchema } from "@/lib/schemas/localArmazenamento";
import { talhaoSchema } from "@/lib/schemas/talhao";
import { ajudaFrutas, CUPUACU, frutasDoRoteiro, NOVO_CUSTO_ACAI } from "./frutas";
import { ajudaInsumos, EMBALAGEM_500, insumosDoRoteiro, NOVO_CUSTO_ENERGIA } from "./insumos";
import { ajudaLocaisArmazenamento, FREEZER, locaisDoRoteiro } from "./locais-armazenamento";
import { ajudaTalhoes, CUPUACUZAL, talhoesDoRoteiro } from "./talhoes";

const fim = (r: Roteiro) => valoresAte(r, r.passos.length - 1);
const roteiroDe = (ajuda: DefinicaoAjuda, id: string) => ajuda.roteiros.find((r) => r.id === id)!;

describe.each([
  ["Frutas", ajudaFrutas, ["cadastrar-fruta", "mudar-custo-fruta"]],
  ["Talhões", ajudaTalhoes, ["cadastrar-talhao"]],
  ["Locais de armazenamento", ajudaLocaisArmazenamento, ["cadastrar-local"]],
  ["Insumos", ajudaInsumos, ["cadastrar-insumo", "atualizar-custo-insumo"]],
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
  test("frutas: as do Relatório de origem e dos Produtos; o açaí custa o da Recepção até o roteiro mudar", () => {
    const antes = frutasDoRoteiro({});
    const nomes = antes.map((f) => f.nome);
    expect(nomes).toEqual(expect.arrayContaining(FRUTAS_DA_ORIGEM.map((f) => f.nome)));
    for (const produto of PRODUTOS) expect(nomes).toContain(produto.fruta);
    expect(antes.find((f) => f.nome === "Açaí")?.custoPadraoKg).toBe(COLHEITA.custoPadraoKg);

    const depois = frutasDoRoteiro(fim(roteiroDe(ajudaFrutas, "mudar-custo-fruta")));
    expect(depois.map((f) => f.nome)).toEqual(["Açaí", "Acerola", "Cupuaçu"]);
    expect(depois.find((f) => f.nome === "Açaí")?.custoPadraoKg).toBe(NOVO_CUSTO_ACAI);
    expect(frutaSchema.safeParse({ ...CUPUACU, exigeBranqueamento: undefined }).success).toBe(true);
  });

  test("talhões: os três do Relatório de origem, e o cupuaçuzal é de uma fruta cadastrada", () => {
    const lista = talhoesDoRoteiro(fim(roteiroDe(ajudaTalhoes, "cadastrar-talhao")));
    for (const t of TALHOES_DA_ORIGEM) {
      expect(lista).toContainEqual(expect.objectContaining({ nome: t.nome, fruta: t.fruta, areaHa: t.areaHa }));
    }
    expect(lista.at(-1)?.nome).toBe(CUPUACUZAL.nome);
    expect(CUPUACUZAL.fruta).toBe(CUPUACU.nome);
    expect(
      talhaoSchema.safeParse({
        nome: CUPUACUZAL.nome,
        frutaId: "cupuacu",
        areaHa: String(CUPUACUZAL.areaHa),
        anoPlantio: String(CUPUACUZAL.anoPlantio),
        espacamento: CUPUACUZAL.espacamento,
        observacao: "",
      }).success,
    ).toBe(true);
  });

  test("locais: os do Estoque com as mesmas capacidades, e o freezer entra em ordem de nome", () => {
    expect(locaisDoRoteiro({}).map(({ nome, capacidadeKg }) => ({ nome, capacidadeKg }))).toEqual(
      LOCAIS_DO_ESTOQUE.map(({ nome, capacidadeKg }) => ({ nome, capacidadeKg })),
    );
    const depois = locaisDoRoteiro(fim(roteiroDe(ajudaLocaisArmazenamento, "cadastrar-local")));
    expect(depois.map((l) => l.nome)).toContain(FREEZER.nome);
    expect(
      localArmazenamentoSchema.safeParse({
        nome: FREEZER.nome,
        tipo: FREEZER.tipo,
        temperatura: FREEZER.temperatura,
        capacidadeKg: String(FREEZER.capacidadeKg),
      }).success,
    ).toBe(true);
  });

  test("insumos: os da OP-261120-01 com o custo do dia; a energia muda só no cadastro", () => {
    expect(insumosDoRoteiro({}).map(({ nome, unidade, custoUnitario }) => ({ nome, unidade, custoUnitario }))).toEqual(
      INSUMOS_DA_OP.map(({ nome, unidade, custoUnitario }) => ({ nome, unidade, custoUnitario })),
    );
    const depois = insumosDoRoteiro(fim(roteiroDe(ajudaInsumos, "atualizar-custo-insumo")));
    expect(depois.find((i) => i.nome === "Energia elétrica")?.custoUnitario).toBe(NOVO_CUSTO_ENERGIA);
    expect(depois.map((i) => i.nome)).toEqual(["Embalagem 1 kg", "Embalagem 500 g", "Energia elétrica", "Mão de obra"]);
    expect(insumoSchema.safeParse(EMBALAGEM_500).success).toBe(true);
  });
});
