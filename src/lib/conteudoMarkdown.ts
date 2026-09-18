import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lê um arquivo de texto (markdown) relativo à raiz do projeto. Devolve
 * `null` em vez de lançar quando o arquivo não existe — usado tanto para
 * conteúdo sempre presente (content/ajuda/*.md) quanto para o CHANGELOG.md,
 * que só existe depois da primeira release cortada pelo release-please.
 */
export function lerConteudoMarkdown(caminhoRelativoAoRepo: string): string | null {
  try {
    return readFileSync(join(process.cwd(), caminhoRelativoAoRepo), "utf-8");
  } catch {
    return null;
  }
}
