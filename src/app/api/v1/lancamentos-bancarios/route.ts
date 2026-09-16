import { executarRotaApi, ErroValidacaoApi } from "@/server/api/executarRotaApi";
import {
  carregarCadastrosParaResolucao,
  resolverCodigoOpcional,
  resolverContaBancariaOpcional,
} from "@/server/services/resolucaoCadastros";
import { lancamentoManualSchema } from "@/lib/schemas/lancamentoBancario";
import { criarLancamentoManual, listarLancamentos } from "@/server/services/lancamentoBancario";
import { requirePermission } from "@/server/auth/permissions";

type CorpoLancamento = {
  contaBancariaAgencia: string;
  contaBancariaConta: string;
  data: string;
  tipo: "ENTRADA" | "SAIDA";
  valor: number;
  descricao: string;
  categoriaFinanceira?: string;
  centroCusto?: string;
  centroLucro?: string;
  safra?: string;
  projeto?: string;
};

export async function POST(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    const corpo = (await request.json()) as CorpoLancamento;

    // "PAGAR" é arbitrário aqui — lançamento não tem contraparte, então mapaContraparte/rotuloContraparte
    // resultantes não são usados; só as demais dimensões (categoria, centros, safra, projeto, conta) importam.
    const cadastros = await carregarCadastrosParaResolucao(sessao, "PAGAR");
    const erros: string[] = [];

    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      corpo.contaBancariaAgencia,
      corpo.contaBancariaConta,
      erros,
    );
    if (!contaBancariaId) {
      erros.push("Informe a conta bancária (agência e conta)");
    }
    const categoriaFinanceiraId = resolverCodigoOpcional(
      cadastros.mapaCategoria,
      corpo.categoriaFinanceira,
      "Categoria financeira",
      erros,
    );
    const centroCustoId = resolverCodigoOpcional(cadastros.mapaCentroCusto, corpo.centroCusto, "Centro de custo", erros);
    const centroLucroId = resolverCodigoOpcional(cadastros.mapaCentroLucro, corpo.centroLucro, "Centro de lucro", erros);
    const safraId = resolverCodigoOpcional(cadastros.mapaSafra, corpo.safra, "Safra", erros);
    const projetoId = resolverCodigoOpcional(cadastros.mapaProjeto, corpo.projeto, "Projeto", erros);

    if (erros.length > 0) {
      throw new ErroValidacaoApi(erros.join("; "));
    }

    const dados = lancamentoManualSchema.parse({
      contaBancariaId,
      data: corpo.data,
      tipo: corpo.tipo,
      valor: corpo.valor,
      descricao: corpo.descricao,
      categoriaFinanceiraId,
      centroCustoId,
      centroLucroId,
      safraId,
      projetoId,
    });

    const lancamento = await criarLancamentoManual(sessao, dados);
    return Response.json(lancamento, { status: 201 });
  });
}

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "lancamento:ler");
    const lancamentos = await listarLancamentos(sessao.filialId);
    return Response.json(lancamentos, { status: 200 });
  });
}
