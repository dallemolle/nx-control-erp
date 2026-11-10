import { STATUS_PEDIDO_VENDA } from "@/lib/schemas/enums";
import { periodoDaUrl } from "@/lib/producao/periodo";
import { SITUACOES_PAGAMENTO, type SituacaoPagamento } from "@/lib/producao/venda";
import type { FiltroPedidos } from "@/server/services/pedidoVenda";

export type ParametrosPedidos = {
  inicio?: string;
  fim?: string;
  cliente?: string;
  status?: string;
  situacao?: string;
};

/** Filtros da lista e da exportação de pedidos, lidos da URL (período padrão: mês atual). */
export function filtrosDePedidos(sp: ParametrosPedidos): FiltroPedidos {
  const status = (STATUS_PEDIDO_VENDA as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as (typeof STATUS_PEDIDO_VENDA)[number])
    : undefined;
  const situacao = (SITUACOES_PAGAMENTO as readonly string[]).includes(sp.situacao ?? "")
    ? (sp.situacao as SituacaoPagamento)
    : undefined;
  return { ...periodoDaUrl(sp), clienteId: sp.cliente || undefined, status, situacao };
}
