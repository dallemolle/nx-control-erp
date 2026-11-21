import { SEM_VALOR } from "@/lib/schemas/enums";
import type { FiltroAuditoria } from "@/server/services/auditoria";

function valorOuUndefined(valor: string | undefined): string | undefined {
  return valor && valor.length > 0 && valor !== SEM_VALOR ? valor : undefined;
}

/**
 * O dia do filtro é o dia de Brasília, como a coluna Data/hora mostra: vai de 00:00 a 23:59:59,999 em UTC-3 (sem
 * horário de verão desde 2019). Antes era o dia UTC, e o que acontecia depois das 21h caía no dia seguinte.
 */
const FUSO_BRASILIA = "-03:00";

function dataValida(valor: string | undefined): valor is string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

function dataInicioDoDiaOuUndefined(valor: string | undefined): Date | undefined {
  return dataValida(valor) ? new Date(`${valor}T00:00:00.000${FUSO_BRASILIA}`) : undefined;
}

function dataFimDoDiaOuUndefined(valor: string | undefined): Date | undefined {
  return dataValida(valor) ? new Date(`${valor}T23:59:59.999${FUSO_BRASILIA}`) : undefined;
}

export function filtroAuditoriaDaUrl(get: (campo: string) => string | undefined): FiltroAuditoria {
  return {
    entidade: valorOuUndefined(get("entidade")),
    acao: valorOuUndefined(get("acao")),
    usuarioId: valorOuUndefined(get("usuarioId")),
    filialId: valorOuUndefined(get("filialId")),
    dataDe: dataInicioDoDiaOuUndefined(get("dataDe")),
    dataAte: dataFimDoDiaOuUndefined(get("dataAte")),
  };
}

export function paginaDaUrl(get: (campo: string) => string | undefined): number {
  const valor = get("pagina");
  if (!valor) return 1;
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero >= 1 ? numero : 1;
}

const CAMPOS_FILTRO_AUDITORIA = ["entidade", "acao", "usuarioId", "filialId", "dataDe", "dataAte"] as const;

/** Repassa os filtros da tela ao link de export (sem `pagina`: o export traz tudo). */
export function queryStringDoFiltroAuditoria(get: (campo: string) => string | undefined): string {
  return CAMPOS_FILTRO_AUDITORIA.map((campo) => [campo, get(campo)] as const)
    .filter(([, valor]) => valor !== undefined && valor.length > 0 && valor !== SEM_VALOR)
    .map(([campo, valor]) => `${campo}=${encodeURIComponent(valor as string)}`)
    .join("&");
}
