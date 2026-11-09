import { describe, expect, test } from "vitest";
import { PDFDocument } from "pdf-lib";
import { gerarEtiquetaPdf, type DadosEtiqueta } from "./etiqueta";

const DADOS: DadosEtiqueta = {
  empresa: "Empresa Demonstração",
  produto: "Polpa de açaí grosso – congelada",
  codigoLote: "AGC-261109-01",
  rotuloData: "Fabricação",
  data: new Date("2026-11-09"),
  validade: new Date("2027-11-09"),
  armazenamento: "−18 °C",
  pesoLiquidoKg: 120.5,
  registroAdepara: "ADEPARA 123",
};

describe("gerarEtiquetaPdf", () => {
  test("uma página de 100 × 70 mm", async () => {
    const pdf = await PDFDocument.load(await gerarEtiquetaPdf(DADOS));
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(283.46, 1);
    expect(height).toBeCloseTo(198.43, 1);
  });

  test("aceita travessão, sinal de menos e campos opcionais vazios", async () => {
    await expect(
      gerarEtiquetaPdf({ ...DADOS, armazenamento: null, registroAdepara: null, rotuloData: "Recepção" }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});
