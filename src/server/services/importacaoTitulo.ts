import Papa from "papaparse";
import { prisma } from "@/server/db/client";
import { tituloSchema } from "@/lib/schemas/titulo";
import { criarTitulo } from "@/server/services/titulo";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";

export type LinhaImportacao = {
  linha: number;
  bruta: Record<string, string>;
  erros: string[];
};

function linhaCsvParaTitulo(bruta: Record<string, string>) {
  return {
    contraparteId: bruta.contraparteId,
    documento: bruta.documento,
    dataEmissao: bruta.dataEmissao,
    dataCompetencia: bruta.dataCompetencia,
    categoriaFinanceiraId: bruta.categoriaFinanceiraId,
    centroCustoId: bruta.centroCustoId,
    centroLucroId: bruta.centroLucroId,
    safraId: bruta.safraId,
    projetoId: bruta.projetoId,
    contaBancariaId: bruta.contaBancariaId,
    formaPagamento: bruta.formaPagamento,
    parcelas: [
      {
        numero: bruta.numeroParcela || "1",
        dataVencimento: bruta.dataVencimento,
        valorOriginal: bruta.valorOriginal,
      },
    ],
  };
}

export function validarCsv(conteudoCsv: string): LinhaImportacao[] {
  const resultado = Papa.parse<Record<string, string>>(conteudoCsv, { header: true, skipEmptyLines: true });

  return resultado.data.map((bruta, indice) => {
    const parsed = tituloSchema.safeParse(linhaCsvParaTitulo(bruta));
    const erros = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    return { linha: indice + 2, bruta, erros };
  });
}

export async function confirmarImportacao(sessao: SessaoAtiva, tipo: TipoTitulo, linhas: LinhaImportacao[]) {
  if (linhas.length === 0) {
    throw new Error("Nenhuma linha para importar");
  }
  if (linhas.some((linha) => linha.erros.length > 0)) {
    throw new Error("Existem linhas inválidas — corrija ou remova antes de importar");
  }

  return prisma.$transaction(async (tx) => {
    const criados = [];
    for (const linha of linhas) {
      const dados = tituloSchema.parse(linhaCsvParaTitulo(linha.bruta));
      criados.push(await criarTitulo(sessao, tipo, dados, tx));
    }
    return criados;
  });
}
