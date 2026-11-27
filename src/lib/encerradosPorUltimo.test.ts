import { describe, expect, test } from "vitest";
import { encerradosPorUltimo } from "./encerradosPorUltimo";

describe("encerradosPorUltimo", () => {
  test("encerrados vão para o fim, marcados; os outros ficam na ordem de entrada", () => {
    const lista = [
      { id: "a", nome: "2024/25", status: "ENCERRADO" },
      { id: "b", nome: "2025/26", status: "EM_ANDAMENTO" },
      { id: "c", nome: "2026/27", status: "PLANEJADO" },
    ];
    expect(encerradosPorUltimo(lista, "encerrada").map((s) => s.nome)).toEqual([
      "2025/26",
      "2026/27",
      "2024/25 (encerrada)",
    ]);
    expect(lista[0].nome).toBe("2024/25");
  });
});
