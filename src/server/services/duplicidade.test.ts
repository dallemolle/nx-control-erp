import { describe, expect, test } from "vitest";
import { Prisma } from "@prisma/client";
import { comMensagemDeDuplicidade, DuplicidadeError } from "./duplicidade";

describe("comMensagemDeDuplicidade", () => {
  test("P2002 vira DuplicidadeError com a mensagem", async () => {
    const erroP2002 = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" });
    const promessa = comMensagemDeDuplicidade(() => Promise.reject(erroP2002), "Já existe uma fruta com este nome");
    await expect(promessa).rejects.toBeInstanceOf(DuplicidadeError);
    await expect(promessa).rejects.toThrow("Já existe uma fruta com este nome");
  });

  test("outros erros passam sem mudança", async () => {
    const outro = new Error("falhou");
    await expect(comMensagemDeDuplicidade(() => Promise.reject(outro), "x")).rejects.toBe(outro);
  });

  test("sucesso devolve o resultado", async () => {
    await expect(comMensagemDeDuplicidade(() => Promise.resolve(42), "x")).resolves.toBe(42);
  });
});
