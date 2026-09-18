import { afterEach, describe, expect, test, vi } from "vitest";

describe("obterVersaoInfo", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:fs");
  });

  test("lê e faz parse do versao.json gerado no build", async () => {
    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(() =>
        JSON.stringify({ versao: "1.2.3", commitSha: "abc1234", dataUltimaAlteracao: "2026-09-18T10:00:00-03:00" }),
      ),
    }));

    const { obterVersaoInfo } = await import("./versao");
    expect(obterVersaoInfo()).toEqual({
      versao: "1.2.3",
      commitSha: "abc1234",
      dataUltimaAlteracao: "2026-09-18T10:00:00-03:00",
    });
  });

  test("devolve fallback quando o arquivo não existe", async () => {
    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(() => {
        throw new Error("ENOENT: no such file");
      }),
    }));

    const { obterVersaoInfo } = await import("./versao");
    expect(obterVersaoInfo()).toEqual({
      versao: "dev",
      commitSha: "desconhecido",
      dataUltimaAlteracao: null,
    });
  });
});
