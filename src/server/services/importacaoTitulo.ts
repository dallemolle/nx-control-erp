import Papa from "papaparse";
import { prisma } from "@/server/db/client";
import { tituloSchema } from "@/lib/schemas/titulo";
import { criarTitulo } from "@/server/services/titulo";
import {
  carregarCadastrosParaResolucao,
  resolverContraparte,
  resolverCategoriaFinanceira,
  resolverCodigoOpcional,
  resolverContaBancariaOpcional,
} from "@/server/services/resolucaoCadastros";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { TipoTitulo } from "@prisma/client";

export type LinhaImportacao = {
  linha: number;
  bruta: Record<string, string>;
  erros: string[];
};

async function construirResolvedor(sessao: SessaoAtiva, tipo: TipoTitulo) {
  const cadastros = await carregarCadastrosParaResolucao(sessao, tipo);

  function resolverLinha(bruta: Record<string, string>): {
    dados: Record<string, unknown>;
    erros: string[];
    camposComErroResolucao: Set<string>;
  } {
    const erros: string[] = [];
    const camposComErroResolucao = new Set<string>();

    const contraparteId = resolverContraparte(cadastros, bruta.cnpjCpf ?? "", erros, camposComErroResolucao);
    const categoriaFinanceiraId = resolverCategoriaFinanceira(
      cadastros,
      bruta.categoriaFinanceira ?? "",
      erros,
      camposComErroResolucao,
    );
    const centroCustoId = resolverCodigoOpcional(cadastros.mapaCentroCusto, bruta.centroCusto, "Centro de custo", erros);
    const centroLucroId = resolverCodigoOpcional(cadastros.mapaCentroLucro, bruta.centroLucro, "Centro de lucro", erros);
    const safraId = resolverCodigoOpcional(cadastros.mapaSafra, bruta.safra, "Safra", erros);
    const projetoId = resolverCodigoOpcional(cadastros.mapaProjeto, bruta.projeto, "Projeto", erros);
    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      bruta.contaBancariaAgencia,
      bruta.contaBancariaConta,
      erros,
    );

    const dados = {
      contraparteId,
      documento: bruta.documento,
      dataEmissao: bruta.dataEmissao,
      dataCompetencia: bruta.dataCompetencia,
      categoriaFinanceiraId,
      centroCustoId,
      centroLucroId,
      safraId,
      projetoId,
      contaBancariaId,
      formaPagamento: bruta.formaPagamento,
      parcelas: [
        {
          numero: bruta.numeroParcela || "1",
          dataVencimento: bruta.dataVencimento,
          valorOriginal: bruta.valorOriginal,
        },
      ],
    };

    return { dados, erros, camposComErroResolucao };
  }

  return { resolverLinha };
}

export async function validarCsv(
  sessao: SessaoAtiva,
  tipo: TipoTitulo,
  conteudoCsv: string,
): Promise<LinhaImportacao[]> {
  const resultado = Papa.parse<Record<string, string>>(conteudoCsv, { header: true, skipEmptyLines: true });
  const { resolverLinha } = await construirResolvedor(sessao, tipo);

  return resultado.data.map((bruta, indice) => {
    const { dados, erros: errosResolucao, camposComErroResolucao } = resolverLinha(bruta);
    const parsed = tituloSchema.safeParse(dados);
    const errosSchema = parsed.success
      ? []
      : parsed.error.issues
          .filter((issue) => !camposComErroResolucao.has(String(issue.path[0])))
          .map((issue) => issue.message);
    return { linha: indice + 2, bruta, erros: [...errosResolucao, ...errosSchema] };
  });
}

export async function confirmarImportacao(sessao: SessaoAtiva, tipo: TipoTitulo, linhas: LinhaImportacao[]) {
  if (linhas.length === 0) {
    throw new Error("Nenhuma linha para importar");
  }
  if (linhas.some((linha) => linha.erros.length > 0)) {
    throw new Error("Existem linhas inválidas — corrija ou remova antes de importar");
  }

  const { resolverLinha } = await construirResolvedor(sessao, tipo);

  return prisma.$transaction(async (tx) => {
    const criados = [];
    for (const linha of linhas) {
      const { dados, erros } = resolverLinha(linha.bruta);
      if (erros.length > 0) {
        throw new Error("Existem linhas inválidas — corrija ou remova antes de importar");
      }
      const dadosValidados = tituloSchema.parse(dados);
      criados.push(await criarTitulo(sessao, tipo, dadosValidados, tx));
    }
    return criados;
  });
}
