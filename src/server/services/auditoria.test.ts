import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { listarAuditoria, buscarOpcoesFiltroAuditoria } from "./auditoria";

describe("auditoria (empresa-scoped)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("AUD");
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { empresaId: fixture.empresaId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("listarAuditoria bloqueia perfil sem auditoria:ler", async () => {
    await expect(listarAuditoria(fixture.sessao, {}, 1)).rejects.toThrow(PermissionError);
  });

  test("buscarOpcoesFiltroAuditoria bloqueia perfil sem auditoria:ler", async () => {
    await expect(buscarOpcoesFiltroAuditoria(fixture.sessao)).rejects.toThrow(PermissionError);
  });

  test("listarAuditoria filtra por entidade", async () => {
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "TituloTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-1",
      },
    });
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "BaixaTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-2",
      },
    });

    const { logs } = await listarAuditoria(fixture.sessaoAdmin, { entidade: "TituloTesteAUD" }, 1);
    expect(logs.every((log) => log.entidade === "TituloTesteAUD")).toBe(true);
    expect(logs.some((log) => log.entidade === "BaixaTesteAUD")).toBe(false);
  });

  test("listarAuditoria filtra por acao", async () => {
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "AcaoTesteAUD",
        acao: "APROVAR_TESTE_AUD",
        entidadeId: "id-3",
      },
    });

    const { logs } = await listarAuditoria(fixture.sessaoAdmin, { acao: "APROVAR_TESTE_AUD" }, 1);
    expect(logs.every((log) => log.acao === "APROVAR_TESTE_AUD")).toBe(true);
  });

  test("listarAuditoria filtra por usuarioId", async () => {
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioAdminId,
        entidade: "UsuarioTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-4",
      },
    });
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "UsuarioTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-5",
      },
    });

    const { logs } = await listarAuditoria(
      fixture.sessaoAdmin,
      { entidade: "UsuarioTesteAUD", usuarioId: fixture.usuarioAdminId },
      1,
    );
    expect(logs.every((log) => log.usuarioId === fixture.usuarioAdminId)).toBe(true);
    expect(logs.some((log) => log.usuarioId === fixture.usuarioId)).toBe(false);
  });

  test("listarAuditoria filtra por filialId — e as opções de filial vêm do cadastro completo, não só de quem já tem log", async () => {
    const filialIrma = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial Irma AUD", cnpj: "11.111.AUD/0001-99" },
    });

    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: filialIrma.id,
        usuarioId: fixture.usuarioId,
        entidade: "FilialTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-6",
      },
    });

    const { logs } = await listarAuditoria(fixture.sessaoAdmin, { filialId: filialIrma.id }, 1);
    expect(logs.every((log) => log.filialId === filialIrma.id)).toBe(true);

    // Cadastro completo: uma filial SEM nenhum log ainda aparece nas opções.
    const outraFilialSemLog = await prisma.filial.create({
      data: { empresaId: fixture.empresaId, nome: "Filial Sem Log AUD", cnpj: "11.111.AUD/0001-88" },
    });
    const opcoes = await buscarOpcoesFiltroAuditoria(fixture.sessaoAdmin);
    expect(opcoes.filiais.some((f) => f.id === outraFilialSemLog.id)).toBe(true);

    await prisma.auditLog.deleteMany({ where: { filialId: filialIrma.id } });
    await prisma.filial.delete({ where: { id: filialIrma.id } });
    await prisma.filial.delete({ where: { id: outraFilialSemLog.id } });
  });

  test("listarAuditoria filtra por período (dataDe/dataAte, inclusivo)", async () => {
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "PeriodoTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-7",
        criadoEm: new Date("2027-03-15T12:00:00.000Z"),
      },
    });

    const dentro = await listarAuditoria(
      fixture.sessaoAdmin,
      { entidade: "PeriodoTesteAUD", dataDe: new Date("2027-03-01T00:00:00.000Z"), dataAte: new Date("2027-03-31T23:59:59.999Z") },
      1,
    );
    expect(dentro.logs.length).toBeGreaterThan(0);

    const fora = await listarAuditoria(
      fixture.sessaoAdmin,
      { entidade: "PeriodoTesteAUD", dataDe: new Date("2027-04-01T00:00:00.000Z") },
      1,
    );
    expect(fora.logs).toEqual([]);
  });

  test("listarAuditoria combina dois filtros: interseção, não união", async () => {
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "ComboTesteAUD",
        acao: "ACAO_A_AUD",
        entidadeId: "id-8",
      },
    });
    await prisma.auditLog.create({
      data: {
        empresaId: fixture.empresaId,
        filialId: fixture.filialId,
        usuarioId: fixture.usuarioId,
        entidade: "ComboTesteAUD",
        acao: "ACAO_B_AUD",
        entidadeId: "id-9",
      },
    });

    const { logs } = await listarAuditoria(
      fixture.sessaoAdmin,
      { entidade: "ComboTesteAUD", acao: "ACAO_A_AUD" },
      1,
    );
    expect(logs.some((log) => log.entidadeId === "id-8")).toBe(true);
    expect(logs.some((log) => log.entidadeId === "id-9")).toBe(false);
  });

  test("listarAuditoria pagina corretamente", async () => {
    const criacoes = Array.from({ length: 55 }, (_, i) =>
      prisma.auditLog.create({
        data: {
          empresaId: fixture.empresaId,
          filialId: fixture.filialId,
          usuarioId: fixture.usuarioId,
          entidade: "PaginaTesteAUD",
          acao: "CRIAR",
          entidadeId: `pagina-${i}`,
        },
      }),
    );
    await Promise.all(criacoes);

    const pagina1 = await listarAuditoria(fixture.sessaoAdmin, { entidade: "PaginaTesteAUD" }, 1);
    const pagina2 = await listarAuditoria(fixture.sessaoAdmin, { entidade: "PaginaTesteAUD" }, 2);

    expect(pagina1.logs).toHaveLength(50);
    expect(pagina2.logs).toHaveLength(5);
    expect(pagina1.totalPaginas).toBe(2);

    const idsPagina1 = new Set(pagina1.logs.map((log) => log.id));
    const idsPagina2 = new Set(pagina2.logs.map((log) => log.id));
    const intersecao = [...idsPagina1].filter((id) => idsPagina2.has(id));
    expect(intersecao).toHaveLength(0);
  });

  test("listarAuditoria não vaza entre empresas, mesmo com filtro que combinaria", async () => {
    const outraEmpresa = await prisma.empresa.create({
      data: { razaoSocial: "Outra Empresa AUD Ltda", nomeFantasia: "Outra AUD", cnpj: "44.444.AUD/0001-11" },
    });

    await prisma.auditLog.create({
      data: {
        empresaId: outraEmpresa.id,
        entidade: "IsolamentoTesteAUD",
        acao: "CRIAR",
        entidadeId: "id-alheio",
      },
    });

    const { logs } = await listarAuditoria(fixture.sessaoAdmin, { entidade: "IsolamentoTesteAUD" }, 1);
    expect(logs).toEqual([]);

    await prisma.auditLog.deleteMany({ where: { empresaId: outraEmpresa.id } });
    await prisma.empresa.delete({ where: { id: outraEmpresa.id } });
  });

  test("buscarOpcoesFiltroAuditoria devolve entidades/ações/usuários distintos", async () => {
    const opcoes = await buscarOpcoesFiltroAuditoria(fixture.sessaoAdmin);
    expect(opcoes.entidades).toContain("ComboTesteAUD");
    // Sem duplicatas: cada entidade aparece só uma vez mesmo com múltiplos logs dela.
    const contagem = opcoes.entidades.filter((e) => e === "ComboTesteAUD").length;
    expect(contagem).toBe(1);
    expect(opcoes.usuarios.some((u) => u.id === fixture.usuarioId)).toBe(true);
  });
});
