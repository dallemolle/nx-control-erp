import { prisma } from "@/server/db/client";

export const LIMITE_REQUISICOES_POR_MINUTO = 60;

export class ErroLimiteRequisicoes extends Error {
  readonly status = 429;
  segundosParaLiberar: number;

  constructor(segundosParaLiberar: number) {
    super(
      `Limite de ${LIMITE_REQUISICOES_POR_MINUTO} requisições por minuto atingido. ` +
        `Tente de novo em ${segundosParaLiberar} s.`,
    );
    this.name = "ErroLimiteRequisicoes";
    this.segundosParaLiberar = segundosParaLiberar;
  }
}

type UsoDaChave = { requisicoesNaJanela: number; janelaLimiteEm: Date; agora: Date };

/**
 * Grava o último uso e conta a requisição na janela fixa de 1 minuto, num único
 * UPDATE atômico: requisições simultâneas da mesma chave ficam em fila no lock da
 * linha. Usa o relógio do banco para todas as instâncias serverless concordarem.
 * As colunas são TIMESTAMP sem fuso gravadas em UTC, daí o `AT TIME ZONE 'UTC'`.
 */
export async function registrarUsoDaChave(apiKeyId: string): Promise<void> {
  const [uso] = await prisma.$queryRaw<UsoDaChave[]>`
    UPDATE api_keys SET
      "ultimoUsoEm" = now() AT TIME ZONE 'UTC',
      "requisicoesNaJanela" = CASE
        WHEN "janelaLimiteEm" = date_trunc('minute', now() AT TIME ZONE 'UTC')
          THEN "requisicoesNaJanela" + 1
        ELSE 1 END,
      "janelaLimiteEm" = date_trunc('minute', now() AT TIME ZONE 'UTC')
    WHERE id = ${apiKeyId}
    RETURNING "requisicoesNaJanela", "janelaLimiteEm", now() AT TIME ZONE 'UTC' AS agora`;
  if (!uso || uso.requisicoesNaJanela <= LIMITE_REQUISICOES_POR_MINUTO) return;

  const msParaLiberar = uso.janelaLimiteEm.getTime() + 60_000 - uso.agora.getTime();
  throw new ErroLimiteRequisicoes(Math.min(60, Math.max(1, Math.ceil(msParaLiberar / 1000))));
}
