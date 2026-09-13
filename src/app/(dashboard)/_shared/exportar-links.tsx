function montarHref(baseHref: string, formato: "csv" | "xlsx", queryString?: string): string {
  const separador = queryString ? "&" : "";
  return `${baseHref}?formato=${formato}${separador}${queryString ?? ""}`;
}

export function ExportarLinks({ baseHref, queryString }: { baseHref: string; queryString?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <a href={montarHref(baseHref, "csv", queryString)} className="text-primary underline-offset-4 hover:underline">
        Exportar CSV
      </a>
      <a href={montarHref(baseHref, "xlsx", queryString)} className="text-primary underline-offset-4 hover:underline">
        Exportar Excel
      </a>
    </div>
  );
}
