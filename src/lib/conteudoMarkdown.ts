import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lê um arquivo de texto (markdown) relativo à raiz do projeto. Devolve
 * `null` em vez de lançar quando o arquivo não existe — usado tanto para
 * conteúdo sempre presente (content/ajuda/*.md) quanto para o CHANGELOG.md,
 * que só existe depois da primeira release cortada pelo release-please.
 *
 * O `turbopackIgnore` evita que o build, sem saber qual arquivo será lido,
 * inclua o projeto inteiro (src, public, docs) no pacote do servidor. Os
 * arquivos lidos aqui entram explicitamente via `outputFileTracingIncludes`
 * no next.config.ts — um arquivo novo lido por esta função precisa ser
 * adicionado lá.
 */
export function lerConteudoMarkdown(caminhoRelativoAoRepo: string): string | null {
  try {
    return readFileSync(join(/* turbopackIgnore: true */ process.cwd(), caminhoRelativoAoRepo), "utf-8");
  } catch {
    return null;
  }
}
