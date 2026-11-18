import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import {
  criarFixtureFinanceiro,
  limparFixtureFinanceiro,
  type FixtureFinanceiro,
} from "@/server/services/financeiroTestFixtures";
import { gerarChave } from "@/server/services/apiKey";
import { ErroLimiteRequisicoes, LIMITE_REQUISICOES_POR_MINUTO, registrarUsoDaChave } from "./limiteRequisicoes";
import { requireSessaoApi } from "./sessaoApi";

/** Evita que a virada do minuto caia no meio do teste e zere o contador. */
async function aguardarJanelaSegura() {
  const segundos = new Date().getUTCSeconds();
  if (segundos >= 55) await new Promise((resolve) => setTimeout(resolve, (61 - segundos) * 1000));
}

describe("limite de requisições por chave", () => {
  let fixture: FixtureFinanceiro;
  let chaveId: string;
  let chaveCompleta: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("LIMREQ");
    const gerada = await gerarChave(fixture.sessaoAdmin, fixture.usuarioId, "Chave limite");
    chaveId = gerada.id;
    chaveCompleta = gerada.chaveCompleta;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { usuarioId: fixture.usuarioId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  async function posicionarContador(requisicoes: number, minutosAtras = 0) {
    await prisma.$executeRaw`
      UPDATE api_keys SET
        "janelaLimiteEm" = date_trunc('minute', now() AT TIME ZONE 'UTC') - ${minutosAtras}::int * interval '1 minute',
        "requisicoesNaJanela" = ${requisicoes}::int
      WHERE id = ${chaveId}`;
  }

  test("a 60ª requisição da janela passa e a 61ª é bloqueada com segundos para liberar", async () => {
    await aguardarJanelaSegura();
    await posicionarContador(LIMITE_REQUISICOES_POR_MINUTO - 1);

    await expect(registrarUsoDaChave(chaveId)).resolves.toBeUndefined();

    const erro = await registrarUsoDaChave(chaveId).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroLimiteRequisicoes);
    expect(erro.status).toBe(429);
    expect(erro.segundosParaLiberar).toBeGreaterThanOrEqual(1);
    expect(erro.segundosParaLiberar).toBeLessThanOrEqual(60);
    expect(erro.message).toBe(
      `Limite de 60 requisições por minuto atingido. Tente de novo em ${erro.segundosParaLiberar} s.`,
    );
  }, 15_000);

  test("janela anterior não conta: o contador volta para 1", async () => {
    await aguardarJanelaSegura();
    await posicionarContador(500, 1);

    await expect(registrarUsoDaChave(chaveId)).resolves.toBeUndefined();

    const chave = await prisma.apiKey.findUniqueOrThrow({ where: { id: chaveId } });
    expect(chave.requisicoesNaJanela).toBe(1);
    expect(chave.ultimoUsoEm).not.toBeNull();
  }, 15_000);

  test("requireSessaoApi aplica o limite", async () => {
    await aguardarJanelaSegura();
    await posicionarContador(LIMITE_REQUISICOES_POR_MINUTO);

    const requisicao = new Request("http://localhost/api/v1/teste", {
      headers: { authorization: `Bearer ${chaveCompleta}`, "x-filial-cnpjcpf": fixture.filialCnpjCpf },
    });
    await expect(requireSessaoApi(requisicao)).rejects.toBeInstanceOf(ErroLimiteRequisicoes);

    await posicionarContador(0);
  }, 15_000);
});
