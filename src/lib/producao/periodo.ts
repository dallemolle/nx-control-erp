/** Data de hoje no horário de Brasília, como data de calendário (meia-noite UTC). */
export function hojeDeCalendario(agora: Date = new Date()): Date {
  const aaaammdd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return new Date(`${aaaammdd}T00:00:00.000Z`);
}

/** `AAAA-MM-DD` da URL → data de calendário; qualquer outra coisa → `undefined`. */
export function dataDaUrl(valor: string | undefined): Date | undefined {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor ? undefined : data;
}

/** Período dos filtros: o informado na URL ou, por padrão, o mês de hoje. */
export function periodoDaUrl(
  parametros: { inicio?: string; fim?: string },
  agora: Date = new Date(),
): { inicio: Date; fim: Date } {
  const hoje = hojeDeCalendario(agora);
  const inicioDoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const fimDoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0));
  return {
    inicio: dataDaUrl(parametros.inicio) ?? inicioDoMes,
    fim: dataDaUrl(parametros.fim) ?? fimDoMes,
  };
}

/** Data de calendário → `AAAA-MM-DD` (valor de `<input type="date">` e da URL). */
export function paraDataIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}
