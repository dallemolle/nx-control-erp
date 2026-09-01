import { get } from "@vercel/blob";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { buscarAnexoDaFilial } from "@/server/services/anexo";

/**
 * Serve o conteúdo de um anexo. Os blobs são gravados com `access: "private"`, logo a
 * URL do Vercel Blob não é buscável direto pelo navegador — este handler é o único
 * caminho de leitura e revalida sessão + escopo de filial a cada download.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ anexoId: string }> }) {
  const { anexoId } = await ctx.params;
  const sessao = await requireSessaoAtiva();

  if (!podeExecutar(sessao.perfil, "titulo:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const anexo = await buscarAnexoDaFilial(sessao.filialId, anexoId);
  if (!anexo) {
    return new Response("Anexo não encontrado", { status: 404 });
  }

  const resultado = await get(anexo.url, { access: "private" });
  if (!resultado || resultado.statusCode !== 200) {
    return new Response("Anexo não encontrado", { status: 404 });
  }

  return new Response(resultado.stream, {
    headers: {
      "Content-Type": resultado.blob.contentType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(anexo.nomeArquivo)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
