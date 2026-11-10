import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { obterPedido } from "@/server/services/pedidoVenda";
import { gerarReciboPdf } from "@/lib/export/recibo";
import { ROTULOS_FORMA_PAGAMENTO_VENDA } from "@/lib/schemas/enums";
import { ROTULOS_SITUACAO_PAGAMENTO } from "@/lib/producao/venda";
import { hojeDeCalendario } from "@/lib/producao/periodo";

/** Recibo do pedido em PDF (A4), aberto no navegador para imprimir. */
export async function GET(_request: Request, ctx: { params: Promise<{ numero: string }> }) {
  const { numero: numeroBruto } = await ctx.params;
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "venda:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const numero = Number(numeroBruto);
  const pedido = Number.isInteger(numero) ? await obterPedido(sessao.filialId, numero, hojeDeCalendario()) : null;
  if (!pedido) return new Response("Pedido não encontrado", { status: 404 });

  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: sessao.empresaId },
    select: { nomeFantasia: true, razaoSocial: true, cnpjCpf: true },
  });

  const pdf = await gerarReciboPdf({
    empresa: empresa.nomeFantasia || empresa.razaoSocial,
    documentoEmpresa: empresa.cnpjCpf,
    numero: pedido.numero,
    data: pedido.data,
    cliente: pedido.cliente.nome,
    documentoCliente: pedido.cliente.cnpjCpf,
    itens: pedido.itens.map((item) => ({
      produto: item.lote.produto.descricao,
      lote: item.lote.codigo,
      quantidadeKg: Number(item.quantidadeKg),
      precoKg: Number(item.precoKg),
      valor: item.valor,
    })),
    total: pedido.totais.valor,
    formaPagamento: ROTULOS_FORMA_PAGAMENTO_VENDA[pedido.formaPagamento],
    situacao: ROTULOS_SITUACAO_PAGAMENTO[pedido.situacao],
    cancelado: pedido.status === "CANCELADO",
    observacao: pedido.observacao,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recibo-pedido-${pedido.numero}.pdf"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
