import type { StatusParcela } from "@prisma/client";
import type { FiltroTitulos } from "@/server/services/titulo";
import { SEM_VALOR, STATUS_PARCELA } from "@/lib/schemas/enums";

/** Nomes dos params na URL, na ordem usada tanto pelas páginas quanto pelas rotas de export. */
export const CAMPOS_FILTRO_TITULOS = [
  "categoria",
  "contraparte",
  "centroCusto",
  "centroLucro",
  "safra",
  "projeto",
  "status",
  "vencimentoDe",
  "vencimentoAte",
] as const;

function valorOuUndefined(valor: string | undefined): string | undefined {
  return valor && valor.length > 0 && valor !== SEM_VALOR ? valor : undefined;
}

function statusOuUndefined(valor: string | undefined): StatusParcela | undefined {
  return valor !== undefined && (STATUS_PARCELA as readonly string[]).includes(valor)
    ? (valor as StatusParcela)
    : undefined;
}

function dataInicioDoDiaOuUndefined(valor: string | undefined): Date | undefined {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const data = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) return undefined;
  return data;
}

function dataFimDoDiaOuUndefined(valor: string | undefined): Date | undefined {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const data = new Date(`${valor}T23:59:59.999Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) return undefined;
  return data;
}

export function filtroTitulosDaUrl(get: (campo: string) => string | undefined): FiltroTitulos {
  return {
    categoriaId: valorOuUndefined(get("categoria")),
    contraparteId: valorOuUndefined(get("contraparte")),
    centroCustoId: valorOuUndefined(get("centroCusto")),
    centroLucroId: valorOuUndefined(get("centroLucro")),
    safraId: valorOuUndefined(get("safra")),
    projetoId: valorOuUndefined(get("projeto")),
    status: statusOuUndefined(get("status")),
    vencimentoDe: dataInicioDoDiaOuUndefined(get("vencimentoDe")),
    vencimentoAte: dataFimDoDiaOuUndefined(get("vencimentoAte")),
  };
}

export function algumFiltroAtivo(filtros: FiltroTitulos): boolean {
  return Object.values(filtros).some((valor) => valor !== undefined);
}

export function queryStringDosFiltros(get: (campo: string) => string | undefined): string {
  return CAMPOS_FILTRO_TITULOS.map((campo) => [campo, get(campo)] as const)
    .filter(([, valor]) => valor !== undefined && valor.length > 0 && valor !== SEM_VALOR)
    .map(([campo, valor]) => `${campo}=${encodeURIComponent(valor as string)}`)
    .join("&");
}
