import { Badge } from "@/components/ui/badge";
import { rotuloSituacaoPagamento, type SituacaoPagamento } from "@/lib/producao/venda";

export const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
export const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

const VARIANTE_SITUACAO: Record<SituacaoPagamento, "default" | "secondary" | "destructive" | "outline"> = {
  PAGO: "default",
  EM_ABERTO: "secondary",
  VENCIDO: "destructive",
  CANCELADO: "outline",
};

/** `naMaquininha`: quem deve é a operadora, então "em aberto" vira "Aguardando repasse". */
export function SituacaoPagamentoBadge({
  situacao,
  naMaquininha = false,
}: {
  situacao: SituacaoPagamento;
  naMaquininha?: boolean;
}) {
  return <Badge variant={VARIANTE_SITUACAO[situacao]}>{rotuloSituacaoPagamento(situacao, naMaquininha)}</Badge>;
}
