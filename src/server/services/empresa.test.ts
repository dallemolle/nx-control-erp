import { afterAll, beforeAll, describe, expect, test, vi, type Mock } from "vitest";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://blob.test/${pathname}` })),
  del: vi.fn(async () => undefined),
}));

import { put, del } from "@vercel/blob";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { criarEmpresa, atualizarEmpresa } from "./empresa";
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
      cnpjCpf: `${randomSuffix}/0001-01`,
      moedaPadrao: "BRL",
      corPrimaria: null,
    });
    novaEmpresaId = empresa.id;

    const filiais = await listarFiliaisAcessiveis(usuarioId, empresa.id);

    expect(filiais).toHaveLength(1);
    expect(filiais[0]?.filial.nome).toBe("Matriz");
    expect(filiais[0]?.podeAlterar).toBe(true);
  });

  test("sem corPrimaria/logo: os dois campos ficam null", async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const empresa = await criarEmpresa(sessao, {
      razaoSocial: "Empresa Sem Marca Ltda",
      nomeFantasia: "Empresa Sem Marca",
      cnpjCpf: `${randomSuffix}/0001-01`,
      moedaPadrao: "BRL",
      corPrimaria: null,
    });

    expect(empresa.corPrimaria).toBeNull();
    expect(empresa.logoUrl).toBeNull();

    await prisma.usuarioEmpresaFilial.deleteMany({ where: { usuarioEmpresa: { empresaId: empresa.id } } });
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.filial.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.auditLog.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.empresa.delete({ where: { id: empresa.id } });
  });

  test("com corPrimaria e logo: persiste os dois", async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const arquivo = new File([Buffer.from("fake-png")], "logo.png", { type: "image/png" });

    const empresa = await criarEmpresa(
      sessao,
      {
        razaoSocial: "Empresa Com Marca Ltda",
        nomeFantasia: "Empresa Com Marca",
        cnpjCpf: `${randomSuffix}/0001-01`,
        moedaPadrao: "BRL",
        corPrimaria: "#0B2545",
      },
      arquivo,
    );

    expect(empresa.corPrimaria).toBe("#0B2545");
    expect(empresa.logoUrl).toContain("blob.test");
    expect(put).toHaveBeenCalledWith(
      expect.stringContaining(`empresas/${empresa.id}/logo-`),
      arquivo,
      { access: "public", storeId: undefined },
    );

    await prisma.usuarioEmpresaFilial.deleteMany({ where: { usuarioEmpresa: { empresaId: empresa.id } } });
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.filial.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.auditLog.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.empresa.delete({ where: { id: empresa.id } });
  });

  test("arquivo de logo maior que 1MB é rejeitado, empresa não é criada", async () => {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const conteudoGrande = "A".repeat(1024 * 1024 + 1);
    const arquivo = new File([conteudoGrande], "logo-grande.png", { type: "image/png" });

    await expect(
      criarEmpresa(
        sessao,
        {
          razaoSocial: "Não Deve Existir Ltda",
          nomeFantasia: "Não Deve Existir",
          cnpjCpf: `${randomSuffix}/0001-01`,
          moedaPadrao: "BRL",
          corPrimaria: null,
        },
        arquivo,
      ),
    ).rejects.toThrow("limite");

    const encontrada = await prisma.empresa.findFirst({ where: { nomeFantasia: "Não Deve Existir" } });
    expect(encontrada).toBeNull();
  });
});

describe("atualizarEmpresa — cor e logo", () => {
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
      corPrimaria: null,
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

  test("define corPrimaria", async () => {
    const empresa = await atualizarEmpresa(sessao, empresaId, {
      razaoSocial: "Empresa Atualiza Ltda",
      nomeFantasia: "Empresa Atualiza",
      cnpjCpf: (await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } })).cnpjCpf,
      moedaPadrao: "BRL",
      corPrimaria: "#F5D76E",
    });

    expect(empresa.corPrimaria).toBe("#F5D76E");
  });

  test("faz upload de um logo novo", async () => {
    const arquivo = new File([Buffer.from("fake-png-2")], "logo2.png", { type: "image/png" });
    const dadosAtuais = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });

    const empresa = await atualizarEmpresa(
      sessao,
      empresaId,
      {
        razaoSocial: dadosAtuais.razaoSocial,
        nomeFantasia: dadosAtuais.nomeFantasia,
        cnpjCpf: dadosAtuais.cnpjCpf,
        moedaPadrao: dadosAtuais.moedaPadrao,
        corPrimaria: dadosAtuais.corPrimaria,
      },
      arquivo,
    );

    expect(empresa.logoUrl).toContain("blob.test");
  });

  test("trocar o logo existente sobe o novo antes de apagar o antigo", async () => {
    const arquivo = new File([Buffer.from("fake-png-3")], "logo3.png", { type: "image/png" });
    const antes = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(antes.logoUrl).not.toBeNull();

    // Mocks não são resetados entre testes (sem clearMocks no vitest.config.ts), então
    // marcamos quantas chamadas já existiam antes desta chamada para comparar a ordem
    // relativa das chamadas feitas POR ESTE teste, não do histórico acumulado do arquivo.
    const putChamadasAntes = (put as Mock).mock.invocationCallOrder.length;
    const delChamadasAntes = (del as Mock).mock.invocationCallOrder.length;

    await atualizarEmpresa(
      sessao,
      empresaId,
      {
        razaoSocial: antes.razaoSocial,
        nomeFantasia: antes.nomeFantasia,
        cnpjCpf: antes.cnpjCpf,
        moedaPadrao: antes.moedaPadrao,
        corPrimaria: antes.corPrimaria,
      },
      arquivo,
    );

    expect(del).toHaveBeenCalledWith(antes.logoUrl, { storeId: undefined });
    const ordemPut = (put as Mock).mock.invocationCallOrder[putChamadasAntes];
    const ordemDel = (del as Mock).mock.invocationCallOrder[delChamadasAntes];
    expect(ordemPut).toBeDefined();
    expect(ordemDel).toBeDefined();
    expect(ordemPut!).toBeLessThan(ordemDel!);
  });

  test("removerLogo:true sem novo arquivo limpa logoUrl e apaga o blob", async () => {
    const antes = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(antes.logoUrl).not.toBeNull();

    const empresa = await atualizarEmpresa(
      sessao,
      empresaId,
      {
        razaoSocial: antes.razaoSocial,
        nomeFantasia: antes.nomeFantasia,
        cnpjCpf: antes.cnpjCpf,
        moedaPadrao: antes.moedaPadrao,
        corPrimaria: antes.corPrimaria,
      },
      null,
      true,
    );

    expect(empresa.logoUrl).toBeNull();
    expect(del).toHaveBeenCalledWith(antes.logoUrl, { storeId: undefined });
  });

  test("arquivo de tipo não aceito é rejeitado, logoUrl não muda", async () => {
    const antes = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const arquivo = new File([Buffer.from("nao é imagem")], "arquivo.txt", { type: "text/plain" });

    await expect(
      atualizarEmpresa(
        sessao,
        empresaId,
        {
          razaoSocial: antes.razaoSocial,
          nomeFantasia: antes.nomeFantasia,
          cnpjCpf: antes.cnpjCpf,
          moedaPadrao: antes.moedaPadrao,
          corPrimaria: antes.corPrimaria,
        },
        arquivo,
      ),
    ).rejects.toThrow("Formato de logo não aceito");

    const depois = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(depois.logoUrl).toBe(antes.logoUrl);
  });
});
