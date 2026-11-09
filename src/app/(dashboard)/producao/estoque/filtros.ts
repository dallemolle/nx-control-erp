import { STATUS_LOTE, type StatusLote } from "@/lib/producao/statusLote";
import { dataDaUrl, hojeDeCalendario } from "@/lib/producao/periodo";
import type { FiltroLotes } from "@/server/services/estoque";

export type ParametrosEstoque = {
  visao?: string;
  produto?: string;
  local?: string;
  status?: string;
  zerados?: string;
  referencia?: string;
};

/** Filtros da tela e da exportação de estoque, lidos da URL. */
export function filtrosDoEstoque(sp: ParametrosEstoque): { filtros: FiltroLotes; referencia: Date } {
  const status = (STATUS_LOTE as string[]).includes(sp.status ?? "") ? (sp.status as StatusLote) : undefined;
  return {
    filtros: {
      produtoId: sp.produto || undefined,
      localId: sp.local || undefined,
      status,
      incluirZerados: sp.zerados === "1",
    },
    referencia: dataDaUrl(sp.referencia) ?? hojeDeCalendario(),
  };
}
