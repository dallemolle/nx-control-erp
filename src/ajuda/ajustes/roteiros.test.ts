import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { ROTULOS_MOTIVO_AJUSTE } from "@/lib/schemas/enums";
import { LISTA_ABERTA, ajustesDaCena, lotesDoSentido } from "./cenas";
import { AMOSTRA, MOTIVOS, SOBRA } from "./exemplo";
import { ajudaAjustes } from "./index";

const { roteiros, cenas } = ajudaAjustes;

describe("roteiros dos Ajustes de estoque", () => {
  test("são os 4 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["dar-baixa", "inventario", "corrigir-ajuste", "consultar-ajustes"]);
  });

  test("os motivos da réplica são os do sistema, na mesma ordem", () => {
    expect([...MOTIVOS]).toEqual(Object.values(ROTULOS_MOTIVO_AJUSTE));
    expect(MOTIVOS).toContain(AMOSTRA.motivo);
    expect(MOTIVOS).toContain(SOBRA.motivo);
  });

  test("saída oferece só lotes com saldo; entrada também os zerados", () => {
    expect(lotesDoSentido("SAIDA").every((l) => l.saldoKg > 0)).toBe(true);
    expect(lotesDoSentido("ENTRADA").some((l) => l.saldoKg === 0)).toBe(true);
    const saida = renderToStaticMarkup(createElement(cenas.novo, { valores: { "novo.lote": LISTA_ABERTA } }));
    expect(saida).not.toContain("FA-261120-01");
    const entrada = renderToStaticMarkup(
      createElement(cenas.novo, { valores: { "novo.lote": LISTA_ABERTA, "novo.sentido": "entrada" } }),
    );
    expect(entrada).toContain("FA-261120-01");
  });

  test("o motivo padrão segue o sentido, como no formulário", () => {
    expect(renderToStaticMarkup(createElement(cenas.novo, { valores: {} }))).toContain("Avaria/quebra");
    expect(renderToStaticMarkup(createElement(cenas.novo, { valores: { "novo.sentido": "entrada" } }))).toContain(
      "Inventário",
    );
  });

  test("o filtro “Vencido” deixa só a baixa do fruto de açaí", () => {
    const filtrados = ajustesDaCena({ "lista.amostra": "lancado", "lista.motivo": "Vencido" });
    expect(filtrados.map((a) => a.lote)).toEqual(["FA-261117-01"]);
  });

  test("a saída aparece negativa e a entrada positiva, a mais recente primeiro", () => {
    const lista = ajustesDaCena({ "lista.amostra": "lancado", "lista.sobra": "lancado" });
    expect(lista[0]).toMatchObject({ lote: SOBRA.lote, kg: SOBRA.kg });
    expect(lista[1]).toMatchObject({ lote: AMOSTRA.lote, kg: -AMOSTRA.kg });
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
