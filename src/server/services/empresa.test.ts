import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { criarEmpresa } from "./empresa";
import { listarFiliaisAcessiveis } from "./usuarioEmpresaFilial";

describe("criarEmpresa", () => {
  let usuarioId: string;
  let novaEmpresaId: string | undefined;
  let sessao: SessaoAtiva;

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);

    const usuario = await prisma.usuario.create({
      data: { nome: "Fundador", email: `fundador-${randomSuffix}@teste.local`, senhaHash: "x" },
    });
    usuarioId = usuario.id;

    sessao = {
      usuarioId,
      nome: "Fundador",
      empresaId: "n/a",
      perfil: "ADMINISTRADOR",
      filialId: "n/a",
      podeAlterarFilial: true,
    };
  });

  afterAll(async () => {
    if (novaEmpresaId) {
      await prisma.usuarioEmpresaFilial.deleteMany({
        where: { usuarioEmpresa: { empresaId: novaEmpresaId } },
      });
      await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: novaEmpresaId } });
      await prisma.filial.deleteMany({ where: { empresaId: novaEmpresaId } });
      await prisma.auditLog.deleteMany({ where: { empresaId: novaEmpresaId } });
      await prisma.empresa.delete({ where: { id: novaEmpresaId } });
    }
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.$disconnect();
  });

  test("cria a Filial Matriz e o vínculo do fundador com acesso de alteração", async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const empresa = await criarEmpresa(sessao, {
      razaoSocial: "Nova Empresa Ltda",
      nomeFantasia: "Nova Empresa",
      cnpj: `${randomSuffix}/0001-01`,
      moedaPadrao: "BRL",
    });
    novaEmpresaId = empresa.id;

    const filiais = await listarFiliaisAcessiveis(usuarioId, empresa.id);

    expect(filiais).toHaveLength(1);
    expect(filiais[0]?.filial.nome).toBe("Matriz");
    expect(filiais[0]?.podeAlterar).toBe(true);
  });
});
