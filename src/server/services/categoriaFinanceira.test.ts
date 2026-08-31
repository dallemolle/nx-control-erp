import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { FilialSomenteLeituraError } from "@/server/auth/permissions";
import { CicloHierarquiaError } from "@/server/services/hierarquia";
import {
  atualizarCategoriaFinanceira,
  criarCategoriaFinanceira,
  definirAtivoCategoriaFinanceira,
} from "./categoriaFinanceira";

describe("categoriaFinanceira (filial-scoped)", () => {
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
        razaoSocial: "Teste Categoria Financeira Ltda",
        nomeFantasia: "Teste Categoria Financeira",
        cnpj: "44.444.444/0001-44",
      },
    });
    empresaId = empresa.id;

    const filialA = await prisma.filial.create({
      data: { empresaId, nome: "Filial A", cnpj: "44.444.444/0001-55" },
    });
    filialAId = filialA.id;

    const filialB = await prisma.filial.create({
      data: { empresaId, nome: "Filial B", cnpj: "44.444.444/0001-66" },
    });
    filialBId = filialB.id;

    const usuario = await prisma.usuario.create({
      data: {
        nome: "Usuario Categoria Financeira",
        email: "categoria-financeira@teste.local",
        senhaHash: "x",
      },
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
      nome: "Usuario Categoria Financeira",
      empresaId,
      perfil: "FINANCEIRO",
      filialId: filialAId,
      podeAlterarFilial: true,
    };
    sessaoFilialB = {
      usuarioId,
      nome: "Usuario Categoria Financeira",
      empresaId,
      perfil: "FINANCEIRO",
      filialId: filialBId,
      podeAlterarFilial: true,
    };
    sessaoFilialASomenteLeitura = { ...sessaoFilialA, podeAlterarFilial: false };
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { filialId: { in: [filialAId, filialBId] } } });
    await prisma.categoriaFinanceira.deleteMany({ where: { filialId: { in: [filialAId, filialBId] } } });
    await prisma.usuarioEmpresaFilial.deleteMany({
      where: { filialId: { in: [filialAId, filialBId] } },
    });
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.filial.deleteMany({ where: { empresaId } });
    await prisma.empresa.delete({ where: { id: empresaId } });
    await prisma.$disconnect();
  });

  test("rejeita parentId de uma filial irmã da mesma empresa", async () => {
    const paiNaFilialA = await criarCategoriaFinanceira(sessaoFilialA, {
      nome: "Pai Filial A",
      tipo: "RECEITA",
    });

    await expect(
      criarCategoriaFinanceira(sessaoFilialB, {
        nome: "Filho Inválido",
        tipo: "RECEITA",
        parentId: paiNaFilialA.id,
      }),
    ).rejects.toThrow("Categoria financeira pai inválida");
  });

  test("bloqueia criação quando perfil permite escrita mas a filial está em modo somente leitura", async () => {
    await expect(
      criarCategoriaFinanceira(sessaoFilialASomenteLeitura, { nome: "Bloqueado", tipo: "DESPESA" }),
    ).rejects.toThrow(FilialSomenteLeituraError);
  });

  test("bloqueia atualização quando a filial está em modo somente leitura", async () => {
    const categoria = await criarCategoriaFinanceira(sessaoFilialA, {
      nome: "Editável",
      tipo: "DESPESA",
    });

    await expect(
      atualizarCategoriaFinanceira(sessaoFilialASomenteLeitura, categoria.id, {
        nome: "Editado",
        tipo: "DESPESA",
      }),
    ).rejects.toThrow(FilialSomenteLeituraError);
  });

  test("bloqueia toggle de ativo quando a filial está em modo somente leitura", async () => {
    const categoria = await criarCategoriaFinanceira(sessaoFilialA, {
      nome: "Toggle",
      tipo: "RECEITA",
    });

    await expect(
      definirAtivoCategoriaFinanceira(sessaoFilialASomenteLeitura, categoria.id, false),
    ).rejects.toThrow(FilialSomenteLeituraError);
  });

  test("assertSemCiclo continua bloqueando ciclos dentro de uma filial", async () => {
    const pai = await criarCategoriaFinanceira(sessaoFilialA, {
      nome: "Ciclo Pai",
      tipo: "RECEITA",
    });
    const filho = await criarCategoriaFinanceira(sessaoFilialA, {
      nome: "Ciclo Filho",
      tipo: "DESPESA",
      parentId: pai.id,
    });

    await expect(
      atualizarCategoriaFinanceira(sessaoFilialA, pai.id, {
        nome: pai.nome,
        tipo: pai.tipo,
        parentId: filho.id,
      }),
    ).rejects.toThrow(CicloHierarquiaError);
  });
});
