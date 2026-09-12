import { describe, expect, test } from "vitest";
import { gerarCsv, type ColunaExport } from "./csv";

type Linha = { nome: string; valor: number; data: Date };

const COLUNAS: ColunaExport<Linha>[] = [
  { rotulo: "Nome", valor: (l) => l.nome },
  { rotulo: "Valor", valor: (l) => l.valor },
  { rotulo: "Data", valor: (l) => l.data },
];

describe("gerarCsv", () => {
  test("usa ; como separador, não ,", () => {
    const csv = gerarCsv([{ nome: "Item A", valor: 100, data: new Date("2026-01-15T00:00:00Z") }], COLUNAS);
    const semBom = csv.replace("﻿", "");
    const primeiraLinha = semBom.split("\n")[0];
    expect(primeiraLinha).toBe("Nome;Valor;Data");
  });

  test("inclui BOM UTF-8 no início do arquivo", () => {
    const csv = gerarCsv([{ nome: "X", valor: 1, data: new Date("2026-01-01T00:00:00Z") }], COLUNAS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  test("mantém o cabeçalho mesmo sem nenhuma linha de dado", () => {
    const csv = gerarCsv([], COLUNAS);
    const semBom = csv.replace("﻿", "");
    expect(semBom.trim()).toBe("Nome;Valor;Data");
  });

  test("formata Date como dd/mm/aaaa", () => {
    const csv = gerarCsv([{ nome: "Item A", valor: 100, data: new Date("2026-01-15T00:00:00Z") }], COLUNAS);
    expect(csv).toContain("15/01/2026");
  });

  test("uma linha por item, na ordem das colunas", () => {
    const csv = gerarCsv(
      [
        { nome: "A", valor: 1, data: new Date("2026-01-01T00:00:00Z") },
        { nome: "B", valor: 2, data: new Date("2026-01-02T00:00:00Z") },
      ],
      COLUNAS,
    );
    const linhas = csv.replace("﻿", "").trim().split("\n");
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toBe("A;1;01/01/2026");
    expect(linhas[2]).toBe("B;2;02/01/2026");
  });
});
