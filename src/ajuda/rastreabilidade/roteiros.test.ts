import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { clientesDoRastreio, linhasDeDestino, resultadoDaBusca } from "./cenas";
import { BUSCA_PARCIAL, FILHO, FRUTO, POLPA, RASTREIOS } from "./exemplo";
import { ajudaRastreabilidade } from "./index";

const { roteiros, cenas } = ajudaRastreabilidade;

const destino = (r: (typeof RASTREIOS)[number]) => Object.fromEntries(linhasDeDestino(r).map((l) => [l.rotulo, l.kg]));

describe("roteiros da Rastreabilidade", () => {
  test("são os 4 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["recall-fruto", "origem-polpa", "familia", "buscar-exportar"]);
  });

  test("o destino de cada lote fecha no saldo (destinoDoLote) e bate com os textos", () => {
    for (const r of RASTREIOS) {
      const linhas = linhasDeDestino(r);
      const antesDoSaldo = linhas.slice(0, -1).reduce((s, l) => s + l.kg, 0);
      expect(antesDoSaldo, r.codigo).toBeCloseTo(linhas.at(-1)!.kg, 3);
    }
    expect(destino(FRUTO)).toMatchObject({ Entrada: 672, "Consumido em OP": -672, Saldo: 0 });
    expect(destino(POLPA)).toMatchObject({ Entrada: 300, Vendido: -120, "Ajuste: Amostra (ADEPARA/laboratório)": -1 });
    expect(destino(POLPA).Saldo).toBe(POLPA.saldoKg);
    expect(destino(FILHO)).toMatchObject({ Entrada: 700, Vendido: -50, Saldo: 650 });
  });

  test("o recall do fruto chega aos dois clientes; cancelado só aparece quando pedido e fica fora do total", () => {
    expect(clientesDoRastreio(FRUTO, false)).toMatchObject({ clientes: 2, kg: 170 });
    const comCancelados = clientesDoRastreio(FRUTO, true);
    expect(comCancelados.linhas.map((c) => c.pedido)).toEqual([127, 128, 131]);
    expect(comCancelados).toMatchObject({ clientes: 2, kg: 170 });
    expect(clientesDoRastreio(POLPA, false)).toMatchObject({ clientes: 1, kg: 120 });
  });

  test("código completo abre o rastreio; parte do código lista os lotes", () => {
    expect(resultadoDaBusca({ "busca.campo": "fa-261120-01" }).rastreio?.codigo).toBe(FRUTO.codigo);
    const busca = resultadoDaBusca({ "busca.campo": BUSCA_PARCIAL });
    expect(busca.rastreio).toBeNull();
    expect(busca.encontrados.map((l) => l.codigo)).toEqual([
      "FA-261120-02",
      "FA-261120-01",
      "FA-261118-01",
      "FA-261117-01",
    ]);
  });

  test("o cartão “Para frente” só aparece para fruto; a família só para lote dividido", () => {
    const html = (codigo: string) => renderToStaticMarkup(createElement(cenas.rastreio, { valores: { "busca.campo": codigo } }));
    expect(html(FRUTO.codigo)).toContain('data-alvo="frente.cartao"');
    expect(html(POLPA.codigo)).not.toContain('data-alvo="frente.cartao"');
    expect(html(POLPA.codigo)).not.toContain('data-alvo="familia.cartao"');
    expect(html(FILHO.codigo)).toContain('data-alvo="familia.cartao"');
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
