import type { Perfil } from "@prisma/client";

export type Acao =
  | "empresa:gerenciar"
  | "usuario:gerenciar"
  | "cadastro:escrever"
  | "cadastro:ler"
  | "auditoria:ler"
  | "filial:gerenciar";

export class PermissionError extends Error {
  constructor(perfil: Perfil, acao: Acao) {
    super(`Perfil ${perfil} não tem permissão para executar "${acao}"`);
    this.name = "PermissionError";
  }
}

export class FilialSomenteLeituraError extends Error {
  constructor() {
    super("Usuário não tem permissão de alteração na filial ativa");
    this.name = "FilialSomenteLeituraError";
  }
}

const PERMISSOES: Record<Perfil, ReadonlySet<Acao> | "TODAS"> = {
  ADMINISTRADOR: "TODAS",
  FINANCEIRO: new Set(["cadastro:escrever", "cadastro:ler"]),
  TESOURARIA: new Set(["cadastro:escrever", "cadastro:ler"]),
  GESTOR: new Set(["cadastro:ler", "auditoria:ler"]),
  AUDITOR: new Set(["cadastro:ler", "auditoria:ler"]),
  CONSULTA: new Set(["cadastro:ler"]),
};

export function podeExecutar(perfil: Perfil, acao: Acao): boolean {
  const permitidas = PERMISSOES[perfil];
  return permitidas === "TODAS" || permitidas.has(acao);
}

export function requirePermission(perfil: Perfil, acao: Acao): void {
  if (!podeExecutar(perfil, acao)) {
    throw new PermissionError(perfil, acao);
  }
}

export function requireAlteracaoFilial(podeAlterarFilial: boolean): void {
  if (!podeAlterarFilial) {
    throw new FilialSomenteLeituraError();
  }
}
