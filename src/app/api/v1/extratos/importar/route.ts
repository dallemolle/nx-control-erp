import { Prisma } from "@prisma/client";
import { executarRotaApi, ErroValidacaoApi } from "@/server/api/executarRotaApi";
import { carregarContaBancariaParaResolucao, resolverContaBancariaOpcional } from "@/server/services/resolucaoCadastros";
import { importarExtratoOfx, conciliarAutomaticamente } from "@/server/services/conciliacao";
import { PermissionError, FilialSomenteLeituraError } from "@/server/auth/permissions";

export async function POST(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    const formData = await request.formData();
    const arquivo = formData.get("arquivo");
    const agencia = formData.get("contaBancariaAgencia");
    const conta = formData.get("contaBancariaConta");

    if (!(arquivo instanceof File)) {
      throw new ErroValidacaoApi("Envie o arquivo OFX no campo 'arquivo'", ["arquivo"]);
    }

    const cadastros = await carregarContaBancariaParaResolucao(sessao);
    const erros: string[] = [];
    const camposComErroResolucao = new Set<string>();
    const contaBancariaId = resolverContaBancariaOpcional(
      cadastros,
      typeof agencia === "string" ? agencia : undefined,
      typeof conta === "string" ? conta : undefined,
      erros,
      camposComErroResolucao,
    );
    if (!contaBancariaId && erros.length === 0) {
      erros.push("Informe a conta bancária (agência e conta)");
    }
    if (erros.length > 0) {
      throw new ErroValidacaoApi(erros.join("; "), Array.from(camposComErroResolucao));
    }

    let extrato;
    try {
      extrato = await importarExtratoOfx(sessao, contaBancariaId, arquivo);
    } catch (erro) {
      if (
        erro instanceof PermissionError ||
        erro instanceof FilialSomenteLeituraError ||
        erro instanceof Prisma.PrismaClientKnownRequestError ||
        erro instanceof Prisma.PrismaClientUnknownRequestError ||
        erro instanceof Prisma.PrismaClientValidationError ||
        erro instanceof Prisma.PrismaClientInitializationError ||
        erro instanceof Prisma.PrismaClientRustPanicError
      ) {
        throw erro;
      }
      if (erro instanceof Error) {
        throw new ErroValidacaoApi(erro.message, ["arquivo"]);
      }
      throw erro;
    }
    const resumoConciliacao = await conciliarAutomaticamente(sessao, extrato.id);

    return Response.json({ ...extrato, ...resumoConciliacao }, { status: 201 });
  });
}
