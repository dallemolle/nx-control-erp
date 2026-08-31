import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { PermissionError } from "@/server/auth/permissions";
import {
  definirAcessoFilial,
  listarAcessosFiliaisDoUsuario,
  requireVinculoFilialAtivo,
  listarFiliaisAcessiveis,
  AcessoFilialNegadoError,
} from "./usuarioEmpresaFilial";

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

  test("definirAcessoFilial normaliza podeAlterar para false quando temAcesso é revogado", async () => {
    // Estado anterior (do teste acima): ativo=true, podeAlterar=true.
    const revogado = await definirAcessoFilial(sessaoAdministrador, usuarioId, filialEmpresaAId, {
      temAcesso: false,
      podeAlterar: true,
    });

    expect(revogado.ativo).toBe(false);
    expect(revogado.podeAlterar).toBe(false);

    const persistido = await prisma.usuarioEmpresaFilial.findUniqueOrThrow({
      where: {
        usuarioEmpresaId_filialId: {
          usuarioEmpresaId: usuarioEmpresaAId,
          filialId: filialEmpresaAId,
        },
      },
    });
    expect(persistido.podeAlterar).toBe(false);
  });
});

describe("requireVinculoFilialAtivo", () => {
  let empresaXId: string;
  let empresaYId: string;
  let empresaZId: string;

  let filialAtivaPodeAlterarId: string;
  let filialAtivaSoLeituraId: string;
  let filialInativaId: string;
  let filialVinculoInativoId: string;
  let filialSemAcessoId: string;
  let filialYId: string;
  let filialZId: string;

  let usuarioId: string;
  let usuarioEmpresaXId: string;
  let usuarioEmpresaYId: string;
  let usuarioEmpresaZId: string;

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);

    const empresaX = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste RVFA Empresa X Ltda",
        nomeFantasia: "Teste RVFA Empresa X",
        cnpj: `${randomSuffix}/0011-11`,
      },
    });
    empresaXId = empresaX.id;

    const empresaY = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste RVFA Empresa Y Ltda",
        nomeFantasia: "Teste RVFA Empresa Y",
        cnpj: `${randomSuffix}/0012-12`,
      },
    });
    empresaYId = empresaY.id;

    const empresaZ = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste RVFA Empresa Z Ltda",
        nomeFantasia: "Teste RVFA Empresa Z",
        cnpj: `${randomSuffix}/0013-13`,
      },
    });
    empresaZId = empresaZ.id;

    const usuario = await prisma.usuario.create({
      data: { nome: "Usuario RVFA", email: `rvfa-${randomSuffix}@teste.local`, senhaHash: "x" },
    });
    usuarioId = usuario.id;

    const usuarioEmpresaX = await prisma.usuarioEmpresa.create({
      data: { usuarioId, empresaId: empresaXId, perfil: "ADMINISTRADOR", ativo: true },
    });
    usuarioEmpresaXId = usuarioEmpresaX.id;

    const usuarioEmpresaY = await prisma.usuarioEmpresa.create({
      data: { usuarioId, empresaId: empresaYId, perfil: "ADMINISTRADOR", ativo: true },
    });
    usuarioEmpresaYId = usuarioEmpresaY.id;

    const usuarioEmpresaZ = await prisma.usuarioEmpresa.create({
      data: { usuarioId, empresaId: empresaZId, perfil: "ADMINISTRADOR", ativo: false },
    });
    usuarioEmpresaZId = usuarioEmpresaZ.id;

    const filialAtivaPodeAlterar = await prisma.filial.create({
      data: { nome: "X Ativa Alteração", cnpj: `${randomSuffix}/0014-14`, empresaId: empresaXId },
    });
    filialAtivaPodeAlterarId = filialAtivaPodeAlterar.id;
    await prisma.usuarioEmpresaFilial.create({
      data: {
        usuarioEmpresaId: usuarioEmpresaXId,
        filialId: filialAtivaPodeAlterarId,
        ativo: true,
        podeAlterar: true,
      },
    });

    const filialAtivaSoLeitura = await prisma.filial.create({
      data: { nome: "X Ativa Leitura", cnpj: `${randomSuffix}/0015-15`, empresaId: empresaXId },
    });
    filialAtivaSoLeituraId = filialAtivaSoLeitura.id;
    await prisma.usuarioEmpresaFilial.create({
      data: {
        usuarioEmpresaId: usuarioEmpresaXId,
        filialId: filialAtivaSoLeituraId,
        ativo: true,
        podeAlterar: false,
      },
    });

    const filialInativa = await prisma.filial.create({
      data: {
        nome: "X Inativa",
        cnpj: `${randomSuffix}/0016-16`,
        empresaId: empresaXId,
        ativo: false,
      },
    });
    filialInativaId = filialInativa.id;
    await prisma.usuarioEmpresaFilial.create({
      data: {
        usuarioEmpresaId: usuarioEmpresaXId,
        filialId: filialInativaId,
        ativo: true,
        podeAlterar: true,
      },
    });

    const filialVinculoInativo = await prisma.filial.create({
      data: { nome: "X Vínculo Inativo", cnpj: `${randomSuffix}/0017-17`, empresaId: empresaXId },
    });
    filialVinculoInativoId = filialVinculoInativo.id;
    await prisma.usuarioEmpresaFilial.create({
      data: {
        usuarioEmpresaId: usuarioEmpresaXId,
        filialId: filialVinculoInativoId,
        ativo: false,
        podeAlterar: true,
      },
    });

    const filialSemAcesso = await prisma.filial.create({
      data: { nome: "X Sem Acesso", cnpj: `${randomSuffix}/0018-18`, empresaId: empresaXId },
    });
    filialSemAcessoId = filialSemAcesso.id;

    const filialY = await prisma.filial.create({
      data: { nome: "Y Filial", cnpj: `${randomSuffix}/0019-19`, empresaId: empresaYId },
    });
    filialYId = filialY.id;
    await prisma.usuarioEmpresaFilial.create({
      data: { usuarioEmpresaId: usuarioEmpresaYId, filialId: filialYId, ativo: true, podeAlterar: true },
    });

    const filialZ = await prisma.filial.create({
      data: { nome: "Z Filial", cnpj: `${randomSuffix}/0020-20`, empresaId: empresaZId },
    });
    filialZId = filialZ.id;
    await prisma.usuarioEmpresaFilial.create({
      data: { usuarioEmpresaId: usuarioEmpresaZId, filialId: filialZId, ativo: true, podeAlterar: true },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { empresaId: { in: [empresaXId, empresaYId, empresaZId] } },
    });
    await prisma.usuarioEmpresaFilial.deleteMany({
      where: { usuarioEmpresaId: { in: [usuarioEmpresaXId, usuarioEmpresaYId, usuarioEmpresaZId] } },
    });
    await prisma.usuarioEmpresa.deleteMany({
      where: { id: { in: [usuarioEmpresaXId, usuarioEmpresaYId, usuarioEmpresaZId] } },
    });
    await prisma.filial.deleteMany({
      where: { empresaId: { in: [empresaXId, empresaYId, empresaZId] } },
    });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.empresa.deleteMany({ where: { id: { in: [empresaXId, empresaYId, empresaZId] } } });
    await prisma.$disconnect();
  });

  test("retorna podeAlterar=true num vínculo válido e ativo com alteração liberada", async () => {
    const resultado = await requireVinculoFilialAtivo(usuarioId, empresaXId, filialAtivaPodeAlterarId);
    expect(resultado.podeAlterar).toBe(true);
  });

  test("retorna podeAlterar=false num vínculo válido e ativo só de leitura", async () => {
    const resultado = await requireVinculoFilialAtivo(usuarioId, empresaXId, filialAtivaSoLeituraId);
    expect(resultado.podeAlterar).toBe(false);
  });

  test("rejeita quando a Filial em si está inativa", async () => {
    await expect(
      requireVinculoFilialAtivo(usuarioId, empresaXId, filialInativaId),
    ).rejects.toThrow(AcessoFilialNegadoError);
  });

  test("rejeita quando o vínculo UsuarioEmpresaFilial está inativo", async () => {
    await expect(
      requireVinculoFilialAtivo(usuarioId, empresaXId, filialVinculoInativoId),
    ).rejects.toThrow(AcessoFilialNegadoError);
  });

  test("rejeita quando o UsuarioEmpresa que liga o usuário à empresa está inativo", async () => {
    await expect(requireVinculoFilialAtivo(usuarioId, empresaZId, filialZId)).rejects.toThrow(
      AcessoFilialNegadoError,
    );
  });

  test("rejeita quando não existe nenhum vínculo para a filial", async () => {
    await expect(
      requireVinculoFilialAtivo(usuarioId, empresaXId, filialSemAcessoId),
    ).rejects.toThrow(AcessoFilialNegadoError);
  });

  test("rejeita quando a filial pertence a uma empresa diferente da informada", async () => {
    // filialY pertence à empresaY; o usuário tem acesso legítimo a ela via
    // usuarioEmpresaY, mas aqui é chamado informando empresaX.
    await expect(requireVinculoFilialAtivo(usuarioId, empresaXId, filialYId)).rejects.toThrow(
      AcessoFilialNegadoError,
    );
  });

  test("listarFiliaisAcessiveis exclui filiais de uma empresa diferente da consultada", async () => {
    const filiais = await listarFiliaisAcessiveis(usuarioId, empresaXId);
    const ids = filiais.map((f) => f.filial.id);

    expect(ids).toContain(filialAtivaPodeAlterarId);
    expect(ids).toContain(filialAtivaSoLeituraId);
    expect(ids).not.toContain(filialYId);
    expect(ids).not.toContain(filialZId);
    expect(ids).not.toContain(filialInativaId);
    expect(ids).not.toContain(filialVinculoInativoId);
    expect(ids).not.toContain(filialSemAcessoId);
  });
});
