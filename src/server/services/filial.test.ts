import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { PermissionError } from "@/server/auth/permissions";
import { criarFilial, listarFiliais } from "./filial";

describe("filial", () => {
  let empresaAId: string;
  let empresaBId: string;
  let filialEmpresaAId: string;
  let filialEmpresaBId: string;
  let usuarioId: string;

  let sessaoAdministrador: SessaoAtiva;
  let sessaoFinanceiro: SessaoAtiva;

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);

    const empresaA = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste Filial Empresa A Ltda",
        nomeFantasia: "Teste Filial Empresa A",
        cnpj: `${randomSuffix}/0001-01`,
      },
    });
    empresaAId = empresaA.id;

    const empresaB = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste Filial Empresa B Ltda",
        nomeFantasia: "Teste Filial Empresa B",
        cnpj: `${randomSuffix}/0002-02`,
      },
    });
    empresaBId = empresaB.id;

    const usuario = await prisma.usuario.create({
      data: { nome: "Usuario Filial", email: `filial-${randomSuffix}@teste.local`, senhaHash: "x" },
    });
    usuarioId = usuario.id;

    sessaoAdministrador = {
      usuarioId,
      nome: "Usuario Filial",
      empresaId: empresaAId,
      perfil: "ADMINISTRADOR",
      filialId: "",
      podeAlterarFilial: true,
    };
    sessaoFinanceiro = { ...sessaoAdministrador, perfil: "FINANCEIRO" };

    const filialEmpresaA = await criarFilial(sessaoAdministrador, {
      nome: "Filial Empresa A",
      cnpj: `${randomSuffix}/0003-03`,
    });
    filialEmpresaAId = filialEmpresaA.id;

    const filialEmpresaB = await criarFilial({ ...sessaoAdministrador, empresaId: empresaBId }, {
      nome: "Filial Empresa B",
      cnpj: `${randomSuffix}/0004-04`,
    });
    filialEmpresaBId = filialEmpresaB.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { filialId: { in: [filialEmpresaAId, filialEmpresaBId] } },
    });
    await prisma.filial.deleteMany({ where: { empresaId: { in: [empresaAId, empresaBId] } } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.empresa.deleteMany({ where: { id: { in: [empresaAId, empresaBId] } } });
    await prisma.$disconnect();
  });

  test("criarFilial exige a permissão filial:gerenciar", async () => {
    await expect(
      criarFilial(sessaoFinanceiro, { nome: "Sem permissão", cnpj: "99.999.999/0001-99" }),
    ).rejects.toThrow(PermissionError);
  });

  test("violação do cnpj único gera erro", async () => {
    await expect(
      criarFilial(sessaoAdministrador, {
        nome: "Filial Duplicada",
        cnpj: (await prisma.filial.findUniqueOrThrow({ where: { id: filialEmpresaAId } })).cnpj,
      }),
    ).rejects.toThrow();
  });

  test("listarFiliais só retorna filiais da empresaId passada", async () => {
    const filiaisEmpresaA = await listarFiliais(empresaAId);

    expect(filiaisEmpresaA.map((f) => f.id)).toContain(filialEmpresaAId);
    expect(filiaisEmpresaA.map((f) => f.id)).not.toContain(filialEmpresaBId);
  });
});
