import { describe, expect, test } from "vitest";
import { carregarAjuda, temAjuda, tituloDaAjuda } from "./registro";

describe("registro da ajuda", () => {
  test("tela desconhecida não tem ajuda", async () => {
    expect(temAjuda("tela-que-nao-existe")).toBe(false);
    expect(temAjuda("constructor")).toBe(false);
    expect(() => tituloDaAjuda("tela-que-nao-existe")).toThrow();
    await expect(carregarAjuda("tela-que-nao-existe")).rejects.toThrow();
  });

  test("contas a pagar tem ajuda e carrega a definição", async () => {
    expect(temAjuda("contas-a-pagar")).toBe(true);
    expect(tituloDaAjuda("contas-a-pagar")).toBe("Contas a pagar");
    const definicao = await carregarAjuda("contas-a-pagar");
    expect(definicao.roteiros.length).toBe(6);
  });

  test("contas a receber tem ajuda e carrega a definição", async () => {
    expect(tituloDaAjuda("contas-a-receber")).toBe("Contas a receber");
    const definicao = await carregarAjuda("contas-a-receber");
    expect(definicao.tituloTela).toBe("Contas a receber");
    expect(definicao.roteiros.length).toBe(6);
  });

  test("aprovações pendentes tem ajuda", async () => {
    expect(tituloDaAjuda("aprovacoes")).toBe("Aprovações pendentes");
    expect((await carregarAjuda("aprovacoes")).roteiros.length).toBe(3);
  });

  test("repasses de cartão tem ajuda", async () => {
    expect(tituloDaAjuda("repasses-cartao")).toBe("Repasses de cartão");
    expect((await carregarAjuda("repasses-cartao")).roteiros.length).toBe(3);
  });

  test("tesouraria tem ajuda", async () => {
    expect(tituloDaAjuda("tesouraria")).toBe("Tesouraria");
    expect((await carregarAjuda("tesouraria")).roteiros.length).toBe(4);
  });

  test("conciliação tem ajuda", async () => {
    expect(tituloDaAjuda("conciliacao")).toBe("Conciliação bancária");
    expect((await carregarAjuda("conciliacao")).roteiros.length).toBe(6);
  });

  test("fluxo de caixa tem ajuda", async () => {
    expect(tituloDaAjuda("fluxo-de-caixa")).toBe("Fluxo de caixa");
    expect((await carregarAjuda("fluxo-de-caixa")).roteiros.length).toBe(3);
  });

  test("fluxo de caixa projetado tem ajuda", async () => {
    expect(tituloDaAjuda("fluxo-de-caixa-projetado")).toBe("Fluxo de caixa projetado");
    expect((await carregarAjuda("fluxo-de-caixa-projetado")).roteiros.length).toBe(3);
  });

  test("fluxo de caixa estratégico tem ajuda", async () => {
    expect(tituloDaAjuda("fluxo-de-caixa-estrategico")).toBe("Fluxo de caixa estratégico");
    expect((await carregarAjuda("fluxo-de-caixa-estrategico")).roteiros.length).toBe(3);
  });

  test("orçamento tem ajuda", async () => {
    expect(tituloDaAjuda("orcamento")).toBe("Orçamento");
    expect((await carregarAjuda("orcamento")).roteiros.length).toBe(3);
  });

  test("fluxo por dimensão tem ajuda", async () => {
    expect(tituloDaAjuda("fluxo-por-dimensao")).toBe("Fluxo de caixa por dimensão");
    expect((await carregarAjuda("fluxo-por-dimensao")).roteiros.length).toBe(3);
  });

  test("comparação entre safras tem ajuda", async () => {
    expect(tituloDaAjuda("comparacao-safras")).toBe("Comparação entre safras");
    expect((await carregarAjuda("comparacao-safras")).roteiros.length).toBe(3);
  });

  test("fiscal × gerencial tem ajuda", async () => {
    expect(tituloDaAjuda("fiscal-gerencial")).toBe("Fiscal × gerencial");
    expect((await carregarAjuda("fiscal-gerencial")).roteiros.length).toBe(3);
  });

  test("recepção de fruto tem ajuda", async () => {
    expect(tituloDaAjuda("recepcao")).toBe("Recepção de fruto");
    expect((await carregarAjuda("recepcao")).roteiros.length).toBe(4);
  });

  test("processamento tem ajuda", async () => {
    expect(tituloDaAjuda("processamento")).toBe("Processamento");
    expect((await carregarAjuda("processamento")).roteiros.length).toBe(6);
  });

  test("estoque tem ajuda", async () => {
    expect(tituloDaAjuda("estoque")).toBe("Estoque");
    expect((await carregarAjuda("estoque")).roteiros.length).toBe(5);
  });

  test("ajustes de estoque tem ajuda", async () => {
    expect(tituloDaAjuda("ajustes")).toBe("Ajustes de estoque");
    expect((await carregarAjuda("ajustes")).roteiros.length).toBe(4);
  });

  test("rastreabilidade tem ajuda", async () => {
    expect(tituloDaAjuda("rastreabilidade")).toBe("Rastreabilidade");
    expect((await carregarAjuda("rastreabilidade")).roteiros.length).toBe(4);
  });

  test("painel de produção tem ajuda", async () => {
    expect(tituloDaAjuda("painel")).toBe("Painel de produção");
    expect((await carregarAjuda("painel")).roteiros.length).toBe(3);
  });

  test("relatório mensal tem ajuda", async () => {
    expect(tituloDaAjuda("relatorio-mensal")).toBe("Relatório mensal");
    expect((await carregarAjuda("relatorio-mensal")).roteiros.length).toBe(3);
  });

  test("relatório de vendas tem ajuda", async () => {
    expect(tituloDaAjuda("relatorio-vendas")).toBe("Relatório de vendas");
    expect((await carregarAjuda("relatorio-vendas")).roteiros.length).toBe(3);
  });

  test("relatório de origem tem ajuda", async () => {
    expect(tituloDaAjuda("relatorio-origem")).toBe("Relatório de origem");
    expect((await carregarAjuda("relatorio-origem")).roteiros.length).toBe(3);
  });
});
