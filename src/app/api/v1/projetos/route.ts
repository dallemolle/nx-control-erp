import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarProjetos } from "@/server/services/projeto";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const projetos = await listarProjetos(sessao.filialId);
    return Response.json(projetos, { status: 200 });
  });
}
