import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { PermissionError, FilialSomenteLeituraError } from "@/server/auth/permissions";
import { executarRotaApi, ErroValidacaoApi, paginacaoDaQuery } from "./executarRotaApi";
import { ErroLimiteRequisicoes } from "./limiteRequisicoes";
import { CursorInvalidoError } from "@/server/services/paginacao";

function requisicaoAutenticada(fixture: FixtureFinanceiro, chaveCompleta: string): Request {
  return new Request("http://localhost/api/v1/teste", {
    headers: {
      authorization: `Bearer ${chaveCompleta}`,
      "x-filial-cnpjcpf": fixture.filialCnpjCpf,
    },
  });
}

describe("executarRotaApi", () => {
  let fixture: FixtureFinanceiro;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("EXECROTA");
    const gerada = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave de teste");
    chaveCompleta = gerada.chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("chave válida chama o handler e devolve a resposta dele", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async (sessao) => {
      expect(sessao.usuarioId).toBe(fixture.usuarioId);
      return Response.json({ ok: true }, { status: 201 });
    });

    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toEqual({ ok: true });
  });

  test("chave inválida devolve 401 antes de chamar o handler", async () => {
    const request = new Request("http://localhost/api/v1/teste", {
      headers: { authorization: "Bearer sk_invalida", "x-filial-cnpjcpf": fixture.filialCnpjCpf },
    });
    let handlerChamado = false;

    const resposta = await executarRotaApi(request, async () => {
      handlerChamado = true;
      return Response.json({});
    });

    expect(resposta.status).toBe(401);
    expect(handlerChamado).toBe(false);
  });

  test("PermissionError lançado pelo handler vira 403", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new PermissionError("FINANCEIRO", "titulo:aprovar");
    });

    expect(resposta.status).toBe(403);
    expect((await resposta.json()).erro).toContain("titulo:aprovar");
  });

  test("FilialSomenteLeituraError lançado pelo handler vira 403", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new FilialSomenteLeituraError();
    });

    expect(resposta.status).toBe(403);
  });

  test("ErroValidacaoApi vira 422 com os campos", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new ErroValidacaoApi('Categoria financeira "Insumos" não encontrada', ["categoriaFinanceira"]);
    });

    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.erro).toBe('Categoria financeira "Insumos" não encontrada');
    expect(corpo.campos).toEqual(["categoriaFinanceira"]);
  });

  test("ZodError lançado pelo handler vira 422 com os campos", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      z.object({ nome: z.string().min(1) }).parse({ nome: "" });
      return Response.json({});
    });

    expect(resposta.status).toBe(422);
    const corpo = await resposta.json();
    expect(corpo.campos).toContain("nome");
  });

  test("recurso não encontrado via Prisma (findFirstOrThrow) vira 404", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      await prisma.parcela.findFirstOrThrow({ where: { id: "00000000-0000-0000-0000-000000000000" } });
      return Response.json({});
    });

    expect(resposta.status).toBe(404);
  });

  test("erro inesperado vira 500 sem vazar detalhes internos", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new Error("detalhe interno sensível");
    });

    expect(resposta.status).toBe(500);
    const corpo = await resposta.json();
    expect(corpo.erro).toBe("Erro interno");
    expect(corpo.erro).not.toContain("sensível");
  });

  test("ErroLimiteRequisicoes vira 429 com Retry-After", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new ErroLimiteRequisicoes(17);
    });

    expect(resposta.status).toBe(429);
    expect(resposta.headers.get("Retry-After")).toBe("17");
    expect((await resposta.json()).erro).toBe("Limite de 60 requisições por minuto atingido. Tente de novo em 17 s.");
  });

  test("CursorInvalidoError vira 422 com campo cursor", async () => {
    const resposta = await executarRotaApi(requisicaoAutenticada(fixture, chaveCompleta), async () => {
      throw new CursorInvalidoError();
    });

    expect(resposta.status).toBe(422);
    expect(await resposta.json()).toEqual({ erro: "Cursor inválido para esta listagem", campos: ["cursor"] });
  });
});

describe("paginacaoDaQuery", () => {
  const ler = (query: string) => paginacaoDaQuery(new URL(`http://localhost/api/v1/x${query}`));

  test("padrão 100 sem cursor", () => {
    expect(ler("")).toEqual({ limite: 100, cursor: undefined });
    expect(ler("?limite=")).toEqual({ limite: 100, cursor: undefined });
  });

  test("lê limite e cursor", () => {
    expect(ler("?limite=500&cursor=abc")).toEqual({ limite: 500, cursor: "abc" });
    expect(ler("?limite=1")).toEqual({ limite: 1, cursor: undefined });
  });

  test.each(["0", "501", "abc", "1.5", "-3"])("limite %s -> ErroValidacaoApi no campo limite", (valor) => {
    expect(() => ler(`?limite=${valor}`)).toThrow(ErroValidacaoApi);
    try {
      ler(`?limite=${valor}`);
    } catch (erro) {
      expect((erro as ErroValidacaoApi).message).toBe("Use ?limite= entre 1 e 500");
      expect((erro as ErroValidacaoApi).campos).toEqual(["limite"]);
    }
  });
});
