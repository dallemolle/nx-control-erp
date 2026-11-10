import type { StatusEntrega } from "@prisma/client";
import { STATUS_ENTREGA } from "@/lib/schemas/enums";
import { dataDaUrl } from "@/lib/producao/periodo";
import type { FiltroEntregas } from "@/server/services/entrega";

export type ParametrosEntregas = { status?: string; inicio?: string; fim?: string };

export const TODAS = "TODAS";

/** Status vazio = pendentes e em rota (padrão do serviço); período só se informado. */
export function filtrosDeEntregas(sp: ParametrosEntregas): FiltroEntregas {
  let status: StatusEntrega[] | undefined;
  if (sp.status === TODAS) status = [...STATUS_ENTREGA];
  else if ((STATUS_ENTREGA as readonly string[]).includes(sp.status ?? "")) status = [sp.status as StatusEntrega];
  return { status, inicio: dataDaUrl(sp.inicio), fim: dataDaUrl(sp.fim) };
}
