import { describe, expect, test } from "vitest";
import { montarArvore, type LinhaDaArvore } from "./arvoreDeLinhas";

type L = LinhaDaArvore & { valor: number };
const l = (id: string, parentId: string | null, valor: number, grupo = "DESPESA"): L => ({
  id,
  parentId,
  grupo,
  nome: id,
  valor,
});
const arvore = (linhas: L[]) => montarArvore(linhas, (x) => ({ valor: x.valor }));
const resumo = (linhas: L[]) =>
  arvore(linhas).map((i) => [i.chave, i.nivel, i.valores.valor, i.temFilhos, i.direto, i.paiChave]);

describe("montarArvore", () => {
  test("sem pais, devolve a lista na mesma ordem, tudo no nível 1", () => {
    expect(resumo([l("b", null, 1), l("a", null, 2)])).toEqual([
      ["b", 1, 1, false, false, null],
      ["a", 1, 2, false, false, null],
    ]);
  });

  test("pai sem valor próprio soma os filhos e não ganha linha Direto em", () => {
    expect(resumo([l("Bancárias", null, 0), l("Taxas", "Bancárias", 12.5), l("Tarifas", "Bancárias", 45.9)])).toEqual([
      ["Bancárias", 1, 58.4, true, false, null],
      ["Taxas", 2, 12.5, false, false, "Bancárias"],
      ["Tarifas", 2, 45.9, false, false, "Bancárias"],
    ]);
  });

  test("pai com valor próprio ganha a linha Direto em como primeira filha", () => {
    const itens = arvore([l("Bancárias", null, 45.9), l("Taxas", "Bancárias", 12.5)]);
    expect(itens.map((i) => [i.chave, i.nome, i.nivel, i.valores.valor, i.direto])).toEqual([
      ["Bancárias", "Bancárias", 1, 58.4, false],
      ["Bancárias:direto", "Direto em Bancárias", 2, 45.9, true],
      ["Taxas", "Taxas", 2, 12.5, false],
    ]);
    expect(itens[1].origem.id).toBe("Bancárias");
    expect(itens[1].paiChave).toBe("Bancárias");
  });

  test("três níveis: o avô soma netos, filhos e o próprio", () => {
    expect(resumo([l("A", null, 1), l("B", "A", 2), l("C", "B", 3), l("D", null, 4)])).toEqual([
      ["A", 1, 6, true, false, null],
      ["A:direto", 2, 1, false, true, "A"],
      ["B", 2, 5, true, false, "A"],
      ["B:direto", 3, 2, false, true, "B"],
      ["C", 3, 3, false, false, "B"],
      ["D", 1, 4, false, false, null],
    ]);
  });

  test("filho vem logo abaixo do pai mesmo listado antes dele", () => {
    expect(resumo([l("Z-filho", "pai", 1), l("pai", null, 0)]).map((x) => x[0])).toEqual(["pai", "Z-filho"]);
  });

  test("pai fora da lista ou de outro grupo: a linha vira topo", () => {
    expect(resumo([l("órfã", "sumiu", 1), l("pai", null, 0), l("receita", "pai", 2, "RECEITA")])).toEqual([
      ["órfã", 1, 1, false, false, null],
      ["pai", 1, 0, false, false, null],
      ["receita", 1, 2, false, false, null],
    ]);
  });

  test("ciclo não trava: a primeira linha do ciclo na entrada vira topo", () => {
    const itens = resumo([l("x", "y", 1), l("y", "x", 2)]);
    // x vira topo e y fica sob ele; x tem valor próprio, então ganha a linha "Direto em x".
    expect(itens.map((i) => [i[0], i[1], i[2]])).toEqual([
      ["x", 1, 3],
      ["x:direto", 2, 1],
      ["y", 2, 2],
    ]);
  });

  test("soma em centavos, sem resíduo de ponto flutuante", () => {
    expect(arvore([l("p", null, 0.1), l("f", "p", 0.2)])[0].valores.valor).toBe(0.3);
  });

  test("a soma das linhas de nível 1 é a soma plana", () => {
    const linhas = [l("A", null, 1.1), l("B", "A", 2.2), l("C", "B", 3.3), l("D", null, 4.4)];
    const topo = arvore(linhas).filter((i) => i.nivel === 1);
    const soma = topo.reduce((s, i) => s + Math.round(i.valores.valor * 100), 0) / 100;
    expect(soma).toBe(11);
  });
});
