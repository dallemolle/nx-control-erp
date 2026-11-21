import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://blob.test/${pathname}` })),
  del: vi.fn(async () => undefined),
}));

import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { atualizarEmpresa, criarEmpresa, definirAtivoEmpresa, listarEmpresas } from "./empresa";
import { atualizarFilial, criarFilial, definirAtivoFilial } from "./filial";
import { atualizarMarca, importarTema, restaurarTemaPadrao } from "./temaEmpresa";
import { AcessoNegadoError, requireVinculoAtivo } from "./usuarioEmpresa";

/**
 * Empresas e Filiais: cada Administrador só enxerga e altera as empresas em que é Administrador; ninguém inativa a
 * empresa ou a filial em que está; empresa inativa não abre sessão; CNPJ repetido vira mensagem.
 */
describe("escopo de Empresas e Filiais", () => {
  const sufixo = Math.random().toString(36).substring(2, 8);
  const usuarios: string[] = [];
  const empresas: string[] = [];
  let sessaoA: SessaoAtiva;
  let sessaoB: SessaoAtiva;
  let empresaA: { id: string; cnpjCpf: string };
  let empresaB: { id: string; cnpjCpf: string };
  let matrizA: string;

  const dadosEmpresa = (nome: string, cnpjCpf: string) => ({
    razaoSocial: `${nome} Ltda`,
    nomeFantasia: nome,
    cnpjCpf,
    moedaPadrao: "BRL",
    corPrimaria: null,
    exigirAprovacaoPorOutro: true,
  });

  async function sessaoDe(nome: string): Promise<SessaoAtiva> {
    const usuario = await prisma.usuario.create({
      data: { nome, email: `${nome.toLowerCase()}-${sufixo}@teste.local`, senhaHash: "x" },
    });
    usuarios.push(usuario.id);
    return { usuarioId: usuario.id, nome, empresaId: "n/a", perfil: "ADMINISTRADOR", filialId: "n/a", podeAlterarFilial: true };
  }

  beforeAll(async () => {
    sessaoA = await sessaoDe("AdminA");
    sessaoB = await sessaoDe("AdminB");
    empresaA = await criarEmpresa(sessaoA, dadosEmpresa("Escopo A", `${sufixo}/0001-11`));
    empresaB = await criarEmpresa(sessaoB, dadosEmpresa("Escopo B", `${sufixo}/0001-22`));
    empresas.push(empresaA.id, empresaB.id);
    matrizA = (await prisma.filial.findFirstOrThrow({ where: { empresaId: empresaA.id } })).id;
    sessaoA = { ...sessaoA, empresaId: empresaA.id, filialId: matrizA };
    const matrizB = await prisma.filial.findFirstOrThrow({ where: { empresaId: empresaB.id } });
    sessaoB = { ...sessaoB, empresaId: empresaB.id, filialId: matrizB.id };
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { empresaId: { in: empresas } } });
    await prisma.usuarioEmpresaFilial.deleteMany({ where: { usuarioEmpresa: { empresaId: { in: empresas } } } });
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: { in: empresas } } });
    await prisma.filial.deleteMany({ where: { empresaId: { in: empresas } } });
    await prisma.empresa.deleteMany({ where: { id: { in: empresas } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  describe("44. cada Administrador só vê e altera as próprias empresas", () => {
    test("a lista traz só as empresas em que a pessoa é Administrador", async () => {
      const ids = (await listarEmpresas(sessaoA)).map((e) => e.id);
      expect(ids).toContain(empresaA.id);
      expect(ids).not.toContain(empresaB.id);
    });

    test("ser de outro perfil na empresa não basta", async () => {
      await prisma.usuarioEmpresa.create({
        data: { usuarioId: sessaoA.usuarioId, empresaId: empresaB.id, perfil: "FINANCEIRO" },
      });
      expect((await listarEmpresas(sessaoA)).map((e) => e.id)).not.toContain(empresaB.id);
      await expect(
        atualizarEmpresa(sessaoA, empresaB.id, dadosEmpresa("Invadida", empresaB.cnpjCpf)),
      ).rejects.toThrow("Empresa não encontrada");
    });

    test("editar, inativar, tema e marca de empresa alheia são recusados sem mudar nada", async () => {
      await expect(
        atualizarEmpresa(sessaoA, empresaB.id, dadosEmpresa("Invadida", empresaB.cnpjCpf)),
      ).rejects.toThrow("Empresa não encontrada");
      await expect(definirAtivoEmpresa(sessaoA, empresaB.id, false)).rejects.toThrow("Empresa não encontrada");
      await expect(restaurarTemaPadrao(sessaoA, empresaB.id)).rejects.toThrow("Empresa não encontrada");
      await expect(importarTema(sessaoA, empresaB.id, "{}", false)).rejects.toThrow("Empresa não encontrada");
      await expect(
        atualizarMarca(sessaoA, empresaB.id, { logoEscuro: null, favicon: null, removerLogoEscuro: true, removerFavicon: true }),
      ).rejects.toThrow("Empresa não encontrada");

      const b = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaB.id } });
      expect(b.nomeFantasia).toBe("Escopo B");
      expect(b.ativo).toBe(true);
    });
  });

  describe("45. empresa inativa", () => {
    test("não dá para inativar a empresa em que se está", async () => {
      await expect(definirAtivoEmpresa(sessaoA, empresaA.id, false)).rejects.toThrow(
        "Troque de empresa antes de inativar esta",
      );
    });

    test("inativada de outra empresa, ela deixa de abrir sessão; reativada, volta", async () => {
      const segunda = await criarEmpresa(sessaoA, dadosEmpresa("Escopo A2", `${sufixo}/0001-33`));
      empresas.push(segunda.id);

      await definirAtivoEmpresa(sessaoA, segunda.id, false);
      await expect(requireVinculoAtivo(sessaoA.usuarioId, segunda.id)).rejects.toThrow(AcessoNegadoError);

      await definirAtivoEmpresa(sessaoA, segunda.id, true);
      expect(await requireVinculoAtivo(sessaoA.usuarioId, segunda.id)).toBe("ADMINISTRADOR");
    });
  });

  describe("46. filial ativa", () => {
    test("não dá para inativar a filial em que se está; outra filial, sim", async () => {
      await expect(definirAtivoFilial(sessaoA, matrizA, false)).rejects.toThrow("Troque de filial antes de inativar esta");

      const outra = await criarFilial(sessaoA, { nome: "Filial Escopo", cnpjCpf: `${sufixo}/0002-44` });
      const inativada = await definirAtivoFilial(sessaoA, outra.id, false);
      expect(inativada.ativo).toBe(false);
    });
  });

  describe("47. CNPJ/CPF repetido vira mensagem", () => {
    test("empresa", async () => {
      await expect(criarEmpresa(sessaoA, dadosEmpresa("Repetida", empresaB.cnpjCpf))).rejects.toThrow(
        "Já existe uma empresa com este CNPJ/CPF",
      );
      await expect(
        atualizarEmpresa(sessaoA, empresaA.id, dadosEmpresa("Escopo A", empresaB.cnpjCpf)),
      ).rejects.toThrow("Já existe uma empresa com este CNPJ/CPF");
    });

    test("filial", async () => {
      const filial = await criarFilial(sessaoA, { nome: "Filial Repetida", cnpjCpf: `${sufixo}/0002-55` });
      await expect(criarFilial(sessaoA, { nome: "Outra", cnpjCpf: `${sufixo}/0002-55` })).rejects.toThrow(
        "Já existe uma filial com este CNPJ/CPF",
      );
      await expect(
        atualizarFilial(sessaoA, filial.id, { nome: "Filial Repetida", cnpjCpf: empresaB.cnpjCpf }),
      ).rejects.toThrow("Já existe uma filial com este CNPJ/CPF");
    });
  });
});
