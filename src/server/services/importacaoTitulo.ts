import * as Papa from "papaparse";
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
import {
  normalizarChaveAcesso,
  resolverClassificacao,
  validarComprovante,
} from "@/server/services/classificacaoFiscal";
import { TIPO_COMPROVANTE } from "@/lib/schemas/enums";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { ClassificacaoFiscal, TipoComprovante, TipoTitulo } from "@prisma/client";

export type LinhaImportacao = {
  linha: number;
  bruta: Record<string, string>;
  erros: string[];
};

const CLASSIFICACAO_POR_SIGLA: Record<string, ClassificacaoFiscal> = {
  FISCAL: "FISCAL",
  F: "FISCAL",
  GERENCIAL: "GERENCIAL",
  G: "GERENCIAL",
};

/** Aceita FISCAL/GERENCIAL/F/G sem diferenciar maiúsculas; vazio = omitida. */
function classificacaoDaPlanilha(
  valor: string | undefined,
  erros: string[],
  camposComErro: Set<string>,
): ClassificacaoFiscal | undefined {
  const normalizado = valor?.trim().toUpperCase();
  if (!normalizado) return undefined;
  const classificacao = CLASSIFICACAO_POR_SIGLA[normalizado];
  if (!classificacao) {
    erros.push(`Classificação "${valor}" inválida — use FISCAL ou GERENCIAL`);
    camposComErro.add("classificacaoFiscal");
  }
  return classificacao;
}

function tipoComprovanteDaPlanilha(
  valor: string | undefined,
  erros: string[],
  camposComErro: Set<string>,
): TipoComprovante | undefined {
  const normalizado = valor?.trim().toUpperCase();
  if (!normalizado) return undefined;
  if (!(TIPO_COMPROVANTE as readonly string[]).includes(normalizado)) {
    erros.push(`Tipo de comprovante "${valor}" inválido — use um de: ${TIPO_COMPROVANTE.join(", ")}`);
    camposComErro.add("tipoComprovante");
    return undefined;
  }
  return normalizado as TipoComprovante;
}

async function construirResolvedor(sessao: SessaoAtiva, tipo: TipoTitulo) {
  const cadastros = await carregarCadastrosParaResolucao(sessao, tipo);

  function resolverLinha(bruta: Record<string, string>): {
    dados: Record<string, unknown>;
    erros: string[];
    camposComErroResolucao: Set<string>;
  } {
    const erros: string[] = [];
    const camposComErroResolucao = new Set<string>();

    // Passa o nome de campo interno do schema (não o rótulo da API) — é o que
    // a filtragem de duplicidade abaixo (`camposComErroResolucao.has(...)`) espera.
    const contraparteId = resolverContraparte(
      cadastros,
      bruta.cnpjCpf ?? "",
      erros,
      camposComErroResolucao,
      "contraparteId",
    );
    const categoriaFinanceiraId = resolverCategoriaFinanceira(
      cadastros,
      bruta.categoriaFinanceira ?? "",
      erros,
      camposComErroResolucao,
      "categoriaFinanceiraId",
    );
    const centroCustoId = resolverCodigoOpcional(
      cadastros.mapaCentroCusto,
      bruta.centroCusto,
      "Centro de custo",
      "centroCustoId",
      erros,
      camposComErroResolucao,
    );
    const centroLucroId = resolverCodigoOpcional(
      cadastros.mapaCentroLucro,
      bruta.centroLucro,
      "Centro de lucro",
      "centroLucroId",
      erros,
      camposComErroResolucao,
    );
    const safraId = resolverCodigoOpcional(
      cadastros.mapaSafra,
      bruta.safra,
      "Safra",
      "safraId",
      erros,
      camposComErroResolucao,
    );
    const projetoId = resolverCodigoOpcional(
      cadastros.mapaProjeto,
      bruta.projeto,
      "Projeto",
      "projetoId",
      erros,
      camposComErroResolucao,
    );
    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      bruta.contaBancariaAgencia,
      bruta.contaBancariaConta,
      erros,
      camposComErroResolucao,
    );

    // Colunas fiscais são opcionais: planilhas antigas (sem elas) continuam válidas.
    const classificacaoFiscal = classificacaoDaPlanilha(bruta.classificacaoFiscal, erros, camposComErroResolucao);
    const tipoComprovante = tipoComprovanteDaPlanilha(bruta.tipoComprovante, erros, camposComErroResolucao);
    const numeroDocumentoFiscal = bruta.numeroDocumentoFiscal?.trim() || undefined;
    const serieDocumentoFiscal = bruta.serieDocumentoFiscal?.trim() || undefined;
    const chaveAcesso = bruta.chaveAcesso ? normalizarChaveAcesso(bruta.chaveAcesso) || undefined : undefined;

    // Classificação informada é validada pelo schema; omitida, vale o padrão da contraparte.
    if (!classificacaoFiscal && contraparteId && !camposComErroResolucao.has("tipoComprovante")) {
      const resolvida = resolverClassificacao(undefined, cadastros.classificacaoPadraoPorContraparte.get(contraparteId));
      for (const erro of validarComprovante({
        classificacaoFiscal: resolvida,
        tipoComprovante: tipoComprovante ?? null,
        numeroDocumentoFiscal: numeroDocumentoFiscal ?? null,
        serieDocumentoFiscal: serieDocumentoFiscal ?? null,
        chaveAcesso: chaveAcesso ?? null,
      })) {
        erros.push(erro.mensagem);
        camposComErroResolucao.add(erro.campo);
      }
    }

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
      classificacaoFiscal,
      tipoComprovante,
      numeroDocumentoFiscal,
      serieDocumentoFiscal,
      chaveAcesso,
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
