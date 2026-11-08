import type { Perfil } from "@prisma/client";

export type Acao =
  | "empresa:gerenciar"
  | "usuario:gerenciar"
  | "cadastro:escrever"
  | "cadastro:ler"
  | "auditoria:ler"
  | "filial:gerenciar"
  | "titulo:ler"
  | "titulo:escrever"
  | "titulo:baixar"
  | "titulo:aprovar"
  | "lancamento:ler"
  | "lancamento:escrever"
  | "conciliacao:ler"
  | "conciliacao:escrever"
  | "planejamentoEstrategico:ler"
  | "planejamentoEstrategico:escrever"
  | "orcamento:ler"
  | "orcamento:escrever"
  | "dashboardExecutivo:ler"
  // Fase 7 — produção, estoque e vendas
  | "cadastroProducao:escrever"
  | "cliente:escrever"
  | "producao:configurar"
  | "producao:ler"
  | "producao:escrever"
  | "estoque:ajustar"
  | "venda:ler"
  | "venda:escrever"
  | "venda:cancelar"
  | "venda:liberarVencido";

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
  FINANCEIRO: new Set([
    "cadastro:escrever",
    "cadastro:ler",
    "titulo:ler",
    "titulo:escrever",
    "titulo:baixar",
    "lancamento:ler",
    "conciliacao:ler",
    "orcamento:ler",
    "orcamento:escrever",
    "cliente:escrever",
    "producao:ler",
    "venda:ler",
    "venda:escrever",
    "venda:cancelar",
  ]),
  TESOURARIA: new Set([
    "cadastro:escrever",
    "cadastro:ler",
    "titulo:ler",
    "titulo:baixar",
    "titulo:aprovar",
    "lancamento:ler",
    "lancamento:escrever",
    "conciliacao:ler",
    "conciliacao:escrever",
    "orcamento:ler",
    "cliente:escrever",
    "producao:ler",
    "venda:ler",
  ]),
  GESTOR: new Set([
    "cadastro:ler",
    "auditoria:ler",
    "titulo:ler",
    "lancamento:ler",
    "conciliacao:ler",
    "planejamentoEstrategico:ler",
    "planejamentoEstrategico:escrever",
    "orcamento:ler",
    "dashboardExecutivo:ler",
    "producao:ler",
    "venda:ler",
    "venda:liberarVencido",
  ]),
  AUDITOR: new Set([
    "cadastro:ler",
    "auditoria:ler",
    "titulo:ler",
    "lancamento:ler",
    "conciliacao:ler",
    "planejamentoEstrategico:ler",
    "orcamento:ler",
    "dashboardExecutivo:ler",
    "producao:ler",
    "venda:ler",
  ]),
  CONSULTA: new Set([
    "cadastro:ler",
    "titulo:ler",
    "lancamento:ler",
    "conciliacao:ler",
    "orcamento:ler",
    "producao:ler",
    "venda:ler",
  ]),
  PRODUCAO: new Set([
    "cadastro:ler",
    "cadastroProducao:escrever",
    "producao:ler",
    "producao:escrever",
    "estoque:ajustar",
    "venda:ler",
  ]),
  VENDAS: new Set(["cadastro:ler", "cliente:escrever", "producao:ler", "venda:ler", "venda:escrever"]),
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

/**
 * Versão booleana (não lança) da combinação requirePermission("cadastro:escrever")
 * + requireAlteracaoFilial, usada pela UI pra decidir se mostra ações de escrita.
 */
export function podeAlterarFilialAtiva(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "cadastro:escrever") && podeAlterarFilial;
}

export function podeEscreverTitulo(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "titulo:escrever") && podeAlterarFilial;
}

export function podeBaixarTitulo(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "titulo:baixar") && podeAlterarFilial;
}

export function podeAprovarBaixa(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "titulo:aprovar") && podeAlterarFilial;
}

export function podeEscreverLancamento(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "lancamento:escrever") && podeAlterarFilial;
}

export function podeEscreverConciliacao(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "conciliacao:escrever") && podeAlterarFilial;
}

export function podeEscreverOrcamento(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "orcamento:escrever") && podeAlterarFilial;
}

export function podeEscreverCadastroProducao(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "cadastroProducao:escrever") && podeAlterarFilial;
}

export function podeEscreverCliente(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "cliente:escrever") && podeAlterarFilial;
}

export function podeConfigurarProducao(perfil: Perfil, podeAlterarFilial: boolean): boolean {
  return podeExecutar(perfil, "producao:configurar") && podeAlterarFilial;
}
