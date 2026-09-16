import { executarRotaApi, ErroValidacaoApi } from "@/server/api/executarRotaApi";
import { carregarCadastrosParaResolucao, resolverContaBancariaOpcional } from "@/server/services/resolucaoCadastros";
import { importarExtratoOfx, conciliarAutomaticamente } from "@/server/services/conciliacao";

export async function POST(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    const formData = await request.formData();
    const arquivo = formData.get("arquivo");
    const agencia = formData.get("contaBancariaAgencia");
    const conta = formData.get("contaBancariaConta");

    if (!(arquivo instanceof File)) {
      throw new ErroValidacaoApi("Envie o arquivo OFX no campo 'arquivo'", ["arquivo"]);
    }

    // "PAGAR" arbitrário — só a conta bancária é resolvida aqui.
    const cadastros = await carregarCadastrosParaResolucao(sessao, "PAGAR");
    const erros: string[] = [];
    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      typeof agencia === "string" ? agencia : undefined,
      typeof conta === "string" ? conta : undefined,
      erros,
    );
    if (!contaBancariaId) {
      erros.push("Informe a conta bancária (agência e conta)");
    }
    if (erros.length > 0) {
      throw new ErroValidacaoApi(erros.join("; "));
    }

    const extrato = await importarExtratoOfx(sessao, contaBancariaId, arquivo);
    const resumoConciliacao = await conciliarAutomaticamente(sessao, extrato.id);

    return Response.json({ ...extrato, ...resumoConciliacao }, { status: 201 });
  });
}
