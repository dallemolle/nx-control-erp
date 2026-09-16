import { executarRotaApi, ErroValidacaoApi } from "@/server/api/executarRotaApi";
import {
  carregarCadastrosParaResolucao,
  resolverContraparte,
  resolverCategoriaFinanceira,
  resolverCodigoOpcional,
  resolverContaBancariaOpcional,
} from "@/server/services/resolucaoCadastros";
import { tituloSchema } from "@/lib/schemas/titulo";
import { criarTitulo, listarTitulos } from "@/server/services/titulo";
import { requirePermission } from "@/server/auth/permissions";
import type { TipoTitulo } from "@prisma/client";

type CorpoTitulo = {
  tipo: TipoTitulo;
  cnpjCpf: string;
  documento: string;
  dataEmissao: string;
  dataCompetencia: string;
  categoriaFinanceira: string;
  centroCusto?: string;
  centroLucro?: string;
  safra?: string;
  projeto?: string;
  contaBancariaAgencia?: string;
  contaBancariaConta?: string;
  formaPagamento?: string;
  parcelas: { dataVencimento: string; valorOriginal: number }[];
};

export async function POST(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    let corpo: CorpoTitulo;
    try {
      corpo = await request.json();
    } catch {
      throw new ErroValidacaoApi("Corpo da requisição não é um JSON válido", []);
    }

    if (corpo?.tipo !== "PAGAR" && corpo?.tipo !== "RECEBER") {
      throw new ErroValidacaoApi('Informe "tipo": "PAGAR" ou "RECEBER"', ["tipo"]);
    }
    if (!Array.isArray(corpo?.parcelas) || corpo.parcelas.length === 0) {
      throw new ErroValidacaoApi("Informe ao menos uma parcela", ["parcelas"]);
    }

    const cadastros = await carregarCadastrosParaResolucao(sessao, corpo.tipo);
    const erros: string[] = [];
    const camposComErroResolucao = new Set<string>();

    const contraparteId = resolverContraparte(cadastros, corpo.cnpjCpf ?? "", erros, camposComErroResolucao);
    const categoriaFinanceiraId = resolverCategoriaFinanceira(
      cadastros,
      corpo.categoriaFinanceira ?? "",
      erros,
      camposComErroResolucao,
    );
    const centroCustoId = resolverCodigoOpcional(
      cadastros.mapaCentroCusto,
      corpo.centroCusto,
      "Centro de custo",
      "centroCusto",
      erros,
      camposComErroResolucao,
    );
    const centroLucroId = resolverCodigoOpcional(
      cadastros.mapaCentroLucro,
      corpo.centroLucro,
      "Centro de lucro",
      "centroLucro",
      erros,
      camposComErroResolucao,
    );
    const safraId = resolverCodigoOpcional(
      cadastros.mapaSafra,
      corpo.safra,
      "Safra",
      "safra",
      erros,
      camposComErroResolucao,
    );
    const projetoId = resolverCodigoOpcional(
      cadastros.mapaProjeto,
      corpo.projeto,
      "Projeto",
      "projeto",
      erros,
      camposComErroResolucao,
    );
    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      corpo.contaBancariaAgencia,
      corpo.contaBancariaConta,
      erros,
      camposComErroResolucao,
    );

    if (erros.length > 0) {
      throw new ErroValidacaoApi(erros.join("; "), Array.from(camposComErroResolucao));
    }

    const dados = tituloSchema.parse({
      contraparteId,
      documento: corpo.documento,
      dataEmissao: corpo.dataEmissao,
      dataCompetencia: corpo.dataCompetencia,
      categoriaFinanceiraId,
      centroCustoId,
      centroLucroId,
      safraId,
      projetoId,
      contaBancariaId,
      formaPagamento: corpo.formaPagamento,
      parcelas: corpo.parcelas.map((parcela, indice) => ({
        numero: indice + 1,
        dataVencimento: parcela.dataVencimento,
        valorOriginal: parcela.valorOriginal,
      })),
    });

    const titulo = await criarTitulo(sessao, corpo.tipo, dados);
    return Response.json(titulo, { status: 201 });
  });
}

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "titulo:ler");

    const url = new URL(request.url);
    const tipo = url.searchParams.get("tipo");
    if (tipo !== "PAGAR" && tipo !== "RECEBER") {
      throw new ErroValidacaoApi('Informe ?tipo=PAGAR ou ?tipo=RECEBER', ["tipo"]);
    }

    const titulos = await listarTitulos(sessao.filialId, tipo);
    return Response.json(titulos, { status: 200 });
  });
}
