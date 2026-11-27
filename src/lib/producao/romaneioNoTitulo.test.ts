import { describe, expect, test } from "vitest";
import { documentoDoTituloDaRecepcao, romaneioNoTitulo } from "./romaneioNoTitulo";

describe("documentoDoTituloDaRecepcao", () => {
  test("usa o romaneio; sem ele, RF-<lote>", () => {
    expect(documentoDoTituloDaRecepcao("152", "FA-261120-01")).toBe("152");
    expect(documentoDoTituloDaRecepcao(null, "FA-261120-01")).toBe("RF-FA-261120-01");
  });
});

describe("romaneioNoTitulo", () => {
  const base = { documentoDaRecepcao: null, codigoLote: "FA-261120-01", temPagamento: false };

  test("título com o documento que a recepção gerou e sem pagamento acompanha o romaneio", () => {
    expect(romaneioNoTitulo({ ...base, documentoDoTitulo: "RF-FA-261120-01" })).toEqual({ segue: true });
    expect(
      romaneioNoTitulo({ ...base, documentoDaRecepcao: "152", documentoDoTitulo: "152" }),
    ).toEqual({ segue: true });
  });

  test("documento mudado em Contas a pagar não é sobrescrito", () => {
    const situacao = romaneioNoTitulo({ ...base, documentoDoTitulo: "NF 900" });
    expect(situacao.segue).toBe(false);
    expect(situacao.motivo).toMatch(/mudado em Contas a pagar/);
  });

  test("título com pagamento não muda", () => {
    const situacao = romaneioNoTitulo({ ...base, documentoDoTitulo: "RF-FA-261120-01", temPagamento: true });
    expect(situacao.segue).toBe(false);
    expect(situacao.motivo).toMatch(/pagamento/);
  });
});
