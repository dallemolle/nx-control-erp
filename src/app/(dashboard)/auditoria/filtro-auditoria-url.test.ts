import { describe, expect, test } from "vitest";
import { filtroAuditoriaDaUrl, paginaDaUrl } from "./filtro-auditoria-url";

describe("filtroAuditoriaDaUrl", () => {
  test("nenhum param presente devolve filtro totalmente vazio", () => {
    const filtro = filtroAuditoriaDaUrl(() => undefined);
    expect(filtro).toEqual({
      entidade: undefined,
      acao: undefined,
      usuarioId: undefined,
      filialId: undefined,
      dataDe: undefined,
      dataAte: undefined,
    });
  });

  test("parseia valores válidos de cada dimensão", () => {
    const valores: Record<string, string> = {
      entidade: "Titulo",
      acao: "CRIAR",
      usuarioId: "usr-1",
      filialId: "fil-1",
      dataDe: "2026-01-01",
      dataAte: "2026-01-31",
    };
    const filtro = filtroAuditoriaDaUrl((campo) => valores[campo]);
    expect(filtro.entidade).toBe("Titulo");
    expect(filtro.acao).toBe("CRIAR");
    expect(filtro.usuarioId).toBe("usr-1");
    expect(filtro.filialId).toBe("fil-1");
    expect(filtro.dataDe?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(filtro.dataAte?.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  test('sentinela "__nenhum__" vira undefined', () => {
    const filtro = filtroAuditoriaDaUrl((campo) => (campo === "entidade" ? "__nenhum__" : undefined));
    expect(filtro.entidade).toBeUndefined();
  });

  test("data malformada ou com roll-over de calendário vira undefined (nunca lança erro)", () => {
    const malformada = filtroAuditoriaDaUrl((campo) => (campo === "dataDe" ? "31/01/2026" : undefined));
    expect(malformada.dataDe).toBeUndefined();

    const rollover = filtroAuditoriaDaUrl((campo) => (campo === "dataAte" ? "2026-02-30" : undefined));
    expect(rollover.dataAte).toBeUndefined();
  });
});

describe("paginaDaUrl", () => {
  test("ausente devolve 1", () => {
    expect(paginaDaUrl(() => undefined)).toBe(1);
  });

  test('"0", negativo ou não-numérico devolvem 1', () => {
    expect(paginaDaUrl((campo) => (campo === "pagina" ? "0" : undefined))).toBe(1);
    expect(paginaDaUrl((campo) => (campo === "pagina" ? "-3" : undefined))).toBe(1);
    expect(paginaDaUrl((campo) => (campo === "pagina" ? "abc" : undefined))).toBe(1);
  });

  test("valor válido devolve o número", () => {
    expect(paginaDaUrl((campo) => (campo === "pagina" ? "5" : undefined))).toBe(5);
  });
});
