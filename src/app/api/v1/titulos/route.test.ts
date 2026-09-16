import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { POST, GET } from "./route";

describe("POST/GET /api/v1/titulos", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;
  let chaveConsulta: string;
  let usuarioConsultaId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APITIT", "FINANCEIRO");
    chaveCompleta = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave financeiro")).chaveCompleta;

    const usuarioConsulta = await prisma.usuario.create({
      data: { nome: "Consulta APITIT", email: "consulta-apitit@teste.local", senhaHash: "x" },
    });
    usuarioConsultaId = usuarioConsulta.id;
    const vinculoConsulta = await prisma.usuarioEmpresa.create({
      data: { usuarioId: usuarioConsulta.id, empresaId: fixture.empresaId, perfil: "CONSULTA", ativo: true },
    });
    await prisma.usuarioEmpresaFilial.create({
      data: { usuarioEmpresaId: vinculoConsulta.id, filialId: fixture.filialId, podeAlterar: false, ativo: true },
    });
    chaveConsulta = (await gerarChave(fixture.sessaoAdmin, usuarioConsulta.id, "Chave consulta")).chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: { in: [fixture.usuarioId, usuarioConsultaId] } } });
    await prisma.usuarioEmpresaFilial.deleteMany({ where: { usuarioEmpresa: { usuarioId: usuarioConsultaId } } });
    await prisma.usuarioEmpresa.deleteMany({ where: { usuarioId: usuarioConsultaId } });
    await prisma.usuario.delete({ where: { id: usuarioConsultaId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function headers(chave: string) {
    return {
      authorization: `Bearer ${chave}`,
      "x-empresa-id": fixture.empresaId,
      "x-filial-id": fixture.filialId,
      "content-type": "application/json",
    };
  }

  test("cria um título a pagar resolvendo CNPJ e categoria por nome", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-1",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [{ dataVencimento: "2026-10-01", valorOriginal: 500 }],
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(201);
    const corpo = await resposta.json();
    expect(corpo.documento).toBe("NF-API-1");
    expect(corpo.parcelas).toHaveLength(1);
    expect(corpo.parcelas[0].id).toBeTruthy();
  });

  test("cria título com múltiplas parcelas numeradas sequencialmente", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-2",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [
          { dataVencimento: "2026-10-01", valorOriginal: 100 },
          { dataVencimento: "2026-11-01", valorOriginal: 100 },
        ],
      }),
    });

    const corpo = await (await POST(request)).json();
    expect(corpo.parcelas.map((p: { numero: number }) => p.numero)).toEqual([1, 2]);
  });

  test("CNPJ não encontrado -> 422 com o campo indicado", async () => {
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: "00.000.000/0000-00",
        documento: "NF-API-3",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [{ dataVencimento: "2026-10-01", valorOriginal: 100 }],
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.erro).toContain("não encontrado");
    expect(corpo.campos).toContain("contraparteId");
  });

  test("perfil CONSULTA não consegue criar título -> 403", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveConsulta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-4",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [{ dataVencimento: "2026-10-01", valorOriginal: 100 }],
      }),
    });

    expect((await POST(request)).status).toBe(403);
  });

  test("GET lista os títulos PAGAR da filial, incluindo id da parcela", async () => {
    const request = new Request("http://localhost/api/v1/titulos?tipo=PAGAR", { headers: headers(chaveCompleta) });

    const resposta = await GET(request);
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(Array.isArray(corpo)).toBe(true);
    expect(corpo.some((t: { documento: string }) => t.documento === "NF-API-1")).toBe(true);
  });

  test("GET sem ?tipo= -> 422", async () => {
    const request = new Request("http://localhost/api/v1/titulos", { headers: headers(chaveCompleta) });
    expect((await GET(request)).status).toBe(422);
  });
});
