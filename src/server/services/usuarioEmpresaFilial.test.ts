import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { PermissionError } from "@/server/auth/permissions";
import { definirAcessoFilial, listarAcessosFiliaisDoUsuario } from "./usuarioEmpresaFilial";

describe("usuarioEmpresaFilial", () => {
  let empresaAId: string;
  let empresaBId: string;
  let filialEmpresaAId: string;
  let filialEmpresaBId: string;
  let usuarioId: string;
  let usuarioEmpresaAId: string;

  let sessaoAdministrador: SessaoAtiva;
  let sessaoFinanceiro: SessaoAtiva;

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);

    const empresaA = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste UEF Empresa A Ltda",
        nomeFantasia: "Teste UEF Empresa A",
        cnpj: `${randomSuffix}/0001-01`,
      },
    });
    empresaAId = empresaA.id;

    const empresaB = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste UEF Empresa B Ltda",
        nomeFantasia: "Teste UEF Empresa B",
        cnpj: `${randomSuffix}/0002-02`,
      },
    });
    empresaBId = empresaB.id;

    const filialEmpresaA = await prisma.filial.create({
      data: { nome: "Filial A", cnpj: `${randomSuffix}/0003-03`, empresaId: empresaAId },
    });
    filialEmpresaAId = filialEmpresaA.id;

    const filialEmpresaB = await prisma.filial.create({
      data: { nome: "Filial B", cnpj: `${randomSuffix}/0004-04`, empresaId: empresaBId },
    });
    filialEmpresaBId = filialEmpresaB.id;

    const usuario = await prisma.usuario.create({
      data: { nome: "Usuario UEF", email: `uef-${randomSuffix}@teste.local`, senhaHash: "x" },
    });
    usuarioId = usuario.id;

    const usuarioEmpresaA = await prisma.usuarioEmpresa.create({
      data: { usuarioId, empresaId: empresaAId, perfil: "ADMINISTRADOR" },
    });
    usuarioEmpresaAId = usuarioEmpresaA.id;

    sessaoAdministrador = {
      usuarioId,
      nome: "Usuario UEF",
      empresaId: empresaAId,
      perfil: "ADMINISTRADOR",
      filialId: filialEmpresaAId,
      podeAlterarFilial: true,
    };
    sessaoFinanceiro = { ...sessaoAdministrador, perfil: "FINANCEIRO" };
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { filialId: { in: [filialEmpresaAId, filialEmpresaBId] } },
    });
    await prisma.usuarioEmpresaFilial.deleteMany({
      where: { usuarioEmpresaId: usuarioEmpresaAId },
    });
    await prisma.usuarioEmpresa.delete({ where: { id: usuarioEmpresaAId } });
    await prisma.filial.deleteMany({ where: { empresaId: { in: [empresaAId, empresaBId] } } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.empresa.deleteMany({ where: { id: { in: [empresaAId, empresaBId] } } });
    await prisma.$disconnect();
  });

  test("definirAcessoFilial exige a permissão usuario:gerenciar", async () => {
    await expect(
      definirAcessoFilial(sessaoFinanceiro, usuarioId, filialEmpresaAId, {
        temAcesso: true,
        podeAlterar: false,
      }),
    ).rejects.toThrow(PermissionError);
  });

  test("definirAcessoFilial rejeita filialId de outra empresa (cross-tenant)", async () => {
    await expect(
      definirAcessoFilial(sessaoAdministrador, usuarioId, filialEmpresaBId, {
        temAcesso: true,
        podeAlterar: true,
      }),
    ).rejects.toThrow();

    const acesso = await prisma.usuarioEmpresaFilial.findUnique({
      where: {
        usuarioEmpresaId_filialId: {
          usuarioEmpresaId: usuarioEmpresaAId,
          filialId: filialEmpresaBId,
        },
      },
    });
    expect(acesso).toBeNull();
  });

  test("definirAcessoFilial cria e atualiza o vínculo da filial da própria empresa", async () => {
    const criado = await definirAcessoFilial(sessaoAdministrador, usuarioId, filialEmpresaAId, {
      temAcesso: true,
      podeAlterar: false,
    });
    expect(criado.ativo).toBe(true);
    expect(criado.podeAlterar).toBe(false);

    const atualizado = await definirAcessoFilial(sessaoAdministrador, usuarioId, filialEmpresaAId, {
      temAcesso: true,
      podeAlterar: true,
    });
    expect(atualizado.id).toBe(criado.id);
    expect(atualizado.podeAlterar).toBe(true);
  });

  test("listarAcessosFiliaisDoUsuario retorna as filiais ativas da empresa com o vínculo do usuário", async () => {
    const filiais = await listarAcessosFiliaisDoUsuario(sessaoAdministrador, usuarioId);

    expect(filiais.map((f) => f.id)).toContain(filialEmpresaAId);
    expect(filiais.map((f) => f.id)).not.toContain(filialEmpresaBId);

    const filialA = filiais.find((f) => f.id === filialEmpresaAId);
    expect(filialA?.usuariosFiliais[0]?.ativo).toBe(true);
  });
});
