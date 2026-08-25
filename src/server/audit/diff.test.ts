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
});
