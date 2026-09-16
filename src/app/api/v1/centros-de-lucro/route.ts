import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarCentrosLucro } from "@/server/services/centroLucro";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const centrosLucro = await listarCentrosLucro(sessao.filialId);
    return Response.json(centrosLucro, { status: 200 });
  });
}
