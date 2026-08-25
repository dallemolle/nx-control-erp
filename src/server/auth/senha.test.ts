import { describe, expect, test } from "vitest";
import { hashSenha, verificarSenha } from "./senha";

describe("senha", () => {
  test("verificarSenha retorna true para a senha correta", async () => {
    const hash = await hashSenha("minhaSenhaForte123");
    await expect(verificarSenha("minhaSenhaForte123", hash)).resolves.toBe(true);
  });

  test("verificarSenha retorna false para senha incorreta", async () => {
    const hash = await hashSenha("minhaSenhaForte123");
    await expect(verificarSenha("senhaErrada", hash)).resolves.toBe(false);
  });

  test("hashSenha nunca retorna a senha em texto claro", async () => {
    const hash = await hashSenha("minhaSenhaForte123");
    expect(hash).not.toBe("minhaSenhaForte123");
  });
});
