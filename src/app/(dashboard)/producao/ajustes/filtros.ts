import { MOTIVO_AJUSTE_ESTOQUE } from "@/lib/schemas/enums";
import { periodoDaUrl } from "@/lib/producao/periodo";
import type { FiltroAjustes } from "@/server/services/ajusteEstoque";

export type ParametrosAjustes = { inicio?: string; fim?: string; motivo?: string };

/** Filtros da tela e da exportação de ajustes, lidos da URL. */
export function filtrosDosAjustes(sp: ParametrosAjustes): FiltroAjustes {
  const motivo = (MOTIVO_AJUSTE_ESTOQUE as readonly string[]).includes(sp.motivo ?? "")
    ? (sp.motivo as (typeof MOTIVO_AJUSTE_ESTOQUE)[number])
    : undefined;
  return { ...periodoDaUrl(sp), motivo };
}
