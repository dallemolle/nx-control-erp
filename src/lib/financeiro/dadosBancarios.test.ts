import { describe, expect, test } from "vitest";
import { dadosBancariosDaContraparte } from "./dadosBancarios";

const vazio = {
  meioPagamento: null,
  tipoChavePix: null,
  chavePix: null,
  banco: null,
  agencia: null,
  conta: null,
  tipoContaTerceiro: null,
  titularConta: null,
} as const;

describe("dadosBancariosDaContraparte", () => {
  test("Pix: tipo e chave", () => {
    expect(
      dadosBancariosDaContraparte({ ...vazio, meioPagamento: "PIX", tipoChavePix: "CPF_CNPJ", chavePix: "123.456.789-00" }),
    ).toBe("Pix (CPF/CNPJ): 123.456.789-00");
    expect(dadosBancariosDaContraparte({ ...vazio, meioPagamento: "PIX", chavePix: "abc" })).toBe("Pix: abc");
  });

  test("Depósito: banco, agência, conta, tipo e titular", () => {
    expect(
      dadosBancariosDaContraparte({
        ...vazio,
        meioPagamento: "DEPOSITO_BANCARIO",
        banco: { codigo: "001", nome: "Banco do Brasil" },
        agencia: "1234",
        conta: "56789-0",
        tipoContaTerceiro: "POUPANCA",
        titularConta: "José da Silva",
      }),
    ).toBe("Depósito: 001 · Banco do Brasil · ag. 1234 · conta 56789-0 (poupança) · titular José da Silva");
  });

  test("sem dados cadastrados devolve null", () => {
    expect(dadosBancariosDaContraparte(vazio)).toBeNull();
    expect(dadosBancariosDaContraparte({ ...vazio, meioPagamento: "PIX" })).toBeNull();
  });
});
