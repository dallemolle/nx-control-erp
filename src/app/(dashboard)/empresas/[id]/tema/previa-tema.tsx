import type { CSSProperties } from "react";
import { corDeTextoContrastante } from "@/lib/corContraste";

export type PreviaTema = {
  variaveis: Record<string, string>;
  raio: string | null;
  fonteTexto: string | null;
  fonteTitulos: string | null;
};

/** Amostra de um modo do tema, com as variáveis aplicadas só neste bloco. */
export function PreviaDoTema({
  previa,
  logoUrl,
  logoEscuroUrl,
}: {
  previa: PreviaTema;
  logoUrl: string | null;
  logoEscuroUrl: string | null;
}) {
  const { variaveis } = previa;
  const logo = corDeTextoContrastante(variaveis["--sidebar"]) === "#ffffff" ? (logoEscuroUrl ?? logoUrl) : logoUrl;
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
      <div
        className="flex items-center justify-between px-4 py-2 text-sm"
        style={{ background: "var(--app-header-background)", color: "var(--app-header-foreground)" }}
      >
        <span className="font-medium">Cabeçalho</span>
        <span className="text-xs opacity-80">Usuário</span>
      </div>
      <div className="flex min-h-48 flex-col sm:flex-row">
        <div
          className="flex items-center gap-2 p-3 text-sm sm:w-36 sm:flex-col sm:items-start"
          style={{ background: "var(--sidebar)", color: "var(--sidebar-foreground)" }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="size-6 rounded object-contain" />
          ) : null}
          <span className="font-semibold">Menu</span>
          <span className="rounded px-2 py-1" style={{ background: "var(--sidebar-accent)" }}>
            Item ativo
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-3 p-4">
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
                style={{ ...raio, background: "var(--primary)", color: "var(--primary-foreground)", outline: "2px solid var(--ring)", outlineOffset: 2 }}
              >
                Botão primário (com foco)
              </span>
              <span
                className="px-3 py-1.5 text-sm"
                style={{ ...raio, background: "var(--secondary)", color: "var(--secondary-foreground)" }}
              >
                Secundário
              </span>
              <span
                className="px-3 py-1.5 text-sm"
                style={{ ...raio, background: "var(--accent)", color: "var(--accent-foreground)" }}
              >
                Destaque
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
