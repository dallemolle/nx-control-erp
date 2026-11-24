import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { PropsCena } from "@/ajuda/tipos";
import { EXEMPLO } from "@/ajuda/contas-a-pagar/exemplo";
import { criarCenas } from "./cenas";

const {
  lista: CenaLista,
  novoTitulo: CenaNovoTitulo,
  baixa: CenaBaixa,
  renegociar: CenaRenegociar,
  estornar: CenaEstornar,
} = criarCenas("PAGAR", EXEMPLO);

const html = (componente: ComponentType<PropsCena>, valores: Record<string, string> = {}) =>
  renderToStaticMarkup(createElement(componente, { valores }));

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
    const saida = renderToStaticMarkup(createElement(criarCenas("RECEBER", EXEMPLO).lista, { valores: {} }));
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

  test("baixa aprovada aparece embaixo da parcela 1, que fica PAGO e sem Baixar", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "aprovada" });
    expect(saida).toContain('data-alvo="lista.p1.baixa"');
    expect(saida).toContain('data-alvo="lista.p1.estornar"');
    expect(saida).toContain("Baixa de 15/10/2026 · Sicredi — CC 98765-4");
    expect(saida).toContain("registrada por Maria · aprovada por João");
    expect(saida).not.toContain('data-alvo="lista.p1.baixar"');
  });

  test("baixa estornada: selo e motivo, sem Estornar, e a parcela volta a ter Baixar", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "estornada" });
    expect(saida).toContain("Estornada");
    expect(saida).toContain("estornada por João em 16/10/2026 09:40: Conta errada");
    expect(saida).not.toContain('data-alvo="lista.p1.estornar"');
    expect(saida).toContain('data-alvo="lista.p1.baixar"');
  });

  test("sem baixa no roteiro, a parcela 1 não mostra a lista", () => {
    expect(html(CenaLista, { "lista.linhaExemplo": "expandida" })).not.toContain('data-alvo="lista.p1.baixa"');
  });

  test("estorno tem o resumo, o aviso e o botão da tela real", () => {
    const saida = html(CenaEstornar);
    expect(saida).toContain("Estornar baixa");
    expect(saida).toContain("Baixa de 15/10/2026 · Sicredi — CC 98765-4 · R$ 1.012,00");
    expect(saida).toContain("a parcela volta a ficar em aberto");
  });
});
