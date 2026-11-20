import type { DefinicaoAjuda } from "./tipos";

type EntradaRegistro = { titulo: string; carregar: () => Promise<DefinicaoAjuda> };

/** Telas com ajuda. O conteúdo só é baixado quando o popup abre (import dinâmico). */
const REGISTRO: Readonly<Record<string, EntradaRegistro>> = {
  "contas-a-pagar": {
    titulo: "Contas a pagar",
    carregar: () => import("./contas-a-pagar").then((modulo) => modulo.ajudaContasAPagar),
  },
  "contas-a-receber": {
    titulo: "Contas a receber",
    carregar: () => import("./contas-a-receber").then((modulo) => modulo.ajudaContasAReceber),
  },
  "aprovacoes": {
    titulo: "Aprovações pendentes",
    carregar: () => import("./aprovacoes").then((modulo) => modulo.ajudaAprovacoes),
  },
  "repasses-cartao": {
    titulo: "Repasses de cartão",
    carregar: () => import("./repasses-cartao").then((modulo) => modulo.ajudaRepassesCartao),
  },
  tesouraria: {
    titulo: "Tesouraria",
    carregar: () => import("./tesouraria").then((modulo) => modulo.ajudaTesouraria),
  },
  conciliacao: {
    titulo: "Conciliação bancária",
    carregar: () => import("./conciliacao").then((modulo) => modulo.ajudaConciliacao),
  },
  "fluxo-de-caixa": {
    titulo: "Fluxo de caixa",
    carregar: () => import("./fluxo-de-caixa").then((modulo) => modulo.ajudaFluxoDeCaixa),
  },
  "fluxo-de-caixa-projetado": {
    titulo: "Fluxo de caixa projetado",
    carregar: () => import("./fluxo-de-caixa-projetado").then((modulo) => modulo.ajudaFluxoDeCaixaProjetado),
  },
  "fluxo-de-caixa-estrategico": {
    titulo: "Fluxo de caixa estratégico",
    carregar: () => import("./fluxo-de-caixa-estrategico").then((modulo) => modulo.ajudaFluxoDeCaixaEstrategico),
  },
  orcamento: {
    titulo: "Orçamento",
    carregar: () => import("./orcamento").then((modulo) => modulo.ajudaOrcamento),
  },
  "fluxo-por-dimensao": {
    titulo: "Fluxo de caixa por dimensão",
    carregar: () => import("./fluxo-por-dimensao").then((modulo) => modulo.ajudaFluxoPorDimensao),
  },
  "comparacao-safras": {
    titulo: "Comparação entre safras",
    carregar: () => import("./comparacao-safras").then((modulo) => modulo.ajudaComparacaoSafras),
  },
  "fiscal-gerencial": {
    titulo: "Fiscal × gerencial",
    carregar: () => import("./fiscal-gerencial").then((modulo) => modulo.ajudaFiscalGerencial),
  },
  recepcao: {
    titulo: "Recepção de fruto",
    carregar: () => import("./recepcao").then((modulo) => modulo.ajudaRecepcao),
  },
  processamento: {
    titulo: "Processamento",
    carregar: () => import("./processamento").then((modulo) => modulo.ajudaProcessamento),
  },
  estoque: {
    titulo: "Estoque",
    carregar: () => import("./estoque").then((modulo) => modulo.ajudaEstoque),
  },
  ajustes: {
    titulo: "Ajustes de estoque",
    carregar: () => import("./ajustes").then((modulo) => modulo.ajudaAjustes),
  },
  rastreabilidade: {
    titulo: "Rastreabilidade",
    carregar: () => import("./rastreabilidade").then((modulo) => modulo.ajudaRastreabilidade),
  },
  painel: {
    titulo: "Painel de produção",
    carregar: () => import("./painel").then((modulo) => modulo.ajudaPainel),
  },
  "relatorio-mensal": {
    titulo: "Relatório mensal",
    carregar: () => import("./relatorio-mensal").then((modulo) => modulo.ajudaRelatorioMensal),
  },
  "relatorio-vendas": {
    titulo: "Relatório de vendas",
    carregar: () => import("./relatorio-vendas").then((modulo) => modulo.ajudaRelatorioVendas),
  },
  "relatorio-origem": {
    titulo: "Relatório de origem",
    carregar: () => import("./relatorio-origem").then((modulo) => modulo.ajudaRelatorioOrigem),
  },
};

export function temAjuda(tela: string): boolean {
  return Object.hasOwn(REGISTRO, tela);
}

export function tituloDaAjuda(tela: string): string {
  if (!temAjuda(tela)) throw new Error(`Tela sem ajuda: ${tela}`);
  return REGISTRO[tela].titulo;
}

export async function carregarAjuda(tela: string): Promise<DefinicaoAjuda> {
  if (!temAjuda(tela)) throw new Error(`Tela sem ajuda: ${tela}`);
  return REGISTRO[tela].carregar();
}
