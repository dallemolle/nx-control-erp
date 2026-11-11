import { STATUS_ORDEM_PRODUCAO } from "@/lib/schemas/enums";
import { periodoDaUrl } from "@/lib/producao/periodo";
import { VERIFICAR_OP, type VerificarOP } from "@/lib/producao/op";
import type { FiltroOPs } from "@/server/services/ordemProducao";

export type ParametrosOPs = { inicio?: string; fim?: string; fruta?: string; status?: string; verificar?: string };

/** Filtros da lista e da exportação de OPs, lidos da URL (período padrão: mês atual). */
export function filtrosDasOPs(sp: ParametrosOPs): FiltroOPs {
  const status = (STATUS_ORDEM_PRODUCAO as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as (typeof STATUS_ORDEM_PRODUCAO)[number])
    : undefined;
  const verificar = (VERIFICAR_OP as string[]).includes(sp.verificar ?? "") ? (sp.verificar as VerificarOP) : undefined;
  return { ...periodoDaUrl(sp), frutaId: sp.fruta || undefined, status, verificar };
}
