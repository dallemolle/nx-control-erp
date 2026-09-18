import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarSafras } from "@/server/services/safra";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const safras = await listarSafras(sessao.filialId);
    return Response.json(safras, { status: 200 });
  });
}
