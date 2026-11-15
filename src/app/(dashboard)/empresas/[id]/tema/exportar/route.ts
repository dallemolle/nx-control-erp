import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { temaAplicavel } from "@/server/services/temaEmpresa";

/** Download do tema atual da empresa (formato nx-tema), para editar ou reaproveitar. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "empresa:gerenciar")) {
    return new Response("Acesso negado", { status: 403 });
  }
  const { id } = await ctx.params;
  const empresa = await prisma.empresa.findUnique({ where: { id }, select: { nomeFantasia: true, tema: true } });
  const tema = empresa ? temaAplicavel(empresa.tema) : null;
  if (!empresa || !tema) return new Response("Empresa sem tema", { status: 404 });

  const nome = empresa.nomeFantasia
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return new Response(`${JSON.stringify(tema, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tema-${nome || "empresa"}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
