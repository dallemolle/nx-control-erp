import type { ClassificacaoFiscal } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

/**
 * Tag Fiscal/Gerencial das listagens. Sem classificação (transferência) não
 * mostra nada. O texto vai sempre visível — não depende só de cor.
 */
export function BadgeClassificacao({ classificacao }: { classificacao: ClassificacaoFiscal | null }) {
  if (!classificacao) return null;
  return classificacao === "FISCAL" ? (
    <Badge variant="outline">Fiscal</Badge>
  ) : (
    <Badge variant="secondary">Gerencial</Badge>
  );
}
