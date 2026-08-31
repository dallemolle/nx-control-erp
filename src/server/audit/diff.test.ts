import { describe, expect, test } from "vitest";
import { buildAuditDiff } from "./diff";

describe("buildAuditDiff", () => {
  test("na criação, valorAnterior é null e valorNovo traz o registro todo", () => {
    const diff = buildAuditDiff(null, { nome: "Fazenda Sul", ativo: true });

    expect(diff).toEqual({
      valorAnterior: null,
      valorNovo: { nome: "Fazenda Sul", ativo: true },
    });
  });

  test("na edição, só os campos alterados aparecem em ambos os lados", () => {
    const diff = buildAuditDiff(
      { nome: "Fazenda Sul", ativo: true },
      { nome: "Fazenda Norte", ativo: true },
    );

    expect(diff).toEqual({
      valorAnterior: { nome: "Fazenda Sul" },
      valorNovo: { nome: "Fazenda Norte" },
    });
  });

  test("quando nada muda, os dois lados vêm vazios", () => {
    const diff = buildAuditDiff({ nome: "Fazenda Sul" }, { nome: "Fazenda Sul" });

    expect(diff).toEqual({ valorAnterior: {}, valorNovo: {} });
  });

  test("Date com o mesmo instante em instâncias diferentes não aparece como alterado", () => {
    const diff = buildAuditDiff(
      { dataInicio: new Date("2026-01-01T00:00:00.000Z") },
      { dataInicio: new Date("2026-01-01T00:00:00.000Z") },
    );

    expect(diff).toEqual({ valorAnterior: {}, valorNovo: {} });
  });

  test("Date que realmente muda aparece no diff como string ISO", () => {
    const diff = buildAuditDiff(
      { dataFim: new Date("2026-06-30T00:00:00.000Z") },
      { dataFim: new Date("2026-07-01T00:00:00.000Z") },
    );

    expect(diff).toEqual({
      valorAnterior: { dataFim: "2026-06-30T00:00:00.000Z" },
      valorNovo: { dataFim: "2026-07-01T00:00:00.000Z" },
    });
  });

  test("objeto tipo Decimal (toString próprio) com o mesmo valor não aparece como alterado", () => {
    class ValorDecimalFalso {
      constructor(private valor: string) {}
      toString() {
        return this.valor;
      }
    }

    const diff = buildAuditDiff(
      { saldoInicial: new ValorDecimalFalso("1000.5") },
      { saldoInicial: new ValorDecimalFalso("1000.5") },
    );

    expect(diff).toEqual({ valorAnterior: {}, valorNovo: {} });
  });

  test("objeto tipo Decimal que realmente muda aparece no diff como string", () => {
    class ValorDecimalFalso {
      constructor(private valor: string) {}
      toString() {
        return this.valor;
      }
    }

    const diff = buildAuditDiff(
      { saldoInicial: new ValorDecimalFalso("1000.5") },
      { saldoInicial: new ValorDecimalFalso("2000") },
    );

    expect(diff).toEqual({
      valorAnterior: { saldoInicial: "1000.5" },
      valorNovo: { saldoInicial: "2000" },
    });
  });
});
