import { executarRotaApi, ErroValidacaoApi } from "@/server/api/executarRotaApi";
import { carregarCadastrosParaResolucao, resolverContaBancariaOpcional } from "@/server/services/resolucaoCadastros";
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
    const corpo = (await request.json()) as CorpoBaixa;

    // "PAGAR" arbitrário — baixa não tem contraparte, só a conta bancária é resolvida aqui.
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
    if (erros.length > 0) {
      throw new ErroValidacaoApi(erros.join("; "));
    }

    const dados = baixaSchema.parse({
      data: corpo.data,
      valorPago: corpo.valorPago,
      valorJuros: corpo.valorJuros ?? 0,
      valorMulta: corpo.valorMulta ?? 0,
      valorDesconto: corpo.valorDesconto ?? 0,
      contaBancariaId,
    });

    const baixa = await registrarBaixa(sessao, corpo.parcelaId, dados);
    return Response.json(baixa, { status: 201 });
  });
}
