import type { VersaoInfo } from "@/lib/versao";

function formatarData(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function VersaoBadge({ versaoInfo }: { versaoInfo: VersaoInfo }) {
  const dataFormatada = formatarData(versaoInfo.dataUltimaAlteracao);

  return (
    <p
      className="px-2 text-xs text-sidebar-foreground/50"
      title={`Commit ${versaoInfo.commitSha}`}
    >
      v{versaoInfo.versao}
      {dataFormatada ? ` · ${dataFormatada}` : ""}
    </p>
  );
}
