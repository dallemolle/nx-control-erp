import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { listarPedidos, type PedidoListado } from "@/server/services/pedidoVenda";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import {
  ROTULOS_CANAL_VENDA,
  ROTULOS_FORMA_PAGAMENTO_VENDA,
  ROTULOS_STATUS_ENTREGA,
  ROTULOS_STATUS_PEDIDO_VENDA,
} from "@/lib/schemas/enums";
import { ROTULOS_SITUACAO_PAGAMENTO } from "@/lib/producao/venda";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario } from "@/lib/producao/periodo";
import { filtrosDePedidos } from "../filtros";

const COLUNAS: ColunaExport<PedidoListado>[] = [
  { rotulo: "Nº", tipo: "inteiro", valor: (p) => p.numero },
  { rotulo: "Data", valor: (p) => p.data },
  { rotulo: "Cliente", valor: (p) => p.cliente.nome },
  { rotulo: "Canal", valor: (p) => (p.canal ? ROTULOS_CANAL_VENDA[p.canal] : "") },
  { rotulo: "Forma", valor: (p) => ROTULOS_FORMA_PAGAMENTO_VENDA[p.formaPagamento] },
  { rotulo: "Valor", valor: (p) => p.valor },
  { rotulo: "Custo", valor: (p) => p.custo },
  { rotulo: "Margem", valor: (p) => p.margem },
  { rotulo: "Margem (%)", tipo: "percentual", valor: (p) => p.margemPercentual * 100 },
  { rotulo: "Pagamento", valor: (p) => ROTULOS_SITUACAO_PAGAMENTO[p.situacao] },
  { rotulo: "Status", valor: (p) => ROTULOS_STATUS_PEDIDO_VENDA[p.status] },
  { rotulo: "Entrega", valor: (p) => (p.entrega ? ROTULOS_STATUS_ENTREGA[p.entrega.status] : "Retira") },
  { rotulo: "Nota fiscal", valor: (p) => p.numeroDocumentoFiscal ?? "" },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "venda:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const filtros = filtrosDePedidos(Object.fromEntries(url.searchParams));
  const pedidos = await listarPedidos(sessao.filialId, filtros, hojeDeCalendario());

  return responderExport(pedidos, COLUNAS, {
    nomeArquivo: "pedidos-de-venda",
    nomeAba: "Pedidos",
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: async () => {
      const cliente = filtros.clienteId
        ? await prisma.cliente.findFirst({
            where: { id: filtros.clienteId, empresaId: sessao.empresaId },
            select: { nome: true },
          })
        : null;
      return cabecalhoDoRelatorio(sessao, {
        titulo: "Pedidos de venda",
        filtros: [
          `Período: ${formatarData(filtros.inicio)} a ${formatarData(filtros.fim)}`,
          cliente ? `Cliente: ${cliente.nome}` : null,
          filtros.status ? `Status: ${ROTULOS_STATUS_PEDIDO_VENDA[filtros.status]}` : null,
          filtros.situacao ? `Pagamento: ${ROTULOS_SITUACAO_PAGAMENTO[filtros.situacao]}` : null,
        ],
      });
    },
  });
}
