import { gerarCsv, type ColunaExport } from "./csv";
import { gerarExcel } from "./excel";

export async function responderExport<T>(
  linhas: T[],
  colunas: ColunaExport<T>[],
  opcoes: { nomeArquivo: string; nomeAba: string; formato: string | null },
): Promise<Response> {
  const dataDeHoje = new Date().toISOString().slice(0, 10);

  if (opcoes.formato === "xlsx") {
    const buffer = await gerarExcel(linhas, colunas, opcoes.nomeAba);
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${opcoes.nomeArquivo}-${dataDeHoje}.xlsx"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const csv = gerarCsv(linhas, colunas);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${opcoes.nomeArquivo}-${dataDeHoje}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
