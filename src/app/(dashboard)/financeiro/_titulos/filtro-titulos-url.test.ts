import { describe, expect, test } from "vitest";
import { filtroTitulosDaUrl, algumFiltroAtivo, queryStringDosFiltros } from "./filtro-titulos-url";

describe("filtroTitulosDaUrl", () => {
  test("nenhum param presente devolve filtro totalmente vazio", () => {
    const filtro = filtroTitulosDaUrl(() => undefined);
    expect(filtro).toEqual({
      categoriaId: undefined,
      contraparteId: undefined,
      centroCustoId: undefined,
      centroLucroId: undefined,
      safraId: undefined,
      projetoId: undefined,
      status: undefined,
      vencimentoDe: undefined,
      vencimentoAte: undefined,
    });
  });

  test("parseia valores válidos de cada dimensão", () => {
    const valores: Record<string, string> = {
      categoria: "cat-1",
      contraparte: "forn-1",
      centroCusto: "cc-1",
      centroLucro: "cl-1",
      safra: "safra-1",
      projeto: "proj-1",
      status: "VENCIDO",
      vencimentoDe: "2026-01-01",
      vencimentoAte: "2026-01-31",
    };
    const filtro = filtroTitulosDaUrl((campo) => valores[campo]);
    expect(filtro.categoriaId).toBe("cat-1");
    expect(filtro.contraparteId).toBe("forn-1");
    expect(filtro.centroCustoId).toBe("cc-1");
    expect(filtro.centroLucroId).toBe("cl-1");
    expect(filtro.safraId).toBe("safra-1");
    expect(filtro.projetoId).toBe("proj-1");
    expect(filtro.status).toBe("VENCIDO");
    expect(filtro.vencimentoDe?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(filtro.vencimentoAte?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  test('sentinela "__nenhum__" vira undefined', () => {
    const filtro = filtroTitulosDaUrl((campo) => (campo === "categoria" ? "__nenhum__" : undefined));
    expect(filtro.categoriaId).toBeUndefined();
  });

  test("status inválido vira undefined (nunca lança erro)", () => {
    const filtro = filtroTitulosDaUrl((campo) => (campo === "status" ? "NAO_EXISTE" : undefined));
    expect(filtro.status).toBeUndefined();
  });

  test("data malformada vira undefined (nunca lança erro)", () => {
    const filtro = filtroTitulosDaUrl((campo) => (campo === "vencimentoDe" ? "31/01/2026" : undefined));
    expect(filtro.vencimentoDe).toBeUndefined();
  });
});

describe("algumFiltroAtivo", () => {
  test("false quando nenhum filtro está definido", () => {
    expect(algumFiltroAtivo({})).toBe(false);
  });

  test("true quando ao menos um filtro está definido", () => {
    expect(algumFiltroAtivo({ categoriaId: "cat-1" })).toBe(true);
  });
});

describe("queryStringDosFiltros", () => {
  test("vazia quando nenhum param está presente", () => {
    expect(queryStringDosFiltros(() => undefined)).toBe("");
  });

  test("inclui só os params presentes, url-encoded, na ordem de CAMPOS_FILTRO_TITULOS", () => {
    const valores: Record<string, string> = { categoria: "cat 1", status: "VENCIDO" };
    const query = queryStringDosFiltros((campo) => valores[campo]);
    expect(query).toBe("categoria=cat%201&status=VENCIDO");
  });

  test('omite params com sentinela "__nenhum__"', () => {
    const query = queryStringDosFiltros((campo) => (campo === "categoria" ? "__nenhum__" : undefined));
    expect(query).toBe("");
  });
});
