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
      "x-filial-cnpjcpf": fixture.filialCnpjCpf,
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
    expect(corpo.campos).toContain("cnpjCpf");
  });

  test("cadastros resolvidos mas parcelas vazias -> 422 (ZodError do tituloSchema, não 500)", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-5",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [],
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
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

  test("POST com tipo em minúsculas -> 422 com campo 'tipo'", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        tipo: "pagar",
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-TIPO-1",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [{ dataVencimento: "2026-10-01", valorOriginal: 100 }],
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.campos).toContain("tipo");
  });

  test("POST sem tipo -> 422 com campo 'tipo'", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-TIPO-2",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [{ dataVencimento: "2026-10-01", valorOriginal: 100 }],
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.campos).toContain("tipo");
  });

  test("POST com corpo que não é JSON válido -> 422, não 500", async () => {
    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: "{ isso não é json",
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
  });

  test("POST com parcelas ausente -> 422 com campo 'parcelas'", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-PARC-1",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.campos).toContain("parcelas");
  });

  test("POST com parcelas não sendo array -> 422 com campo 'parcelas'", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-PARC-2",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: "não é array",
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.campos).toContain("parcelas");
  });

  test("centro de custo não encontrado -> 422 com campo 'centroCusto' (nome de requisição, não interno)", async () => {
    const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
    const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });

    const request = new Request("http://localhost/api/v1/titulos", {
      method: "POST",
      headers: headers(chaveCompleta),
      body: JSON.stringify({
        tipo: "PAGAR",
        cnpjCpf: fornecedor.cnpjCpf,
        documento: "NF-API-CC-1",
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        centroCusto: "CC-INEXISTENTE-API",
        parcelas: [{ dataVencimento: "2026-10-01", valorOriginal: 100 }],
      }),
    });

    const resposta = await POST(request);
    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.campos).toContain("centroCusto");
  });

  describe("classificação fiscal × gerencial", () => {
    async function corpoBase(documento: string) {
      const fornecedor = await prisma.fornecedor.findUniqueOrThrow({ where: { id: fixture.fornecedorId } });
      const categoria = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: fixture.categoriaFinanceiraId } });
      return {
        tipo: "PAGAR",
        cnpjCpf: fornecedor.cnpjCpf,
        documento,
        dataEmissao: "2026-09-01",
        dataCompetencia: "2026-09-01",
        categoriaFinanceira: categoria.nome,
        parcelas: [{ dataVencimento: "2026-10-01", valorOriginal: 100 }],
      };
    }

    function post(corpo: unknown) {
      return POST(
        new Request("http://localhost/api/v1/titulos", { method: "POST", headers: headers(chaveCompleta), body: JSON.stringify(corpo) }),
      );
    }

    test("corpo sem os campos novos continua 201 e o título nasce FISCAL", async () => {
      const resposta = await post(await corpoBase("NF-API-FG-1"));
      expect(resposta.status).toBe(201);
      expect((await resposta.json()).classificacaoFiscal).toBe("FISCAL");
    });

    test("aceita GERENCIAL com recibo e devolve os campos novos", async () => {
      const resposta = await post({
        ...(await corpoBase("NF-API-FG-2")),
        classificacaoFiscal: "GERENCIAL",
        tipoComprovante: "RECIBO",
        motivoSemDocumento: "Produtor não emite nota",
      });
      expect(resposta.status).toBe(201);
      const corpo = await resposta.json();
      expect(corpo.classificacaoFiscal).toBe("GERENCIAL");
      expect(corpo.tipoComprovante).toBe("RECIBO");
    });

    test("classificação inválida -> 422 com o campo", async () => {
      const resposta = await post({ ...(await corpoBase("NF-API-FG-3")), classificacaoFiscal: "OUTRA" });
      expect(resposta.status).toBe(422);
      expect((await resposta.json()).campos).toContain("classificacaoFiscal");
    });

    test("recibo com a classificação resolvida como FISCAL -> 422 (regra do service, não do schema)", async () => {
      const resposta = await post({ ...(await corpoBase("NF-API-FG-4")), tipoComprovante: "RECIBO" });
      expect(resposta.status).toBe(422);
      expect((await resposta.json()).campos).toContain("tipoComprovante");
    });

    test("GET ?classificacao= filtra; valor desconhecido -> 422", async () => {
      const get = (query: string) =>
        GET(new Request(`http://localhost/api/v1/titulos?tipo=PAGAR${query}`, { headers: headers(chaveCompleta) }));

      const gerenciais = await (await get("&classificacao=GERENCIAL")).json();
      expect(gerenciais.length).toBeGreaterThan(0);
      expect(gerenciais.every((t: { classificacaoFiscal: string }) => t.classificacaoFiscal === "GERENCIAL")).toBe(true);

      const todos = await (await get("")).json();
      const fiscais = await (await get("&classificacao=FISCAL")).json();
      expect(fiscais.length + gerenciais.length).toBe(todos.length);

      expect((await get("&classificacao=fiscal")).status).toBe(422);
    });
  });
});
