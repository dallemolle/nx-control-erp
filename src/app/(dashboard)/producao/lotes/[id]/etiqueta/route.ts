import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { obterConfiguracaoProducao } from "@/server/services/configuracaoProducao";
import { gerarEtiquetaPdf } from "@/lib/export/etiqueta";

/** Etiqueta do lote em PDF (100 × 70 mm), aberta no navegador para imprimir. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const lote = await prisma.lote.findFirst({
    where: { id, filialId: sessao.filialId },
    include: {
      produto: { select: { descricao: true, armazenamento: true } },
      filial: { select: { empresa: { select: { nomeFantasia: true, razaoSocial: true } } } },
    },
  });
  if (!lote) return new Response("Lote não encontrado", { status: 404 });

  const configuracao = await obterConfiguracaoProducao(sessao.filialId);
  const pdf = await gerarEtiquetaPdf({
    empresa: lote.filial.empresa.nomeFantasia || lote.filial.empresa.razaoSocial,
    produto: lote.produto.descricao,
    codigoLote: lote.codigo,
    rotuloData: lote.origem === "PRODUCAO" ? "Fabricação" : "Recepção",
    data: lote.data,
    validade: lote.validade,
    armazenamento: lote.produto.armazenamento,
    pesoLiquidoKg: Number(lote.quantidadeInicialKg),
    registroAdepara: configuracao.registroAdepara,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiqueta-${lote.codigo}.pdf"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
