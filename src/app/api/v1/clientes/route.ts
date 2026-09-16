import { executarRotaApi } from "@/server/api/executarRotaApi";
import { requirePermission } from "@/server/auth/permissions";
import { listarClientes } from "@/server/services/cliente";

export async function GET(request: Request): Promise<Response> {
  return executarRotaApi(request, async (sessao) => {
    requirePermission(sessao.perfil, "cadastro:ler");
    const clientes = await listarClientes(sessao.empresaId);
    return Response.json(clientes, { status: 200 });
  });
}
