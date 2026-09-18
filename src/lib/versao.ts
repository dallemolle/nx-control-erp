import { readFileSync } from "node:fs";
import { join } from "node:path";

export type VersaoInfo = {
  versao: string;
  commitSha: string;
  dataUltimaAlteracao: string | null;
};

const VERSAO_DESCONHECIDA: VersaoInfo = {
  versao: "dev",
  commitSha: "desconhecido",
  dataUltimaAlteracao: null,
};

/**
 * Lê os metadados gerados em build (scripts/gerar-versao-build.ts). Se o
 * arquivo não existir — ambiente sem o passo de build, ex. só rodando
 * `vitest`/`tsc` — devolve um fallback em vez de quebrar a página.
 */
export function obterVersaoInfo(): VersaoInfo {
  try {
    const conteudo = readFileSync(join(process.cwd(), "src", "generated", "versao.json"), "utf-8");
    return JSON.parse(conteudo) as VersaoInfo;
  } catch {
    return VERSAO_DESCONHECIDA;
  }
}
