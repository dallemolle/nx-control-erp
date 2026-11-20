import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { PropsCena } from "@/ajuda/tipos";
import { EXEMPLO } from "@/ajuda/contas-a-pagar/exemplo";
import { criarCenas } from "./cenas";

const { lista: CenaLista, novoTitulo: CenaNovoTitulo, baixa: CenaBaixa, renegociar: CenaRenegociar } =
  criarCenas(EXEMPLO);

const html = (componente: ComponentType<PropsCena>, valores: Record<string, string> = {}) =>
  renderToStaticMarkup(createElement(componente, { tipo: "PAGAR", valores }));

describe("cenas de títulos (exemplo de Contas a pagar)", () => {
  test("lista mostra o título do exemplo fechado por padrão", () => {
    const saida = html(CenaLista);
    expect(saida).toContain("Contas a pagar");
    expect(saida).toContain("NF-e 1234");
    expect(saida).not.toContain("Parcela 1");
  });

  test("lista expandida mostra as parcelas e as ações", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida" });
    expect(saida).toContain("Parcela 1 — venc. 10/10/2026");
    expect(saida).toContain('data-alvo="lista.p2.renegociar"');
    // A parcela 3 não está vencida: não tem Renegociar.
    expect(saida).not.toContain('data-alvo="lista.p3.renegociar"');
  });

  test("lista sem o exemplo, para o roteiro de cadastro", () => {
    expect(html(CenaLista, { "lista.tabela": "sem-exemplo" })).not.toContain("NF-e 1234");
  });

  test("filtro de fornecedor deixa só o título do exemplo", () => {
    const saida = html(CenaLista, { "lista.filtro.fornecedor": "Agro Insumos Ltda" });
    expect(saida).toContain("NF-e 1234");
    expect(saida).not.toContain("Fatura 556");
  });

  test("contas a receber troca os rótulos", () => {
    const saida = renderToStaticMarkup(createElement(CenaLista, { tipo: "RECEBER", valores: {} }));
    expect(saida).toContain("Contas a receber");
    expect(saida).toContain("Cliente");
  });

  test("novo título mostra os campos da nota só depois do tipo de comprovante", () => {
    expect(html(CenaNovoTitulo)).not.toContain("Nº da nota");
    expect(html(CenaNovoTitulo, { "novo.tipoComprovante": "NF-e" })).toContain("Nº da nota");
  });

  test("novo título cria as linhas de parcela conforme os valores", () => {
    expect(html(CenaNovoTitulo)).not.toContain('data-alvo="novo.parcela2"');
    const saida = html(CenaNovoTitulo, { "novo.parcela2": "preenchida" });
    expect(saida).toContain('data-alvo="novo.parcela2"');
    expect(saida).toContain("10/11/2026");
  });

  test("baixa e renegociação têm os títulos da tela real", () => {
    expect(html(CenaBaixa)).toContain("Registrar baixa (fica pendente de aprovação)");
    expect(html(CenaRenegociar)).toContain("Confirmar renegociação");
  });
});
