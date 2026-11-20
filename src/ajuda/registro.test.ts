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
});
