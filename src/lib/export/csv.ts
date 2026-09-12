import * as Papa from "papaparse";

export type ColunaExport<T> = {
  rotulo: string;
  valor: (linha: T) => string | number | Date;
};

function formatarNumeroCsv(valor: number): string {
  const arredondado = Math.round(valor * 100) / 100;
  return arredondado.toString().replace(".", ",");
}

function formatarValorCsv(valor: string | number | Date): string {
  if (valor instanceof Date) {
    return valor.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }
  if (typeof valor === "number") {
    return formatarNumeroCsv(valor);
  }
  return valor;
}

/**
 * `;` como separador (não `,`) e BOM UTF-8 no início — configuração
 * regional pt-BR do Excel trata `,` como separador decimal, não de
 * coluna, e sem o BOM os acentos corrompem ao abrir o arquivo no Excel.
 * Usa a forma `{ fields, data }` do papaparse (matriz), não array de
 * objetos, para o cabeçalho aparecer mesmo com `linhas` vazio — array de
 * objetos vazio não tem chaves pra papaparse inferir os nomes de coluna.
 */
export function gerarCsv<T>(linhas: T[], colunas: ColunaExport<T>[]): string {
  const fields = colunas.map((coluna) => coluna.rotulo);
  const data = linhas.map((linha) => colunas.map((coluna) => formatarValorCsv(coluna.valor(linha))));

  const csv = Papa.unparse({ fields, data }, { delimiter: ";", newline: "\n" });
  return "﻿" + csv;
}
