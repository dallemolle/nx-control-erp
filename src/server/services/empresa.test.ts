import { afterAll, beforeAll, describe, expect, test, vi, type Mock } from "vitest";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://blob.test/${pathname}` })),
  del: vi.fn(async () => undefined),
}));

import { put, del } from "@vercel/blob";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { criarEmpresa, atualizarEmpresa, processarImagemEmpresa } from "./empresa";
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

  test("cria a Filial Matriz e o vínculo do fundador com acesso de alteração, sem cor nem logo", async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const empresa = await criarEmpresa(sessao, {
      razaoSocial: "Nova Empresa Ltda",
      nomeFantasia: "Nova Empresa",
      cnpjCpf: `${randomSuffix}/0001-01`,
      moedaPadrao: "BRL",
      exigirAprovacaoPorOutro: false,
    });
    novaEmpresaId = empresa.id;

    const filiais = await listarFiliaisAcessiveis(usuarioId, empresa.id);

    expect(filiais).toHaveLength(1);
    expect(filiais[0]?.filial.nome).toBe("Matriz");
    expect(filiais[0]?.podeAlterar).toBe(true);
    // Cor e logo são do Tema e marca.
    expect(empresa.corPrimaria).toBeNull();
    expect(empresa.logoUrl).toBeNull();
  });
});

describe("atualizarEmpresa", () => {
  let usuarioId: string;
  let empresaId: string;
  let sessao: SessaoAtiva;

  beforeAll(async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const usuario = await prisma.usuario.create({
      data: { nome: "Admin Marca", email: `admin-marca-${randomSuffix}@teste.local`, senhaHash: "x" },
    });
    usuarioId = usuario.id;
    sessao = {
      usuarioId,
      nome: "Admin Marca",
      empresaId: "n/a",
      perfil: "ADMINISTRADOR",
      filialId: "n/a",
      podeAlterarFilial: true,
    };

    const empresa = await criarEmpresa(sessao, {
      razaoSocial: "Empresa Atualiza Ltda",
      nomeFantasia: "Empresa Atualiza",
      cnpjCpf: `${randomSuffix}/0001-02`,
      moedaPadrao: "BRL",
      exigirAprovacaoPorOutro: true,
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await prisma.usuarioEmpresaFilial.deleteMany({ where: { usuarioEmpresa: { empresaId } } });
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId } });
    await prisma.filial.deleteMany({ where: { empresaId } });
    await prisma.auditLog.deleteMany({ where: { empresaId } });
    await prisma.empresa.delete({ where: { id: empresaId } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.$disconnect();
  });

  test("editar os dados mantém a cor antiga e o logo", async () => {
    // Empresa de antes do Tema e marca: a cor gravada continua pintando a barra lateral até salvar um tema.
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { corPrimaria: "#F5D76E", logoUrl: "https://blob.test/logo-antigo" },
    });
    const atual = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });

    const empresa = await atualizarEmpresa(sessao, empresaId, {
      razaoSocial: "Empresa Atualizada Ltda",
      nomeFantasia: atual.nomeFantasia,
      cnpjCpf: atual.cnpjCpf,
      moedaPadrao: atual.moedaPadrao,
      exigirAprovacaoPorOutro: atual.exigirAprovacaoPorOutro,
    });

    expect(empresa.razaoSocial).toBe("Empresa Atualizada Ltda");
    expect(empresa.corPrimaria).toBe("#F5D76E");
    expect(empresa.logoUrl).toBe("https://blob.test/logo-antigo");
  });

  test("empresa criada sem informar a opção exige aprovação por outra pessoa", async () => {
    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial: "Empresa Padrão Ltda",
        nomeFantasia: "Empresa Padrão",
        cnpjCpf: `${Math.random().toString(36).substring(2, 10)}/0001-03`,
      },
    });
    try {
      expect(empresa.exigirAprovacaoPorOutro).toBe(true);
    } finally {
      await prisma.empresa.delete({ where: { id: empresa.id } });
    }
  });

  test("desligar exigirAprovacaoPorOutro grava e audita antes e depois", async () => {
    const atual = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const empresa = await atualizarEmpresa(sessao, empresaId, {
      razaoSocial: atual.razaoSocial,
      nomeFantasia: atual.nomeFantasia,
      cnpjCpf: atual.cnpjCpf,
      moedaPadrao: atual.moedaPadrao,
      exigirAprovacaoPorOutro: false,
    });
    expect(empresa.exigirAprovacaoPorOutro).toBe(false);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { empresaId, entidade: "Empresa", acao: "ATUALIZAR" },
      orderBy: { criadoEm: "desc" },
    });
    expect(log.valorAnterior).toMatchObject({ exigirAprovacaoPorOutro: true });
    expect(log.valorNovo).toMatchObject({ exigirAprovacaoPorOutro: false });
  });
});

/** Envio de imagens do Tema e marca (logo, logo para fundo escuro, favicon). */
describe("processarImagemEmpresa", () => {
  const png = (conteudo: string) => new File([Buffer.from(conteudo)], "logo.png", { type: "image/png" });

  test("sobe o arquivo novo no Blob público", async () => {
    const arquivo = png("fake-png");
    const url = await processarImagemEmpresa("emp-1", null, arquivo, false, "logo");

    expect(url).toContain("blob.test");
    expect(put).toHaveBeenCalledWith(expect.stringContaining("empresas/emp-1/logo-"), arquivo, {
      access: "public",
      storeId: undefined,
    });
  });

  test("trocar a imagem existente sobe a nova antes de apagar a antiga", async () => {
    // Mocks não são resetados entre testes (sem clearMocks no vitest.config.ts), então
    // marcamos quantas chamadas já existiam antes desta chamada para comparar a ordem
    // relativa das chamadas feitas POR ESTE teste, não do histórico acumulado do arquivo.
    const putChamadasAntes = (put as Mock).mock.invocationCallOrder.length;
    const delChamadasAntes = (del as Mock).mock.invocationCallOrder.length;

    await processarImagemEmpresa("emp-1", "https://blob.test/antigo", png("fake-png-3"), false, "logo");

    expect(del).toHaveBeenCalledWith("https://blob.test/antigo", { storeId: undefined });
    const ordemPut = (put as Mock).mock.invocationCallOrder[putChamadasAntes];
    const ordemDel = (del as Mock).mock.invocationCallOrder[delChamadasAntes];
    expect(ordemPut).toBeDefined();
    expect(ordemDel).toBeDefined();
    expect(ordemPut!).toBeLessThan(ordemDel!);
  });

  test("remover sem arquivo novo limpa a URL e apaga o blob; sem nada, não mexe", async () => {
    expect(await processarImagemEmpresa("emp-1", "https://blob.test/velho", null, true, "logo")).toBeNull();
    expect(del).toHaveBeenCalledWith("https://blob.test/velho", { storeId: undefined });
    expect(await processarImagemEmpresa("emp-1", "https://blob.test/velho", null, false, "logo")).toBeUndefined();
  });

  test("arquivo de tipo não aceito ou maior que 1MB é recusado", async () => {
    const texto = new File([Buffer.from("nao é imagem")], "arquivo.txt", { type: "text/plain" });
    await expect(processarImagemEmpresa("emp-1", null, texto, false, "logo")).rejects.toThrow(
      "Formato de logo não aceito",
    );

    const grande = new File(["A".repeat(1024 * 1024 + 1)], "logo-grande.png", { type: "image/png" });
    await expect(processarImagemEmpresa("emp-1", null, grande, false, "logo")).rejects.toThrow("limite");
  });
});
