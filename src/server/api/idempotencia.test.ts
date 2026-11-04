import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { POST } from "@/app/api/v1/lancamentos-bancarios/route";

describe("Idempotency-Key nos POST da API v1", () => {
  let fixture: FixtureFinanceiro;
  let chaveApi: string;
  let agencia: string;
  let conta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("APIIDEM", "TESOURARIA");
    chaveApi = (await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave idempotência")).chaveCompleta;
    const contaBancaria = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: fixture.contaBancariaId } });
    agencia = contaBancaria.agencia;
    conta = contaBancaria.conta;
  });

  afterAll(async () => {
    await prisma.requisicaoIdempotente.deleteMany({ where: { filialId: fixture.filialId } });
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  function requisicao(descricao: string, chave?: string, extra: Record<string, unknown> = {}) {
    return new Request("http://localhost/api/v1/lancamentos-bancarios", {
      method: "POST",
      headers: {
        authorization: `Bearer ${chaveApi}`,
        "x-filial-cnpjcpf": fixture.filialCnpjCpf,
        "content-type": "application/json",
        ...(chave === undefined ? {} : { "idempotency-key": chave }),
      },
      body: JSON.stringify({
        contaBancariaAgencia: agencia,
        contaBancariaConta: conta,
        data: "2026-09-10",
        tipo: "ENTRADA",
        valor: 100,
        descricao,
        ...extra,
      }),
    });
  }

  const contar = (descricao: string) =>
    prisma.lancamentoBancario.count({ where: { filialId: fixture.filialId, descricao } });

  test("sem o cabeçalho, cada POST cria um registro (comportamento anterior)", async () => {
    expect((await POST(requisicao("sem-chave"))).status).toBe(201);
    expect((await POST(requisicao("sem-chave"))).status).toBe(201);
    expect(await contar("sem-chave")).toBe(2);
  });

  test("reenvio com a mesma chave devolve a resposta original sem duplicar", async () => {
    const primeira = await POST(requisicao("reenvio", "chave-1"));
    expect(primeira.status).toBe(201);
    const corpoOriginal = await primeira.json();

    const segunda = await POST(requisicao("reenvio", "chave-1"));
    expect(segunda.status).toBe(201);
    expect(segunda.headers.get("idempotent-replayed")).toBe("true");
    expect((await segunda.json()).id).toBe(corpoOriginal.id);

    expect(await contar("reenvio")).toBe(1);
  });

  test("mesma chave com outro corpo -> 422", async () => {
    expect((await POST(requisicao("corpo-a", "chave-2"))).status).toBe(201);
    const resposta = await POST(requisicao("corpo-b", "chave-2"));
    expect(resposta.status).toBe(422);
    expect(await contar("corpo-b")).toBe(0);
  });

  test("erro libera a chave para o reenvio corrigido", async () => {
    const comErro = await POST(requisicao("corrigido", "chave-3", { contaBancariaConta: "000-inexistente" }));
    expect(comErro.status).toBe(422);

    const corrigida = await POST(requisicao("corrigido", "chave-3"));
    expect(corrigida.status).toBe(201);
    expect(corrigida.headers.get("idempotent-replayed")).toBeNull();
    expect(await contar("corrigido")).toBe(1);
  });

  test("chave com a original ainda em processamento -> 409", async () => {
    await prisma.requisicaoIdempotente.create({
      data: {
        usuarioId: fixture.usuarioId,
        filialId: fixture.filialId,
        rota: "/api/v1/lancamentos-bancarios",
        chave: "chave-em-andamento",
      },
    });
    const resposta = await POST(requisicao("andamento", "chave-em-andamento"));
    expect(resposta.status).toBe(409);
    expect(await contar("andamento")).toBe(0);
  });

  test("chave vazia ou longa demais -> 422", async () => {
    expect((await POST(requisicao("invalida", "  "))).status).toBe(422);
    expect((await POST(requisicao("invalida", "x".repeat(256)))).status).toBe(422);
    expect(await contar("invalida")).toBe(0);
  });
});
