import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { PermissionError } from "@/server/auth/permissions";
import { buscarUsuarioPorEmail, criarUsuarioEVincular } from "./usuario";

describe("usuario", () => {
  let empresaId: string;
  let filialId: string;
  let usuarioExistenteId: string;
  const emailUsuarioExistente = `existente-${Math.random().toString(36).slice(2, 10)}@teste.local`;

  let sessaoAdministrador: SessaoAtiva;
  let sessaoFinanceiro: SessaoAtiva;

  const usuariosCriadosIds: string[] = [];
  const empresasCriadasIds: string[] = [];

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);

    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste Usuario Ltda",
        nomeFantasia: "Teste Usuario",
        cnpj: `${randomSuffix}/0001-01`,
      },
    });
    empresaId = empresa.id;
    empresasCriadasIds.push(empresaId);

    const filial = await prisma.filial.create({
      data: { nome: "Filial Teste Usuario", cnpj: `${randomSuffix}/0002-02`, empresaId },
    });
    filialId = filial.id;

    const usuarioAdmin = await prisma.usuario.create({
      data: { nome: "Admin Usuario Teste", email: `admin-${randomSuffix}@teste.local`, senhaHash: "x" },
    });
    usuariosCriadosIds.push(usuarioAdmin.id);

    await prisma.usuarioEmpresa.create({
      data: { usuarioId: usuarioAdmin.id, empresaId, perfil: "ADMINISTRADOR" },
    });

    sessaoAdministrador = {
      usuarioId: usuarioAdmin.id,
      nome: usuarioAdmin.nome,
      empresaId,
      perfil: "ADMINISTRADOR",
      filialId,
      podeAlterarFilial: true,
    };
    sessaoFinanceiro = { ...sessaoAdministrador, perfil: "FINANCEIRO" };

    const usuarioExistente = await prisma.usuario.create({
      data: { nome: "Pessoa Existente", email: emailUsuarioExistente, senhaHash: "x" },
    });
    usuarioExistenteId = usuarioExistente.id;
    usuariosCriadosIds.push(usuarioExistenteId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { empresaId: { in: empresasCriadasIds } } });
    await prisma.usuarioEmpresaFilial.deleteMany({
      where: { usuarioEmpresa: { empresaId: { in: empresasCriadasIds } } },
    });
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: { in: empresasCriadasIds } } });
    await prisma.filial.deleteMany({ where: { empresaId: { in: empresasCriadasIds } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuariosCriadosIds } } });
    await prisma.empresa.deleteMany({ where: { id: { in: empresasCriadasIds } } });
    await prisma.$disconnect();
  });

  describe("buscarUsuarioPorEmail", () => {
    test("exige a permissão usuario:gerenciar", async () => {
      await expect(
        buscarUsuarioPorEmail(sessaoFinanceiro, emailUsuarioExistente),
      ).rejects.toThrow(PermissionError);
    });

    test("retorna null quando nenhum usuário tem esse email", async () => {
      const resultado = await buscarUsuarioPorEmail(sessaoAdministrador, "ninguem-com-este-email@teste.local");
      expect(resultado).toBeNull();
    });

    test("retorna id e nome quando o email já existe, sem expor mais dados", async () => {
      const resultado = await buscarUsuarioPorEmail(sessaoAdministrador, emailUsuarioExistente);
      expect(resultado).toEqual({ id: usuarioExistenteId, nome: "Pessoa Existente" });
    });
  });

  describe("criarUsuarioEVincular", () => {
    test("cria usuário novo e vínculo quando o email não existe, sem conceder acesso à filial se não pedido", async () => {
      const email = `novo-${Math.random().toString(36).slice(2, 10)}@teste.local`;

      const resultado = await criarUsuarioEVincular(sessaoAdministrador, {
        nome: "Pessoa Nova",
        email,
        senha: "senha12345",
        perfil: "CONSULTA",
        concederAcessoFilialAtiva: false,
        podeAlterarFilialAtiva: false,
      });
      usuariosCriadosIds.push(resultado.usuario.id);

      expect(resultado.usuario.email).toBe(email);
      expect(resultado.vinculo.perfil).toBe("CONSULTA");

      const acesso = await prisma.usuarioEmpresaFilial.findUnique({
        where: { usuarioEmpresaId_filialId: { usuarioEmpresaId: resultado.vinculo.id, filialId } },
      });
      expect(acesso).toBeNull();
    });

    test("recusa criar usuário novo sem nome ou senha", async () => {
      const email = `sememsemsenha-${Math.random().toString(36).slice(2, 10)}@teste.local`;

      await expect(
        criarUsuarioEVincular(sessaoAdministrador, {
          email,
          perfil: "CONSULTA",
          concederAcessoFilialAtiva: false,
          podeAlterarFilialAtiva: false,
        }),
      ).rejects.toThrow();
    });

    test("concede acesso de leitura à filial ativa quando concederAcessoFilialAtiva é true", async () => {
      const email = `comfilial-${Math.random().toString(36).slice(2, 10)}@teste.local`;

      const resultado = await criarUsuarioEVincular(sessaoAdministrador, {
        nome: "Pessoa Com Filial",
        email,
        senha: "senha12345",
        perfil: "CONSULTA",
        concederAcessoFilialAtiva: true,
        podeAlterarFilialAtiva: false,
      });
      usuariosCriadosIds.push(resultado.usuario.id);

      const acesso = await prisma.usuarioEmpresaFilial.findUniqueOrThrow({
        where: { usuarioEmpresaId_filialId: { usuarioEmpresaId: resultado.vinculo.id, filialId } },
      });
      expect(acesso.ativo).toBe(true);
      expect(acesso.podeAlterar).toBe(false);
    });

    test("concede acesso de alteração à filial ativa quando podeAlterarFilialAtiva também é true", async () => {
      const email = `comalteracao-${Math.random().toString(36).slice(2, 10)}@teste.local`;

      const resultado = await criarUsuarioEVincular(sessaoAdministrador, {
        nome: "Pessoa Com Alteração",
        email,
        senha: "senha12345",
        perfil: "FINANCEIRO",
        concederAcessoFilialAtiva: true,
        podeAlterarFilialAtiva: true,
      });
      usuariosCriadosIds.push(resultado.usuario.id);

      const acesso = await prisma.usuarioEmpresaFilial.findUniqueOrThrow({
        where: { usuarioEmpresaId_filialId: { usuarioEmpresaId: resultado.vinculo.id, filialId } },
      });
      expect(acesso.podeAlterar).toBe(true);
    });

    test("reaproveita usuário já existente (encontrado por email) sem exigir nome ou senha", async () => {
      const resultado = await criarUsuarioEVincular(sessaoAdministrador, {
        email: emailUsuarioExistente,
        perfil: "AUDITOR",
        concederAcessoFilialAtiva: true,
        podeAlterarFilialAtiva: false,
      });

      expect(resultado.usuario.id).toBe(usuarioExistenteId);
      expect(resultado.vinculo.perfil).toBe("AUDITOR");

      const acesso = await prisma.usuarioEmpresaFilial.findUniqueOrThrow({
        where: { usuarioEmpresaId_filialId: { usuarioEmpresaId: resultado.vinculo.id, filialId } },
      });
      expect(acesso.ativo).toBe(true);
    });

    test("recusa quando o usuário já tem vínculo com esta empresa", async () => {
      await expect(
        criarUsuarioEVincular(sessaoAdministrador, {
          email: emailUsuarioExistente,
          perfil: "CONSULTA",
          concederAcessoFilialAtiva: false,
          podeAlterarFilialAtiva: false,
        }),
      ).rejects.toThrow("Este usuário já tem acesso a esta empresa");
    });
  });
});
