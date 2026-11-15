import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://blob.test/${pathname}` })),
  del: vi.fn(async () => undefined),
}));

import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { criarEmpresa } from "./empresa";
import {
  atualizarMarca,
  importarTema,
  MSG_CONFIRMAR_AVISOS,
  restaurarTemaPadrao,
  temaAplicavel,
} from "./temaEmpresa";

const textoHortitex = () => readFileSync("public/temas/hortitex.json", "utf8");
const comAviso = () => {
  const tema = JSON.parse(textoHortitex());
  tema.cores.claro.textoApagado = "#d8d0c0";
  return JSON.stringify(tema);
};

describe("tema por empresa", () => {
  let usuarioId: string;
  let empresaId: string;
  let sessao: SessaoAtiva;
  const ler = () => prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
  const auditorias = (acao: string) => prisma.auditLog.count({ where: { entidadeId: empresaId, acao } });

  beforeAll(async () => {
    const sufixo = Math.random().toString(36).substring(2, 10);
    usuarioId = (
      await prisma.usuario.create({ data: { nome: "Admin Tema", email: `tema-${sufixo}@teste.local`, senhaHash: "x" } })
    ).id;
    sessao = {
      usuarioId,
      nome: "Admin Tema",
      empresaId: "n/a",
      perfil: "ADMINISTRADOR",
      filialId: "n/a",
      podeAlterarFilial: true,
    };
    empresaId = (
      await criarEmpresa(sessao, {
        razaoSocial: "Empresa Tema Ltda",
        nomeFantasia: "Empresa Tema",
        cnpjCpf: `${sufixo}/0001-77`,
        moedaPadrao: "BRL",
        corPrimaria: null,
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.usuarioEmpresaFilial.deleteMany({ where: { usuarioEmpresa: { empresaId } } });
    await prisma.usuarioEmpresa.deleteMany({ where: { empresaId } });
    await prisma.filial.deleteMany({ where: { empresaId } });
    await prisma.auditLog.deleteMany({ where: { empresaId } });
    await prisma.empresa.delete({ where: { id: empresaId } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
  });

  test("importar a Hortitex grava o tema e audita", async () => {
    expect(await importarTema(sessao, empresaId, textoHortitex(), false)).toEqual({ avisos: [] });
    expect((await ler()).tema).toMatchObject({ nome: "Hortitex" });
    expect(await auditorias("IMPORTAR_TEMA")).toBe(1);
  });

  test("tema com aviso exige confirmação", async () => {
    await restaurarTemaPadrao(sessao, empresaId);
    await expect(importarTema(sessao, empresaId, comAviso(), false)).rejects.toThrow(MSG_CONFIRMAR_AVISOS);
    expect((await ler()).tema).toBeNull();
    const r = await importarTema(sessao, empresaId, comAviso(), true);
    expect(r.avisos.length).toBeGreaterThan(0);
    expect((await ler()).tema).toMatchObject({ nome: "Hortitex" });
  });

  test("texto que não é JSON e tema com erro são recusados sem gravar", async () => {
    await restaurarTemaPadrao(sessao, empresaId);
    await expect(importarTema(sessao, empresaId, "{ nao é json", false)).rejects.toThrow(/^JSON inválido/);
    const comErro = JSON.parse(textoHortitex());
    comErro.cores.claro.fundo = "red";
    await expect(importarTema(sessao, empresaId, JSON.stringify(comErro), false)).rejects.toThrow("cores.claro.fundo");
    expect((await ler()).tema).toBeNull();
  });

  test("restaurar o padrão zera o tema, audita e mantém os logos", async () => {
    await importarTema(sessao, empresaId, textoHortitex(), false);
    await prisma.empresa.update({ where: { id: empresaId }, data: { logoUrl: "https://blob.test/logo.png" } });
    await restaurarTemaPadrao(sessao, empresaId);
    const empresa = await ler();
    expect(empresa.tema).toBeNull();
    expect(empresa.logoUrl).toBe("https://blob.test/logo.png");
    expect(await auditorias("RESTAURAR_TEMA")).toBeGreaterThan(0);
  });

  test("só o Administrador gerencia tema; empresa inexistente é recusada", async () => {
    for (const perfil of ["FINANCEIRO", "GESTOR"] as const) {
      await expect(importarTema({ ...sessao, perfil }, empresaId, textoHortitex(), false)).rejects.toThrow(
        PermissionError,
      );
      await expect(restaurarTemaPadrao({ ...sessao, perfil }, empresaId)).rejects.toThrow(PermissionError);
    }
    await expect(importarTema(sessao, "inexistente", textoHortitex(), false)).rejects.toThrow(
      "Empresa não encontrada",
    );
  });

  test("temaAplicavel ignora tema salvo inválido", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(temaAplicavel({ formato: "nx-tema", versao: 99 })).toBeNull();
    expect(temaAplicavel(null)).toBeNull();
    expect(temaAplicavel(JSON.parse(textoHortitex()))).toMatchObject({ nome: "Hortitex" });
    aviso.mockRestore();
  });

  test("marca: favicon PNG grava a URL; formato errado é recusado", async () => {
    const png = new File([new Uint8Array([1, 2, 3])], "favicon.png", { type: "image/png" });
    await atualizarMarca(sessao, empresaId, {
      logoEscuro: null,
      favicon: png,
      removerLogoEscuro: false,
      removerFavicon: false,
    });
    expect((await ler()).faviconUrl).toMatch(/^https:\/\/blob\.test\/empresas\/.+\/favicon-/);
    expect(await auditorias("ATUALIZAR_MARCA")).toBe(1);

    const texto = new File(["x"], "favicon.txt", { type: "text/plain" });
    await expect(
      atualizarMarca(sessao, empresaId, { logoEscuro: null, favicon: texto, removerLogoEscuro: false, removerFavicon: false }),
    ).rejects.toThrow("Formato de favicon não aceito");
  });
});
