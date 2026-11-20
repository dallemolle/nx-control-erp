import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { formatarData } from "@/lib/formatacao";
import { situacaoLiberacao } from "@/lib/producao/liberacaoVencido";
import { proximoCodigoDeFilho } from "@/lib/producao/lote";
import { lotesDaCena, resumoDosCartoes, resumoProdutoLocal } from "./cenas";
import { CITADOS, HOJE_ISO, LIBERACAO, LOTES, OUTRO_DIA, TRANSFERENCIA } from "./exemplo";
import { ajudaEstoque } from "./index";

const { roteiros, cenas } = ajudaEstoque;

const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const DIA = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("roteiros do Estoque", () => {
  test("são os 5 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual([
      "ler-estoque",
      "filtrar-referencia",
      "transferir",
      "liberar-vencido",
      "produto-local",
    ]);
  });

  test("hoje: 4 lotes OK, o AMR vencendo e o fruto de acerola vencido; os números citados batem", () => {
    const { todos, visiveis } = lotesDaCena({});
    const status = Object.fromEntries(todos.map((l) => [l.codigo, l.status]));
    expect(status["AMR-261118-01"]).toBe("VENCENDO");
    expect(status[LIBERACAO.lote]).toBe("VENCIDO");
    expect(todos.find((l) => l.codigo === LIBERACAO.lote)?.dias).toBe(-1);
    const [ok, vencendo, vencido] = resumoDosCartoes(todos);
    expect(ok.quantidade).toBe(CITADOS.okLotes);
    expect(KG.format(ok.kg)).toBe(CITADOS.okKg);
    expect([vencendo.quantidade, vencido.quantidade]).toEqual([1, 1]);
    expect(KG.format(visiveis.reduce((s, l) => s + l.saldoKg, 0))).toBe(CITADOS.totalKg);
    expect(visiveis.reduce((s, l) => s + l.valor, 0)).toBeCloseTo(CITADOS.totalValor, 2);
    expect(visiveis.every((l) => l.saldoKg > 0)).toBe(true);
  });

  test("a lista vem em ordem de validade, como a tela", () => {
    const codigos = lotesDaCena({}).visiveis.map((l) => l.codigo);
    expect(codigos).toEqual(LOTES.map((l) => l.codigo));
  });

  test("na data de referência do roteiro, o AMR também está vencido", () => {
    const { todos } = lotesDaCena({ "est.referencia": OUTRO_DIA });
    expect(todos.find((l) => l.codigo === "AMR-261118-01")?.status).toBe("VENCIDO");
    expect(resumoDosCartoes(todos)[2].quantidade).toBe(2);
  });

  test("o filho da transferência segue proximoCodigoDeFilho e o saldo se divide", () => {
    expect(proximoCodigoDeFilho(TRANSFERENCIA.lote, [])).toBe(TRANSFERENCIA.filho);
    const { visiveis } = lotesDaCena({ "est.filho": "transferido" });
    expect(visiveis.find((l) => l.codigo === TRANSFERENCIA.lote)?.saldoKg).toBe(500);
    expect(visiveis.find((l) => l.codigo === TRANSFERENCIA.filho)).toMatchObject({
      saldoKg: TRANSFERENCIA.kg,
      local: TRANSFERENCIA.destino,
    });
  });

  test("a liberação vale até a data citada (situacaoLiberacao)", () => {
    const lote = LOTES.find((l) => l.codigo === LIBERACAO.lote)!;
    const situacao = situacaoLiberacao(DIA(lote.validade), LIBERACAO.dias, DIA(HOJE_ISO));
    expect(situacao.tipo).toBe("PODE");
    if (situacao.tipo === "PODE") expect(formatarData(situacao.liberadoAte)).toBe(LIBERACAO.liberadoAte);
  });

  test("a ocupação da Câmara fria bate com o texto", () => {
    const { locais } = resumoProdutoLocal(lotesDaCena({}).todos);
    const camara = locais.find((l) => l.nome === "Câmara fria")!;
    expect(PERCENTUAL.format(camara.ocupacao ?? 0)).toBe(CITADOS.ocupacaoCamaraFria);
  });

  test("“Mostrar zerados” traz os lotes de fruto da Recepção", () => {
    const markup = renderToStaticMarkup(createElement(cenas.estoque, { valores: { "est.zerados": "sim" } }));
    expect(markup).toContain("FA-261120-01");
    expect(renderToStaticMarkup(createElement(cenas.estoque, { valores: {} }))).not.toContain("FA-261120-01");
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s tem conteúdo completo", (_id, roteiro) => {
    expect(roteiro.passos.length).toBeGreaterThan(0);
    expect(roteiro.quandoUsar.trim()).not.toBe("");
    expect(roteiro.eDepois.texto.trim()).not.toBe("");
    if (roteiro.eDepois.proximoRoteiro) {
      expect(roteiros.some((r) => r.id === roteiro.eDepois.proximoRoteiro)).toBe(true);
    }
    for (const passo of roteiro.passos) {
      expect(passo.instrucao.trim()).not.toBe("");
      expect(cenas[passo.cena]).toBeDefined();
    }
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s: o alvo de cada passo aparece na cena", (_id, roteiro) => {
    roteiro.passos.forEach((passo, indice) => {
      const markup = renderToStaticMarkup(createElement(cenas[passo.cena], { valores: valoresAte(roteiro, indice) }));
      expect(markup, `passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
    });
  });
});
