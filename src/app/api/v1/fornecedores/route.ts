import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarFornecedores } from "@/server/services/fornecedor";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const fornecedores = await listarFornecedores(sessao.empresaId);
    return Response.json(fornecedores, { status: 200 });
  });
}
