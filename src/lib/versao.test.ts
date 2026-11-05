import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { obterVersaoInfo } from "./versao";

// vi.mock é içado para antes dos imports: o módulo testado já nasce com o fs
// falso, sem precisar de import dinâmico por teste (que estourava o timeout
// sob a carga da suíte completa).
vi.mock("node:fs", () => ({ readFileSync: vi.fn() }));

describe("obterVersaoInfo", () => {
  beforeEach(() => {
    vi.mocked(readFileSync).mockReset();
  });

  test("lê e faz parse do versao.json gerado no build", () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ versao: "1.2.3", commitSha: "abc1234", dataUltimaAlteracao: "2026-09-18T10:00:00-03:00" }),
    );

    expect(obterVersaoInfo()).toEqual({
      versao: "1.2.3",
      commitSha: "abc1234",
      dataUltimaAlteracao: "2026-09-18T10:00:00-03:00",
    });
  });

  test("devolve fallback quando o arquivo não existe", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });

    expect(obterVersaoInfo()).toEqual({
      versao: "dev",
      commitSha: "desconhecido",
      dataUltimaAlteracao: null,
    });
  });
});
