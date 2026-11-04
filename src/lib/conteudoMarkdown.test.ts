import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { lerConteudoMarkdown } from "./conteudoMarkdown";

// vi.mock é içado para antes dos imports — sem import dinâmico por teste, que
// estourava o timeout sob a carga da suíte completa (mesma correção de versao.test.ts).
vi.mock("node:fs", () => ({ readFileSync: vi.fn() }));

describe("lerConteudoMarkdown", () => {
  beforeEach(() => {
    vi.mocked(readFileSync).mockReset();
  });

  test("lê o conteúdo do arquivo quando ele existe", () => {
    vi.mocked(readFileSync).mockReturnValue("# Título\n\nConteúdo.");
    expect(lerConteudoMarkdown("CHANGELOG.md")).toBe("# Título\n\nConteúdo.");
  });

  test("devolve null quando o arquivo não existe", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });
    expect(lerConteudoMarkdown("CHANGELOG.md")).toBeNull();
  });
});
