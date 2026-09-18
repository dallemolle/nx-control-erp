import { afterEach, describe, expect, test, vi } from "vitest";

describe("lerConteudoMarkdown", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:fs");
  });

  test("lê o conteúdo do arquivo quando ele existe", async () => {
    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(() => "# Título\n\nConteúdo."),
    }));

    const { lerConteudoMarkdown } = await import("./conteudoMarkdown");
    expect(lerConteudoMarkdown("CHANGELOG.md")).toBe("# Título\n\nConteúdo.");
  });

  test("devolve null quando o arquivo não existe", async () => {
    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(() => {
        throw new Error("ENOENT: no such file");
      }),
    }));

    const { lerConteudoMarkdown } = await import("./conteudoMarkdown");
    expect(lerConteudoMarkdown("CHANGELOG.md")).toBeNull();
  });
});
