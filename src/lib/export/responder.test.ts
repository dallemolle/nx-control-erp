import { describe, expect, test } from "vitest";
import { dataDoArquivo, formatoExportDaUrl, responderExport } from "./responder";
import type { ColunaExport } from "./csv";

type Linha = { nome: string; valor: number };
const COLUNAS: ColunaExport<Linha>[] = [
  { rotulo: "Nome", valor: (l) => l.nome },
  { rotulo: "Valor", valor: (l) => l.valor },
];
const LINHAS: Linha[] = [{ nome: "A", valor: 10 }];

describe("formatoExportDaUrl", () => {
  test("sem formato = csv (links antigos continuam funcionando)", () => {
    expect(formatoExportDaUrl(null)).toBe("csv");
    expect(formatoExportDaUrl("")).toBe("csv");
  });

  test("formatos conhecidos passam", () => {
    expect(formatoExportDaUrl("csv")).toBe("csv");
    expect(formatoExportDaUrl("xlsx")).toBe("xlsx");
    expect(formatoExportDaUrl("pdf")).toBe("pdf");
  });

  test("formato desconhecido = null (não vira CSV em silêncio)", () => {
    expect(formatoExportDaUrl("xls")).toBeNull();
    expect(formatoExportDaUrl("PDF")).toBeNull();
  });
});

describe("dataDoArquivo", () => {
  test("usa o dia de Brasília: 23h de 05/11 em Brasília (02h UTC do dia 06) continua dia 05", () => {
    expect(dataDoArquivo(new Date("2026-11-06T02:00:00Z"))).toBe("2026-11-05");
  });

  test("meio do dia não muda", () => {
    expect(dataDoArquivo(new Date("2026-11-05T15:00:00Z"))).toBe("2026-11-05");
  });
});

describe("responderExport", () => {
  test("formato desconhecido responde 400 e não gera arquivo", async () => {
    const resposta = await responderExport(LINHAS, COLUNAS, { nomeArquivo: "teste", nomeAba: "Teste", formato: "doc" });
    expect(resposta.status).toBe(400);
    expect(resposta.headers.get("Content-Disposition")).toBeNull();
  });

  test("pdf responde application/pdf com extensão .pdf e usa o cabeçalho informado", async () => {
    let cabecalhoCarregado = false;
    const resposta = await responderExport(LINHAS, COLUNAS, {
      nomeArquivo: "teste",
      nomeAba: "Teste",
      formato: "pdf",
      cabecalhoPdf: async () => {
        cabecalhoCarregado = true;
        return { titulo: "Teste", linhas: ["Empresa — Matriz"] };
      },
    });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Content-Type")).toBe("application/pdf");
    expect(resposta.headers.get("Content-Disposition")).toMatch(/^attachment; filename="teste-\d{4}-\d{2}-\d{2}\.pdf"$/);
    expect(cabecalhoCarregado).toBe(true);
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  test("csv não carrega o cabeçalho do PDF (sem consulta ao banco à toa)", async () => {
    let cabecalhoCarregado = false;
    const resposta = await responderExport(LINHAS, COLUNAS, {
      nomeArquivo: "teste",
      nomeAba: "Teste",
      formato: "csv",
      cabecalhoPdf: async () => {
        cabecalhoCarregado = true;
        return { titulo: "Teste", linhas: [] };
      },
    });
    expect(resposta.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(cabecalhoCarregado).toBe(false);
  });
});
