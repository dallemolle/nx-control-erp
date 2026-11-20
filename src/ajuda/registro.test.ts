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
});
