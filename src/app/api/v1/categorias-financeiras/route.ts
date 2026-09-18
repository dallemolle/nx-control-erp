import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarCategoriasFinanceiras } from "@/server/services/categoriaFinanceira";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const categorias = await listarCategoriasFinanceiras(sessao.filialId);
    return Response.json(categorias, { status: 200 });
  });
}
