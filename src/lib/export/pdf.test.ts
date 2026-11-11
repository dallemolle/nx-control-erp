import { describe, expect, test } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calcularLargurasColunas, formatarValorPdf, gerarPdf, gerarPdfSecoes, secaoPdf } from "./pdf";
import type { ColunaExport } from "./csv";

type Linha = { nome: string; valor: number; data: Date; ano: number; margem: number };

const COLUNAS: ColunaExport<Linha>[] = [
  { rotulo: "Nome", valor: (l) => l.nome },
  { rotulo: "Valor", valor: (l) => l.valor },
  { rotulo: "Data", valor: (l) => l.data },
  { rotulo: "Ano", valor: (l) => l.ano, tipo: "inteiro" },
  { rotulo: "Margem %", valor: (l) => l.margem, tipo: "percentual" },
];

const LINHA: Linha = { nome: "Café São João", valor: 1234.5, data: new Date("2026-01-15T00:00:00Z"), ano: 2026, margem: 12.345 };
const AGORA = new Date("2026-11-05T15:00:00Z");

describe("formatarValorPdf", () => {
  test("número sem tipo sai como valor com milhar e 2 casas", () => {
    expect(formatarValorPdf(COLUNAS[1], 1234.5)).toBe("1.234,50");
    expect(formatarValorPdf(COLUNAS[1], -10)).toBe("-10,00");
  });

  test("inteiro sai sem separador de milhar (ano não vira 2.026,00)", () => {
    expect(formatarValorPdf(COLUNAS[3], 2026)).toBe("2026");
  });

  test("percentual sai com 1 casa e %", () => {
    expect(formatarValorPdf(COLUNAS[4], 12.345)).toBe("12,3%");
  });

  test("data sai dd/mm/aaaa em UTC (data de calendário não muda de dia)", () => {
    expect(formatarValorPdf(COLUNAS[2], new Date("2026-01-15T00:00:00Z"))).toBe("15/01/2026");
  });

  test("texto e célula vazia passam como estão", () => {
    expect(formatarValorPdf(COLUNAS[0], "abc")).toBe("abc");
    expect(formatarValorPdf(COLUNAS[4], "")).toBe("");
  });
});

describe("calcularLargurasColunas", () => {
  test("quando tudo cabe, distribui a sobra igualmente e ocupa a largura toda", () => {
    const larguras = calcularLargurasColunas([100, 200], 400);
    expect(larguras).toEqual([150, 250]);
  });

  test("quando não cabe, colunas estreitas mantêm a largura e as largas dividem o resto", () => {
    const larguras = calcularLargurasColunas([50, 1000, 1000], 450);
    expect(larguras[0]).toBe(50);
    expect(larguras[1]).toBe(200);
    expect(larguras[2]).toBe(200);
    expect(larguras.reduce((a, b) => a + b, 0)).toBeCloseTo(450);
  });
});

describe("gerarPdf", () => {
  test("gera um PDF válido com título nos metadados", async () => {
    const bytes = await gerarPdf([LINHA], COLUNAS, { titulo: "Relatório de teste", linhas: ["Empresa — Matriz"] }, AGORA);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

    const documento = await PDFDocument.load(bytes);
    expect(documento.getTitle()).toBe("Relatório de teste");
    expect(documento.getPageCount()).toBe(1);
    const { width, height } = documento.getPage(0).getSize();
    expect(width).toBeGreaterThan(height); // paisagem
  });

  test("sem linhas ainda gera uma página (só cabeçalho e aviso)", async () => {
    const bytes = await gerarPdf([], COLUNAS, { titulo: "Vazio", linhas: [] }, AGORA);
    const documento = await PDFDocument.load(bytes);
    expect(documento.getPageCount()).toBe(1);
  });

  test("muitas linhas quebram em várias páginas", async () => {
    const linhas = Array.from({ length: 300 }, (_, i) => ({ ...LINHA, nome: `Item ${i}` }));
    const bytes = await gerarPdf(linhas, COLUNAS, { titulo: "Longo", linhas: [] }, AGORA);
    const documento = await PDFDocument.load(bytes);
    expect(documento.getPageCount()).toBeGreaterThan(5);
  });

  test("caracteres fora da fonte padrão (seta, emoji) e quebras de linha não derrubam a geração", async () => {
    const linha = { ...LINHA, nome: "Entrada → saída 🚜\nsegunda linha\ttab" };
    await expect(gerarPdf([linha], COLUNAS, { titulo: "Fiscal × gerencial → teste", linhas: [] }, AGORA)).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });

  test("texto muito longo sem espaços (JSON, chave de acesso) é quebrado e cortado sem erro", async () => {
    const linha = { ...LINHA, nome: "x".repeat(5000) };
    const bytes = await gerarPdf([linha], COLUNAS, { titulo: "Longo", linhas: [] }, AGORA);
    const documento = await PDFDocument.load(bytes);
    expect(documento.getPageCount()).toBe(1);
  });
});

describe("gerarPdfSecoes", () => {
  type Item = { rotulo: string; kg: number };
  const COLUNAS_ITEM: ColunaExport<Item>[] = [
    { rotulo: "Item", valor: (i) => i.rotulo },
    { rotulo: "kg", valor: (i) => i.kg },
  ];

  test("várias seções, uma vazia, num PDF válido", async () => {
    const bytes = await gerarPdfSecoes(
      [
        secaoPdf({ titulo: "Lote", linhas: [LINHA], colunas: COLUNAS }),
        secaoPdf({ titulo: "Destino", linhas: [] as Item[], colunas: COLUNAS_ITEM }),
        secaoPdf({ titulo: "Itens", linhas: [{ rotulo: "Entrada", kg: 10 }], colunas: COLUNAS_ITEM }),
      ],
      { titulo: "Rastreabilidade", linhas: ["Empresa — Matriz"] },
      AGORA,
    );
    const documento = await PDFDocument.load(bytes);
    expect(documento.getTitle()).toBe("Rastreabilidade");
    expect(documento.getPageCount()).toBe(1);
  });

  test("seção longa quebra página", async () => {
    const muitas = Array.from({ length: 120 }, (_, n) => ({ rotulo: `Linha ${n}`, kg: n }));
    const bytes = await gerarPdfSecoes(
      [secaoPdf({ titulo: "Primeira", linhas: muitas, colunas: COLUNAS_ITEM }), secaoPdf({ titulo: "Segunda", linhas: muitas, colunas: COLUNAS_ITEM })],
      { titulo: "Longo", linhas: [] },
      AGORA,
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });
});
