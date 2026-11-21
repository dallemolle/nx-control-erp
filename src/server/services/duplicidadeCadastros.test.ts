import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { atualizarBanco, criarBanco } from "./banco";
import { atualizarCentroCusto, criarCentroCusto } from "./centroCusto";
import { atualizarCentroLucro, criarCentroLucro } from "./centroLucro";
import { atualizarProjeto, criarProjeto } from "./projeto";

/** Código repetido em Bancos, nos Centros e em Projetos vira mensagem para o usuário, e não o erro do banco de dados. */
describe("cadastros com código único", () => {
  const sufixo = Math.random().toString(36).substring(2, 8);
  let empresaId: string;
  let filialId: string;
  let usuarioId: string;
  let sessao: SessaoAtiva;
  const bancosCriados: string[] = [];

  beforeAll(async () => {
    const empresa = await prisma.empresa.create({
      data: { razaoSocial: "Teste Duplicidade Ltda", nomeFantasia: "Teste Duplicidade", cnpjCpf: `${sufixo}/0001-91` },
    });
    empresaId = empresa.id;
    const filial = await prisma.filial.create({
      data: { empresaId, nome: "Filial Duplicidade", cnpjCpf: `${sufixo}/0002-91`, ativo: true },
    });
    filialId = filial.id;
    const usuario = await prisma.usuario.create({
      data: { nome: "Usuário Duplicidade", email: `duplicidade-${sufixo}@teste.local`, senhaHash: "x" },
    });
    usuarioId = usuario.id;
    sessao = { usuarioId, nome: usuario.nome, empresaId, perfil: "FINANCEIRO", filialId, podeAlterarFilial: true };
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { empresaId } });
    await prisma.banco.deleteMany({ where: { id: { in: bancosCriados } } });
    await prisma.centroCusto.deleteMany({ where: { filialId } });
    await prisma.centroLucro.deleteMany({ where: { filialId } });
    await prisma.projeto.deleteMany({ where: { filialId } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.filial.delete({ where: { id: filialId } });
    await prisma.empresa.delete({ where: { id: empresaId } });
    await prisma.$disconnect();
  });

  test("banco: código repetido ao criar e ao editar", async () => {
    const a = await criarBanco(sessao, { codigo: `a${sufixo}`, nome: "Banco A" });
    const b = await criarBanco(sessao, { codigo: `b${sufixo}`, nome: "Banco B" });
    bancosCriados.push(a.id, b.id);
    await expect(criarBanco(sessao, { codigo: `a${sufixo}`, nome: "Outro" })).rejects.toThrow(
      "Já existe um banco com este código",
    );
    await expect(atualizarBanco(sessao, b.id, { codigo: `a${sufixo}`, nome: "Banco B" })).rejects.toThrow(
      "Já existe um banco com este código",
    );
  });

  test("centro de custo: código repetido na filial ao criar e ao editar", async () => {
    await criarCentroCusto(sessao, { nome: "Lavoura", codigo: "CC-02" });
    const outro = await criarCentroCusto(sessao, { nome: "Fábrica", codigo: "CC-03" });
    await expect(criarCentroCusto(sessao, { nome: "Outro", codigo: "CC-02" })).rejects.toThrow(
      "Já existe um centro de custo com este código",
    );
    await expect(atualizarCentroCusto(sessao, outro.id, { nome: "Fábrica", codigo: "CC-02" })).rejects.toThrow(
      "Já existe um centro de custo com este código",
    );
  });

  test("centro de lucro: código repetido na filial ao criar e ao editar", async () => {
    await criarCentroLucro(sessao, { nome: "Polpa", codigo: "CL-01" });
    const outro = await criarCentroLucro(sessao, { nome: "Loja", codigo: "CL-03" });
    await expect(criarCentroLucro(sessao, { nome: "Outro", codigo: "CL-01" })).rejects.toThrow(
      "Já existe um centro de lucro com este código",
    );
    await expect(atualizarCentroLucro(sessao, outro.id, { nome: "Loja", codigo: "CL-01" })).rejects.toThrow(
      "Já existe um centro de lucro com este código",
    );
  });

  test("projeto: código repetido na filial ao criar e ao editar", async () => {
    await criarProjeto(sessao, { nome: "Reforma do galpão", codigo: "PRJ-01", status: "ENCERRADO" });
    const outro = await criarProjeto(sessao, { nome: "Câmara fria", codigo: "PRJ-02", status: "EM_ANDAMENTO" });
    await expect(criarProjeto(sessao, { nome: "Outro", codigo: "PRJ-01", status: "PLANEJADO" })).rejects.toThrow(
      "Já existe um projeto com este código",
    );
    await expect(
      atualizarProjeto(sessao, outro.id, { nome: "Câmara fria", codigo: "PRJ-01", status: "EM_ANDAMENTO" }),
    ).rejects.toThrow("Já existe um projeto com este código");
  });
});
