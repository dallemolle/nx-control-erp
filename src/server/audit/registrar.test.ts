import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { registrarAuditoria } from "./registrar";

describe("registrarAuditoria", () => {
  let empresaId: string;

  beforeAll(async () => {
    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste Auditoria Ltda",
        nomeFantasia: "Teste Auditoria",
        cnpj: "11.111.111/0001-11",
      },
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { empresaId } });
    await prisma.empresa.delete({ where: { id: empresaId } });
    await prisma.$disconnect();
  });

  test("grava valorAnterior/valorNovo apenas com os campos alterados", async () => {
    await registrarAuditoria({
      empresaId,
      filialId: null,
      usuarioId: null,
      entidade: "CentroCusto",
      entidadeId: "cc-1",
      acao: "ATUALIZAR",
      anterior: { nome: "Fazenda Sul" },
      novo: { nome: "Fazenda Norte" },
    });

    const log = await prisma.auditLog.findFirst({
      where: { entidade: "CentroCusto", entidadeId: "cc-1" },
    });

    expect(log?.valorAnterior).toEqual({ nome: "Fazenda Sul" });
    expect(log?.valorNovo).toEqual({ nome: "Fazenda Norte" });
    expect(log?.acao).toBe("ATUALIZAR");
  });
});
