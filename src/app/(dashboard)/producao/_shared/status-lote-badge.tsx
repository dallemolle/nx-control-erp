import { Badge } from "@/components/ui/badge";
import { ROTULOS_STATUS_LOTE, type StatusLote } from "@/lib/producao/statusLote";

const VARIANTE_STATUS: Record<StatusLote, "default" | "secondary" | "destructive" | "outline"> = {
  OK: "default",
  VENCENDO: "secondary",
  VENCIDO: "destructive",
  ZERADO: "outline",
};

export function StatusLoteBadge({ status }: { status: StatusLote }) {
  return <Badge variant={VARIANTE_STATUS[status]}>{ROTULOS_STATUS_LOTE[status]}</Badge>;
}
