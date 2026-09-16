import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarCentrosCusto } from "@/server/services/centroCusto";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const centrosCusto = await listarCentrosCusto(sessao.filialId);
    return Response.json(centrosCusto, { status: 200 });
  });
}
