import { describe, expect, test } from "vitest";
import { carregarAjuda, temAjuda, tituloDaAjuda } from "./registro";

describe("registro da ajuda", () => {
  test("tela desconhecida não tem ajuda", async () => {
    expect(temAjuda("tela-que-nao-existe")).toBe(false);
    expect(temAjuda("constructor")).toBe(false);
    expect(() => tituloDaAjuda("tela-que-nao-existe")).toThrow();
    await expect(carregarAjuda("tela-que-nao-existe")).rejects.toThrow();
  });
});