import type { CSSProperties } from "react";
import { corDeTextoContrastante } from "@/lib/corContraste";
import type { PreviaTema } from "./actions";

/** Amostra de um modo do tema, com as variáveis aplicadas só neste bloco. */
function AmostraModo({
  titulo,
  variaveis,
  previa,
  logoUrl,
}: {
  titulo: string;
  variaveis: Record<string, string>;
  previa: PreviaTema;
  logoUrl: string | null;
}) {
  const estilo = {
    ...variaveis,
    ...(previa.raio ? { "--radius": previa.raio } : {}),
    background: "var(--background)",
    color: "var(--foreground)",
    fontFamily: previa.fonteTexto ?? undefined,
  } as CSSProperties;
  const raio = { borderRadius: "var(--radius)" };

  return (
    <div style={estilo} className="overflow-hidden rounded-lg border border-[var(--border)]">
      <div className="flex min-h-48 flex-col sm:flex-row">
        <div
          className="flex items-center gap-2 p-3 text-sm sm:w-36 sm:flex-col sm:items-start"
          style={{ background: "var(--sidebar)", color: "var(--sidebar-foreground)" }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-6 rounded object-contain" />
          ) : null}
          <span className="font-semibold">Menu</span>
          <span className="rounded px-2 py-1" style={{ background: "var(--sidebar-accent)" }}>
            Item ativo
          </span>
        </div>
        <div className="flex-1 space-y-3 p-4">
          <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--muted-foreground)" }}>
            {titulo}
          </p>
          <p className="text-lg font-semibold" style={{ fontFamily: previa.fonteTitulos ?? undefined }}>
            Título com a fonte da marca
          </p>
          <p className="text-sm">Texto principal sobre o fundo.</p>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Texto apagado: legendas e dicas.
          </p>
          <div className="space-y-2 border p-3" style={{ ...raio, background: "var(--card)", borderColor: "var(--border)" }}>
            <p className="text-sm">Cartão</p>
            <div className="flex flex-wrap gap-2">
              <span
                className="px-3 py-1.5 text-sm font-medium"
                style={{ ...raio, background: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                Botão primário
              </span>
              <span
                className="px-3 py-1.5 text-sm"
                style={{ ...raio, background: "var(--secondary)", color: "var(--secondary-foreground)" }}
              >
                Secundário
              </span>
              <span className="px-3 py-1.5 text-sm" style={{ color: "var(--destructive)" }}>
                Erro
              </span>
            </div>
          </div>
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="h-3 flex-1 rounded-sm" style={{ background: `var(--chart-${n})` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Prévia do tema importado, no claro e (se houver) no escuro. */
export function PreviaDoTema({ previa, logoUrl, logoEscuroUrl }: {
  previa: PreviaTema;
  logoUrl: string | null;
  logoEscuroUrl: string | null;
}) {
  const logo = (variaveis: Record<string, string>) =>
    corDeTextoContrastante(variaveis["--sidebar"]) === "#ffffff" ? (logoEscuroUrl ?? logoUrl) : logoUrl;
  return (
    <div className="space-y-3">
      {previa.urlFontes ? <link rel="stylesheet" href={previa.urlFontes} precedence="previa-tema" /> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <AmostraModo titulo="Claro" variaveis={previa.claro} previa={previa} logoUrl={logo(previa.claro)} />
        {previa.escuro ? (
          <AmostraModo titulo="Escuro" variaveis={previa.escuro} previa={previa} logoUrl={logo(previa.escuro)} />
        ) : (
          <p className="text-sm text-muted-foreground">Sem modo escuro: a empresa fica só no claro.</p>
        )}
      </div>
    </div>
  );
}
