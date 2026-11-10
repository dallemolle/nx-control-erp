import { Badge } from "@/components/ui/badge";
import { ROTULOS_SITUACAO_PAGAMENTO, type SituacaoPagamento } from "@/lib/producao/venda";

export const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
export const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

const VARIANTE_SITUACAO: Record<SituacaoPagamento, "default" | "secondary" | "destructive" | "outline"> = {
  PAGO: "default",
  EM_ABERTO: "secondary",
  VENCIDO: "destructive",
  CANCELADO: "outline",
};

export function SituacaoPagamentoBadge({ situacao }: { situacao: SituacaoPagamento }) {
  return <Badge variant={VARIANTE_SITUACAO[situacao]}>{ROTULOS_SITUACAO_PAGAMENTO[situacao]}</Badge>;
}
