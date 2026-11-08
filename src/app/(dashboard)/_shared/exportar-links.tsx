import type { FormatoExport } from "@/lib/export/responder";

const ROTULOS: Record<FormatoExport, string> = {
  csv: "Exportar CSV",
  xlsx: "Exportar Excel",
  pdf: "Exportar PDF",
};

function montarHref(baseHref: string, formato: FormatoExport, queryString?: string): string {
  const separador = queryString ? "&" : "";
  return `${baseHref}?formato=${formato}${separador}${queryString ?? ""}`;
}

export function ExportarLinks({ baseHref, queryString }: { baseHref: string; queryString?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {(Object.keys(ROTULOS) as FormatoExport[]).map((formato) => (
        <a
          key={formato}
          href={montarHref(baseHref, formato, queryString)}
          className="text-primary underline-offset-4 hover:underline"
        >
          {ROTULOS[formato]}
        </a>
      ))}
    </div>
  );
}
