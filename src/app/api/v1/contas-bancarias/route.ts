import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarContasBancarias } from "@/server/services/contaBancaria";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const contasBancarias = await listarContasBancarias(sessao.filialId);
    return Response.json(contasBancarias, { status: 200 });
  });
}
