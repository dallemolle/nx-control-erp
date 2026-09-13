import type { StatusParcela } from "@prisma/client";
import type { FiltroTitulos } from "@/server/services/titulo";
import { SEM_VALOR } from "@/lib/schemas/enums";

const STATUS_VALIDOS: StatusParcela[] = [
  "EM_ABERTO",
  "A_VENCER",
  "VENCIDO",
  "PARCIALMENTE_PAGO",
  "PAGO",
  "CANCELADO",
  "RENEGOCIADO",
];

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
  return STATUS_VALIDOS.includes(valor as StatusParcela) ? (valor as StatusParcela) : undefined;
}

function dataOuUndefined(valor: string | undefined): Date | undefined {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const data = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(data.getTime()) ? undefined : data;
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
    vencimentoDe: dataOuUndefined(get("vencimentoDe")),
    vencimentoAte: dataOuUndefined(get("vencimentoAte")),
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
