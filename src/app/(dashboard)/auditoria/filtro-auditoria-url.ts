import { SEM_VALOR } from "@/lib/schemas/enums";
import type { FiltroAuditoria } from "@/server/services/auditoria";

function valorOuUndefined(valor: string | undefined): string | undefined {
  return valor && valor.length > 0 && valor !== SEM_VALOR ? valor : undefined;
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
