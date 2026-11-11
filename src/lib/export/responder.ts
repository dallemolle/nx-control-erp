import { gerarCsv, type ColunaExport } from "./csv";
import { gerarExcel } from "./excel";
import { gerarPdf, type CabecalhoPdf } from "./pdf";

export const FORMATOS_EXPORT = ["csv", "xlsx", "pdf"] as const;
export type FormatoExport = (typeof FORMATOS_EXPORT)[number];

/** Sem `?formato=` = CSV (compatível com links antigos); valor desconhecido = `null` (a rota responde 400). */
export function formatoExportDaUrl(valor: string | null): FormatoExport | null {
  if (valor === null || valor === "") return "csv";
  return (FORMATOS_EXPORT as readonly string[]).includes(valor) ? (valor as FormatoExport) : null;
}

/** Data de hoje (AAAA-MM-DD) no horário de Brasília — em UTC, depois das 21h o arquivo sairia com a data de amanhã. */
export function dataDoArquivo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

const CABECALHOS_COMUNS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store",
};

function respostaDeArquivo(corpo: BodyInit, contentType: string, nomeArquivo: string): Response {
  return new Response(corpo, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      ...CABECALHOS_COMUNS,
    },
  });
}

/** PDF montado fora do `responderExport` (ex.: relatório em seções), com o mesmo nome e cabeçalhos. */
export function responderArquivoPdf(bytes: Uint8Array, nomeArquivo: string): Response {
  return respostaDeArquivo(new Uint8Array(bytes), "application/pdf", `${nomeArquivo}-${dataDoArquivo()}.pdf`);
}

export async function responderExport<T>(
  linhas: T[],
  colunas: ColunaExport<T>[],
  opcoes: {
    nomeArquivo: string;
    nomeAba: string;
    formato: string | null;
    /** Título e contexto do PDF. Carregado só quando o formato é PDF (pode consultar o banco). Sem ele, o título é `nomeAba`. */
    cabecalhoPdf?: () => Promise<CabecalhoPdf>;
  },
): Promise<Response> {
  const formato = formatoExportDaUrl(opcoes.formato);
  if (formato === null) {
    return new Response(`Formato de exportação inválido. Use ${FORMATOS_EXPORT.join(", ")}.`, {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...CABECALHOS_COMUNS },
    });
  }

  const base = `${opcoes.nomeArquivo}-${dataDoArquivo()}`;

  if (formato === "xlsx") {
    const buffer = await gerarExcel(linhas, colunas, opcoes.nomeAba);
    return respostaDeArquivo(
      buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `${base}.xlsx`,
    );
  }

  if (formato === "pdf") {
    const cabecalho = opcoes.cabecalhoPdf ? await opcoes.cabecalhoPdf() : { titulo: opcoes.nomeAba, linhas: [] };
    const bytes = await gerarPdf(linhas, colunas, cabecalho);
    return respostaDeArquivo(new Uint8Array(bytes), "application/pdf", `${base}.pdf`);
  }

  return respostaDeArquivo(gerarCsv(linhas, colunas), "text/csv; charset=utf-8", `${base}.csv`);
}
