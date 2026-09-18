import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import packageJson from "../package.json";

function git(comando: string): string | null {
  try {
    return execSync(comando, { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

const versao = packageJson.version;
const commitSha = git("git rev-parse --short HEAD") ?? "desconhecido";
const dataUltimaAlteracao = git("git log -1 --format=%cI");

const destino = join(process.cwd(), "src", "generated");
mkdirSync(destino, { recursive: true });
writeFileSync(
  join(destino, "versao.json"),
  JSON.stringify({ versao, commitSha, dataUltimaAlteracao }, null, 2) + "\n",
);

console.log(`Versão gerada: v${versao} (${commitSha})`);
