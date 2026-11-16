import { describe, expect, test } from "vitest";
import { PDFDocument } from "pdf-lib";
import { gerarReciboPdf, type DadosRecibo } from "./recibo";

const base: DadosRecibo = {
  empresa: "Empresa Exemplo",
  documentoEmpresa: "12.345.678/0001-90",
  numero: 12,
  data: new Date("2026-11-10T00:00:00.000Z"),
  cliente: "Cliente exemplo",
  documentoCliente: null,
  itens: [{ produto: "Polpa de açaí grosso", lote: "AGC-261101-01", quantidadeKg: 10, precoKg: 5, valor: 50 }],
  total: 50,
  formaPagamento: "Pix",
  situacao: "Pago",
  cancelado: false,
  observacao: null,
  condicao: null,
  parcelas: [],
};

describe("gerarReciboPdf", () => {
  test("uma página A4", async () => {
    const pdf = await PDFDocument.load(await gerarReciboPdf(base));
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
  });

  test("muitos itens quebram em mais de uma página", async () => {
    const itens = Array.from({ length: 80 }, (_, i) => ({ ...base.itens[0], lote: `AGC-261101-${i + 1}` }));
    const pdf = await PDFDocument.load(await gerarReciboPdf({ ...base, itens, total: 4000 }));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  test("a prazo com 60 parcelas mostra condição e quebra página sem erro", async () => {
    const parcelas = Array.from({ length: 60 }, (_, i) => ({
      numero: i + 1,
      dataVencimento: new Date(Date.UTC(2026, 11 + i, 10)),
      valor: 10,
    }));
    const bytes = await gerarReciboPdf({ ...base, formaPagamento: "A prazo", condicao: "30/60", parcelas, total: 600 });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });

  test("acentos, travessão e cancelado não quebram", async () => {
    await expect(
      gerarReciboPdf({ ...base, cliente: "Açaí & Cia – Ltda", cancelado: true, observacao: "Refeito → pedido 13" }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});
