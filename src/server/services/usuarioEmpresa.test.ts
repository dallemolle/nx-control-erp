import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { requireVinculoAtivo, AcessoNegadoError } from "./usuarioEmpresa";

describe("requireVinculoAtivo", () => {
  let empresaId: string;
  let usuarioComAcessoId: string;
  let usuarioInativoId: string;
  let usuarioSemVinculoId: string;

  beforeAll(async () => {
    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste Vinculo Ltda",
        nomeFantasia: "Teste Vinculo",
        cnpj: "22.222.222/0001-22",
      },
    });
    empresaId = empresa.id;

    const usuarioComAcesso = await prisma.usuario.create({
      data: { nome: "Com Acesso", email: "com-acesso@teste.local", senhaHash: "x" },
    });
    usuarioComAcessoId = usuarioComAcesso.id;
    await prisma.usuarioEmpresa.create({
      data: { usuarioId: usuarioComAcessoId, empresaId, perfil: "FINANCEIRO", ativo: true },
    });

    const usuarioInativo = await prisma.usuario.create({
      data: { nome: "Inativo", email: "inativo@teste.local", senhaHash: "x" },
    });
    usuarioInativoId = usuarioInativo.id;
    await prisma.usuarioEmpresa.create({
      data: { usuarioId: usuarioInativoId, empresaId, perfil: "FINANCEIRO", ativo: false },
    });

    const usuarioSemVinculo = await prisma.usuario.create({
      data: { nome: "Sem Vinculo", email: "sem-vinculo@teste.local", senhaHash: "x" },
    });
    usuarioSemVinculoId = usuarioSemVinculo.id;
  });

  afterAll(async () => {
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId } });
    await prisma.usuario.deleteMany({
      where: { id: { in: [usuarioComAcessoId, usuarioInativoId, usuarioSemVinculoId] } },
    });
    await prisma.empresa.delete({ where: { id: empresaId } });
    await prisma.$disconnect();
  });

  test("retorna o perfil quando o vínculo está ativo", async () => {
    const perfil = await requireVinculoAtivo(usuarioComAcessoId, empresaId);
    expect(perfil).toBe("FINANCEIRO");
  });

  test("nega acesso quando o vínculo existe mas está inativo", async () => {
    await expect(requireVinculoAtivo(usuarioInativoId, empresaId)).rejects.toThrow(
      AcessoNegadoError,
    );
  });

  test("nega acesso quando não existe vínculo com a empresa", async () => {
    await expect(requireVinculoAtivo(usuarioSemVinculoId, empresaId)).rejects.toThrow(
      AcessoNegadoError,
    );
  });
});
