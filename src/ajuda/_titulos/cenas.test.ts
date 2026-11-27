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
  dispensar: CenaDispensar,
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

  test("a prévia da baixa só aparece quando o roteiro preenche", () => {
    const texto = "Abate R$ 1.000,00 da parcela · fica R$ 0,00 em aberto";
    const com = html(CenaBaixa, { "baixa.previa": texto });
    expect(com).toContain(texto);
    expect(com).toContain('data-alvo="baixa.previa"');
    expect(html(CenaBaixa)).not.toContain("baixa.previa");
  });

  test("baixa aprovada aparece embaixo da parcela 1, que fica PAGO e sem Baixar", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "aprovada" });
    expect(saida).toContain('data-alvo="lista.p1.baixa"');
    expect(saida).toContain('data-alvo="lista.p1.estornar"');
    expect(saida).toContain("Baixa de 15/10/2026 · Sicredi - Ag 0101/CC 98765-4");
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

  test("baixa pendente: selo na lista e aviso no lugar do Baixar", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "pendente" });
    expect(saida).toContain("Aguardando aprovação");
    expect(saida).toContain('data-alvo="lista.p1.aguardando"');
    expect(saida).toContain("Baixa aguardando aprovação");
    expect(saida).toContain("registrada por Maria em 15/10/2026 10:20");
    expect(saida).not.toContain('data-alvo="lista.p1.baixar"');
    expect(saida).not.toContain('data-alvo="lista.p1.estornar"');
  });

  test("baixa rejeitada em aberto: selo, motivo, Dispensar e o aviso no topo", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "rejeitada" });
    expect(saida).toContain("Rejeitada");
    expect(saida).toContain(EXEMPLO.baixa.motivoRejeicao);
    expect(saida).toContain('data-alvo="lista.p1.dispensar"');
    expect(saida).toContain('data-alvo="lista.avisoRejeitadas"');
    expect(saida).toContain("1 baixa rejeitada aguardando novo registro.");
  });

  test("baixa rejeitada com o filtro de rejeitadas aplicado: só o título do exemplo e aviso sem Ver", () => {
    const valores = { "lista.p1.baixa": "rejeitada", "lista.filtro.rejeitadas": "1" };
    const saida = html(CenaLista, valores);
    expect(saida).toContain(EXEMPLO.documento);
    for (const outro of EXEMPLO.outrosTitulos) expect(saida).not.toContain(outro.documento);
    expect(saida).toContain('data-alvo="lista.avisoRejeitadas"');
    const aviso = saida.slice(saida.indexOf('data-alvo="lista.avisoRejeitadas"'));
    expect(aviso.slice(0, aviso.indexOf("</div>"))).not.toContain("Ver");
    // sem o filtro, os outros títulos aparecem e o aviso tem o Ver
    const semFiltro = html(CenaLista, { "lista.p1.baixa": "rejeitada" });
    for (const outro of EXEMPLO.outrosTitulos) expect(semFiltro).toContain(outro.documento);
  });

  test("baixa rejeitada e dispensada: linha apagada com a dispensa, sem aviso nem botão", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "dispensada" });
    expect(saida).toContain(EXEMPLO.baixa.motivoDispensa);
    expect(saida).not.toContain('data-alvo="lista.p1.dispensar"');
    expect(saida).not.toContain("aguardando novo registro");
  });

  test("janela Dispensar rejeição", () => {
    const saida = html(CenaDispensar, { "dispensa.motivo": EXEMPLO.baixa.motivoDispensa });
    expect(saida).toContain("Dispensar rejeição");
    expect(saida).toContain(EXEMPLO.baixa.motivoRejeicao);
    expect(saida).toContain('data-alvo="dispensa.confirmar"');
  });

  test("sem baixa no roteiro, a parcela 1 não mostra a lista", () => {
    expect(html(CenaLista, { "lista.linhaExemplo": "expandida" })).not.toContain('data-alvo="lista.p1.baixa"');
  });

  test("estorno tem o resumo, o aviso e o botão da tela real", () => {
    const saida = html(CenaEstornar);
    expect(saida).toContain("Estornar baixa");
    expect(saida).toContain("Baixa de 15/10/2026 · Sicredi - Ag 0101/CC 98765-4 · R$ 1.012,00");
    expect(saida).toContain("a parcela volta a ficar em aberto");
    expect(saida).toContain("Cancelar");
  });
});
