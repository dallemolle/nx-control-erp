import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { FilialSomenteLeituraError } from "@/server/auth/permissions";
import { CicloHierarquiaError } from "@/server/services/hierarquia";
import {
  atualizarCentroCusto,
  criarCentroCusto,
  definirAtivoCentroCusto,
  listarCentrosCusto,
} from "./centroCusto";

describe("centroCusto (filial-scoped)", () => {
  let empresaId: string;
  let filialAId: string;
  let filialBId: string;
  let usuarioId: string;

  let sessaoFilialA: SessaoAtiva;
  let sessaoFilialB: SessaoAtiva;
  let sessaoFilialASomenteLeitura: SessaoAtiva;

  beforeAll(async () => {
    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial: "Teste Centro Custo Ltda",
        nomeFantasia: "Teste Centro Custo",
        cnpj: "33.333.333/0001-33",
      },
    });
    empresaId = empresa.id;

    const filialA = await prisma.filial.create({
      data: { empresaId, nome: "Filial A", cnpj: "33.333.333/0001-44" },
    });
    filialAId = filialA.id;

    const filialB = await prisma.filial.create({
      data: { empresaId, nome: "Filial B", cnpj: "33.333.333/0001-55" },
    });
    filialBId = filialB.id;

    const usuario = await prisma.usuario.create({
      data: { nome: "Usuario Centro Custo", email: "centro-custo@teste.local", senhaHash: "x" },
    });
    usuarioId = usuario.id;

    const usuarioEmpresa = await prisma.usuarioEmpresa.create({
      data: { usuarioId, empresaId, perfil: "FINANCEIRO", ativo: true },
    });

    await prisma.usuarioEmpresaFilial.create({
      data: { usuarioEmpresaId: usuarioEmpresa.id, filialId: filialAId, podeAlterar: true, ativo: true },
    });
    await prisma.usuarioEmpresaFilial.create({
      data: { usuarioEmpresaId: usuarioEmpresa.id, filialId: filialBId, podeAlterar: true, ativo: true },
    });

    sessaoFilialA = {
      usuarioId,
      nome: "Usuario Centro Custo",
      empresaId,
      perfil: "FINANCEIRO",
      filialId: filialAId,
      podeAlterarFilial: true,
    };
    sessaoFilialB = {
      usuarioId,
      nome: "Usuario Centro Custo",
      empresaId,
      perfil: "FINANCEIRO",
      filialId: filialBId,
      podeAlterarFilial: true,
    };
    sessaoFilialASomenteLeitura = { ...sessaoFilialA, podeAlterarFilial: false };
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { filialId: { in: [filialAId, filialBId] } } });
    await prisma.centroCusto.deleteMany({ where: { filialId: { in: [filialAId, filialBId] } } });
    await prisma.usuarioEmpresaFilial.deleteMany({
      where: { filialId: { in: [filialAId, filialBId] } },
    });
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.filial.deleteMany({ where: { empresaId } });
    await prisma.empresa.delete({ where: { id: empresaId } });
    await prisma.$disconnect();
  });

  test("permite o mesmo código em filiais diferentes da mesma empresa (@@unique([filialId, codigo]))", async () => {
    const centroA = await criarCentroCusto(sessaoFilialA, { nome: "Administrativo", codigo: "ADM" });
    const centroB = await criarCentroCusto(sessaoFilialB, { nome: "Administrativo B", codigo: "ADM" });

    expect(centroA.filialId).toBe(filialAId);
    expect(centroB.filialId).toBe(filialBId);
    expect(centroA.codigo).toBe("ADM");
    expect(centroB.codigo).toBe("ADM");

    const centrosFilialA = await listarCentrosCusto(filialAId);
    const centrosFilialB = await listarCentrosCusto(filialBId);
    expect(centrosFilialA.map((c) => c.id)).toContain(centroA.id);
    expect(centrosFilialA.map((c) => c.id)).not.toContain(centroB.id);
    expect(centrosFilialB.map((c) => c.id)).toContain(centroB.id);
    expect(centrosFilialB.map((c) => c.id)).not.toContain(centroA.id);
  });

  test("rejeita parentId de uma filial irmã da mesma empresa", async () => {
    const paiNaFilialA = await criarCentroCusto(sessaoFilialA, {
      nome: "Pai Filial A",
      codigo: "PAI-A",
    });

    await expect(
      criarCentroCusto(sessaoFilialB, {
        nome: "Filho Inválido",
        codigo: "FILHO-B",
        parentId: paiNaFilialA.id,
      }),
    ).rejects.toThrow("Centro de custo pai inválido");
  });

  test("bloqueia criação quando perfil permite escrita mas a filial está em modo somente leitura", async () => {
    await expect(
      criarCentroCusto(sessaoFilialASomenteLeitura, { nome: "Bloqueado", codigo: "BLOQ-1" }),
    ).rejects.toThrow(FilialSomenteLeituraError);
  });

  test("bloqueia atualização quando a filial está em modo somente leitura", async () => {
    const centro = await criarCentroCusto(sessaoFilialA, { nome: "Editável", codigo: "EDIT-1" });

    await expect(
      atualizarCentroCusto(sessaoFilialASomenteLeitura, centro.id, {
        nome: "Editado",
        codigo: "EDIT-1",
      }),
    ).rejects.toThrow(FilialSomenteLeituraError);
  });

  test("bloqueia toggle de ativo quando a filial está em modo somente leitura", async () => {
    const centro = await criarCentroCusto(sessaoFilialA, { nome: "Toggle", codigo: "TOG-1" });

    await expect(
      definirAtivoCentroCusto(sessaoFilialASomenteLeitura, centro.id, false),
    ).rejects.toThrow(FilialSomenteLeituraError);
  });

  test("assertSemCiclo continua bloqueando ciclos dentro de uma filial", async () => {
    const pai = await criarCentroCusto(sessaoFilialA, { nome: "Ciclo Pai", codigo: "CICLO-PAI" });
    const filho = await criarCentroCusto(sessaoFilialA, {
      nome: "Ciclo Filho",
      codigo: "CICLO-FILHO",
      parentId: pai.id,
    });

    await expect(
      atualizarCentroCusto(sessaoFilialA, pai.id, {
        nome: pai.nome,
        codigo: pai.codigo,
        parentId: filho.id,
      }),
    ).rejects.toThrow(CicloHierarquiaError);
  });
});
