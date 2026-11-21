import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import type { Valores } from "@/ajuda/tipos";
import { calcularRepasses, condicaoParaVenda, validarCondicoesCartao } from "@/lib/producao/cartao";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { operadoraCartaoSchema } from "@/lib/schemas/operadoraCartao";
import { condicoesDaPague, condicoesDaRurais, operadorasDoRoteiro, textoDaCondicao } from "./cenas";
import { CARTOES_RURAIS, HOJE, PAGUE, PORTO, VENDA_10X, VENDA_3X } from "./exemplo";
import { ajudaOperadorasCartao } from "./index";

const { roteiros, cenas } = ajudaOperadorasCartao;
const roteiroDe = (id: string) => roteiros.find((r) => r.id === id)!;
const html = (cena: string, valores: Valores) => renderToStaticMarkup(createElement(cenas[cena], { valores }));
const fim = (id: string) => valoresAte(roteiroDe(id), roteiroDe(id).passos.length - 1);
const semNbsp = (texto: string) => texto.replace(/ /g, " ");
const deData = (texto: string) => {
  const [d, m, a] = texto.split("/");
  return new Date(`${a}-${m}-${d}T00:00:00.000Z`);
};

describe("roteiros de Operadoras de cartão", () => {
  test("são os 3 roteiros, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual(["cadastrar-operadora", "parcelado", "mudar-inativar"]);
  });

  test("todas as condições do exemplo passam nas regras do sistema", () => {
    for (const condicoes of [CARTOES_RURAIS.condicoes, PORTO.condicoes, condicoesDaPague({ "form.parcelado": "2" })]) {
      expect(validarCondicoesCartao(condicoes)).toBeNull();
    }
    const cruzadas = [{ ...PAGUE.parcelado[0] }, { ...PAGUE.parcelado[1], parcelasDe: 6 }];
    expect(validarCondicoesCartao(cruzadas)).toBe("As faixas do parcelado se sobrepõem");
  });

  test("a Pague Norte passa na validação do cadastro", () => {
    const resultado = operadoraCartaoSchema.safeParse({
      nome: PAGUE.nome,
      cnpjCpf: PAGUE.cnpjDigitado,
      contaBancariaId: "sicredi",
      categoriaTaxaId: "taxas",
      condicoes: JSON.stringify(condicoesDaPague({ "form.parcelado": "2" })),
    });
    expect(resultado.success).toBe(true);
  });

  test("os repasses citados batem com calcularRepasses", () => {
    const condicoes = condicoesDaPague({ "form.parcelado": "2" });
    const venda3x = calcularRepasses(
      deData(HOJE),
      VENDA_3X.valor,
      condicaoParaVenda(condicoes, "CREDITO_PARCELADO", VENDA_3X.parcelas)!,
      VENDA_3X.parcelas,
    );
    expect(venda3x.map((r) => formatarData(r.data))).toEqual(VENDA_3X.datas);
    expect(venda3x.every((r) => semNbsp(formatarMoeda(r.liquido)) === VENDA_3X.liquidoPorRepasse)).toBe(true);

    const venda10x = calcularRepasses(
      deData(HOJE),
      VENDA_10X.valor,
      condicaoParaVenda(condicoes, "CREDITO_PARCELADO", VENDA_10X.parcelas)!,
      VENDA_10X.parcelas,
    );
    expect(venda10x).toHaveLength(1);
    expect(semNbsp(formatarMoeda(venda10x[0].liquido))).toBe(VENDA_10X.liquido);
    expect(formatarData(venda10x[0].data)).toBe(VENDA_10X.data);
  });

  test("a lista mostra as condições como a tela formata, com a taxa nova do débito", () => {
    const rurais = condicoesDaRurais(fim("mudar-inativar"));
    expect(textoDaCondicao(rurais[0])).toBe("Débito · 1,4% · 1 dia");
    const pague = condicoesDaPague({ "form.parcelado": "2" }).map(textoDaCondicao);
    expect(pague).toEqual([
      "Débito · 1,2% · 1 dia",
      "Crédito à vista · 2,9% · 30 dias",
      "Crédito parcelado 2–6x · 3,9% · 30 dias",
      "Crédito parcelado 7–12x · 5,5% · antecipado em 30 dias",
      "Pix na maquininha · 0,8% · 0 dias",
    ]);
  });

  test("inativar muda o status da Maquininha do Porto e o botão vira Reativar", () => {
    const roteiro = roteiroDe("mudar-inativar");
    expect(operadorasDoRoteiro(valoresAte(roteiro, 0)).find((o) => o.chave === "porto")?.ativa).toBe(true);
    expect(operadorasDoRoteiro(fim("mudar-inativar")).find((o) => o.chave === "porto")?.ativa).toBe(false);
    expect(html("lista", fim("mudar-inativar"))).toContain("Reativar");
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
