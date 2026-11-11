import type { StatusOrdemProducao } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { ROTULOS_STATUS_ORDEM_PRODUCAO } from "@/lib/schemas/enums";
import {
  ROTULOS_STATUS_BRANQUEAMENTO,
  ROTULOS_STATUS_VERIFICACAO,
  type StatusBranqueamento,
  type StatusVerificacao,
} from "@/lib/producao/op";

export const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
export const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

const VARIANTE_STATUS: Record<StatusOrdemProducao, "default" | "secondary" | "outline"> = {
  ABERTA: "secondary",
  ENCERRADA: "default",
  CANCELADA: "outline",
};

export function StatusOPBadge({ status }: { status: StatusOrdemProducao }) {
  return <Badge variant={VARIANTE_STATUS[status]}>{ROTULOS_STATUS_ORDEM_PRODUCAO[status]}</Badge>;
}

export function VerificacaoBadge({ status }: { status: StatusVerificacao }) {
  return (
    <Badge variant={status === "OK" ? "secondary" : "destructive"}>{ROTULOS_STATUS_VERIFICACAO[status]}</Badge>
  );
}

export function BranqueamentoBadge({ status }: { status: StatusBranqueamento }) {
  if (status === "NAO_SE_APLICA") {
    return <span className="text-muted-foreground">{ROTULOS_STATUS_BRANQUEAMENTO[status]}</span>;
  }
  return (
    <Badge variant={status === "OK" ? "secondary" : "destructive"}>{ROTULOS_STATUS_BRANQUEAMENTO[status]}</Badge>
  );
}
