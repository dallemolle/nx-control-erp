import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { obterConfiguracaoProducao } from "@/server/services/configuracaoProducao";
import { bloqueioDaProducao } from "@/server/services/estoque";
import { gerarEtiquetaPdf } from "@/lib/export/etiqueta";
import { arredondar } from "@/lib/producao/arredondar";

/** Etiqueta do lote em PDF (100 × 70 mm), uma página por embalagem, aberta no navegador para imprimir. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const lote = await prisma.lote.findFirst({
    where: { id, filialId: sessao.filialId },
    include: {
      produto: { select: { descricao: true, armazenamento: true, textoEtiqueta: true } },
      filial: { select: { cnpjCpf: true, empresa: { select: { nomeFantasia: true, razaoSocial: true } } } },
      producaoOP: {
        select: {
          embalagens: true,
          quantidadeKg: true,
          removidoEm: true,
          ordemProducao: { select: { status: true } },
        },
      },
    },
  });
  if (!lote) return new Response("Lote não encontrado", { status: 404 });

  // Polpa só ganha etiqueta depois de a OP ser encerrada (D-07).
  const bloqueio = bloqueioDaProducao({ codigo: lote.codigo, producaoOP: lote.producaoOP });
  if (bloqueio) {
    const aberta = lote.producaoOP?.ordemProducao.status === "ABERTA" && !lote.producaoOP.removidoEm;
    return new Response(aberta ? "Encerre a OP antes de imprimir a etiqueta" : bloqueio, { status: 409 });
  }

  const embalagens = lote.producaoOP?.embalagens ?? null;
  const pesoLiquidoKg = embalagens
    ? arredondar(Number(lote.producaoOP!.quantidadeKg) / embalagens, 3)
    : Number(lote.quantidadeInicialKg);

  const configuracao = await obterConfiguracaoProducao(sessao.filialId);
  const pdf = await gerarEtiquetaPdf({
    empresa: lote.filial.empresa.nomeFantasia || lote.filial.empresa.razaoSocial,
    produto: lote.produto.descricao,
    codigoLote: lote.codigo,
    rotuloData: lote.origem === "PRODUCAO" ? "Fabricação" : "Recepção",
    data: lote.data,
    validade: lote.validade,
    armazenamento: lote.produto.armazenamento,
    pesoLiquidoKg,
    registroAdepara: configuracao.registroAdepara,
    cnpj: lote.filial.cnpjCpf,
    endereco: configuracao.enderecoEtiqueta,
    texto: lote.produto.textoEtiqueta,
    copias: embalagens ?? 1,
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
