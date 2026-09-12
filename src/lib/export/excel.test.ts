import { describe, expect, test } from "vitest";
import ExcelJS from "exceljs";
import { gerarExcel } from "./excel";
import type { ColunaExport } from "./csv";

type Linha = { nome: string; valor: number; data: Date };

const COLUNAS: ColunaExport<Linha>[] = [
  { rotulo: "Nome", valor: (l) => l.nome },
  { rotulo: "Valor", valor: (l) => l.valor },
  { rotulo: "Data", valor: (l) => l.data },
];

describe("gerarExcel", () => {
  test("gera uma planilha com o nome informado, cabeçalho e uma linha por item", async () => {
    const linhas: Linha[] = [{ nome: "Item A", valor: 100, data: new Date("2026-01-15T00:00:00Z") }];
    const buffer = await gerarExcel(linhas, COLUNAS, "Teste");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const planilha = workbook.getWorksheet("Teste");

    expect(planilha).toBeDefined();
    expect(planilha!.getRow(1).getCell(1).value).toBe("Nome");
    expect(planilha!.getRow(1).getCell(2).value).toBe("Valor");
    expect(planilha!.getRow(1).getCell(3).value).toBe("Data");
    expect(planilha!.getRow(2).getCell(1).value).toBe("Item A");
  });

  test("valor numérico é escrito como número, não texto", async () => {
    const buffer = await gerarExcel([{ nome: "Item A", valor: 100, data: new Date("2026-01-15T00:00:00Z") }], COLUNAS, "Teste");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const planilha = workbook.getWorksheet("Teste")!;
    expect(typeof planilha.getRow(2).getCell(2).value).toBe("number");
  });

  test("planilha vazia (só cabeçalho) quando não há linhas", async () => {
    const buffer = await gerarExcel([], COLUNAS, "Vazio");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const planilha = workbook.getWorksheet("Vazio")!;
    expect(planilha.rowCount).toBe(1);
  });

  test("várias linhas mantêm a ordem original", async () => {
    const linhas: Linha[] = [
      { nome: "A", valor: 1, data: new Date("2026-01-01T00:00:00Z") },
      { nome: "B", valor: 2, data: new Date("2026-01-02T00:00:00Z") },
    ];
    const buffer = await gerarExcel(linhas, COLUNAS, "Teste");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const planilha = workbook.getWorksheet("Teste")!;
    expect(planilha.getRow(2).getCell(1).value).toBe("A");
    expect(planilha.getRow(3).getCell(1).value).toBe("B");
  });
});
