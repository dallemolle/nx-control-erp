import ExcelJS from "exceljs";
import type { ColunaExport } from "./csv";

/**
 * Números e datas como células nativas do Excel (não texto formatado) —
 * permite ao usuário somar/filtrar/ordenar direto na planilha.
 */
export async function gerarExcel<T>(
  linhas: T[],
  colunas: ColunaExport<T>[],
  nomeAba: string,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet(nomeAba);

  planilha.addRow(colunas.map((coluna) => coluna.rotulo));
  for (const linha of linhas) {
    planilha.addRow(colunas.map((coluna) => coluna.valor(linha)));
  }

  return workbook.xlsx.writeBuffer();
}
