import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import type { Valores } from "@/ajuda/tipos";
import { atrasoDe, entregasDoRoteiro } from "./cenas";
import { DIA_DA_SAIDA, HOJE, RECEBEDOR } from "./exemplo";
import { ajudaEntregas } from "./index";

const { roteiros, cenas } = ajudaEntregas;
const roteiroDe = (id: string) => roteiros.find((r) => r.id === id)!;
const html = (cena: string, valores: Valores) =>
  renderToStaticMarkup(createElement(cenas[cena], { valores }));

describe("roteiros de Entregas", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["sair-entrega", "confirmar-entrega", "consultar-entregas"]);
  });

  test("os atrasos citados batem com atrasoEntregaDias", () => {
    const naSaida = entregasDoRoteiro({ "lista.situacao": "Pendente" });
    const do131 = (lista: ReturnType<typeof entregasDoRoteiro>) => lista.find((e) => e.pedido === 131)!;
    expect(atrasoDe(do131(naSaida), DIA_DA_SAIDA)).toBe(0);
    expect(atrasoDe(do131(entregasDoRoteiro({})), HOJE)).toBe(1);
    const entregue = entregasDoRoteiro({ "lista.situacao": "Entregue", "entregue.recebido": RECEBEDOR });
    expect(do131(entregue).entregueEm).toBe(HOJE);
    // Entregue: o atraso fica parado no dia da entrega.
    expect(atrasoDe(do131(entregue), "30/11/2026")).toBe(1);
    const [cancelada, e128] = entregue;
    expect(atrasoDe(cancelada, HOJE)).toBeNull();
    expect(atrasoDe(e128, HOJE)).toBe(0);
  });

  test("a lista padrão mostra só pendentes e em rota; “Só atrasadas” deixa o 131", () => {
    const padrao = html("lista", {});
    expect(padrao).toContain(">131<");
    expect(padrao).not.toContain(">128<");
    const atrasadas = html("lista", { "lista.atrasadas": "sim" });
    expect(atrasadas).toContain(">131<");
    const noDiaPrevisto = html("lista", { "lista.tabela": DIA_DA_SAIDA, "lista.atrasadas": "sim" });
    expect(noDiaPrevisto).toContain("Nenhuma entrega com esses filtros.");
  });

  test("depois de confirmada, a entrega sai da lista padrão e aparece em Entregue", () => {
    const roteiro = roteiroDe("confirmar-entrega");
    const indice = roteiro.passos.findIndex((p) => p.alvo === "lista.tabela");
    expect(html("lista", valoresAte(roteiro, indice))).toContain("Nenhuma entrega com esses filtros.");
    const entregues = html("lista", valoresAte(roteiro, roteiro.passos.length - 1));
    expect(entregues).toContain(">131<");
    expect(entregues).toContain(">128<");
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
