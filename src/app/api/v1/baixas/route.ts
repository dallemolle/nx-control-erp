import { executarRotaApi, ErroValidacaoApi } from "@/server/api/executarRotaApi";
import { carregarContaBancariaParaResolucao, resolverContaBancariaOpcional } from "@/server/services/resolucaoCadastros";
import { baixaSchema } from "@/lib/schemas/baixa";
import { registrarBaixa } from "@/server/services/baixa";

type CorpoBaixa = {
  parcelaId: string;
  data: string;
  valorPago: number;
  valorJuros?: number;
  valorMulta?: number;
  valorDesconto?: number;
  contaBancariaAgencia: string;
  contaBancariaConta: string;
};

export async function POST(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    let corpo: CorpoBaixa;
    try {
      corpo = await request.json();
    } catch {
      throw new ErroValidacaoApi("Corpo da requisição não é um JSON válido", []);
    }

    if (typeof corpo?.parcelaId !== "string" || !corpo.parcelaId) {
      throw new ErroValidacaoApi("Informe parcelaId", ["parcelaId"]);
    }

    const cadastros = await carregarContaBancariaParaResolucao(sessao);
    const erros: string[] = [];
    const camposComErroResolucao = new Set<string>();
    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      corpo.contaBancariaAgencia,
      corpo.contaBancariaConta,
      erros,
      camposComErroResolucao,
    );
    if (!contaBancariaId && erros.length === 0) {
      erros.push("Informe a conta bancária (agência e conta)");
    }
    if (erros.length > 0) {
      throw new ErroValidacaoApi(erros.join("; "), Array.from(camposComErroResolucao));
    }

    const dados = baixaSchema.parse({
      data: corpo.data,
      valorPago: corpo.valorPago,
      valorJuros: corpo.valorJuros,
      valorMulta: corpo.valorMulta,
      valorDesconto: corpo.valorDesconto,
      contaBancariaId,
    });

    const baixa = await registrarBaixa(sessao, corpo.parcelaId, dados);
    return Response.json(baixa, { status: 201 });
  });
}
