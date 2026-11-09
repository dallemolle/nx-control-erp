import type { Perfil } from "@prisma/client";
import { podeExecutar, type Acao } from "@/server/auth/permissions";

/** `acao` é a permissão que a página exige; sem `acao`, o item aparece para todos. */
export type NavItem = { href: string; label: string; acao?: Acao };
export type NavSection = { titulo: string; itens: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    titulo: "Financeiro",
    itens: [
      { href: "/financeiro/contas-a-pagar", label: "Contas a pagar", acao: "titulo:ler" },
      { href: "/financeiro/contas-a-receber", label: "Contas a receber", acao: "titulo:ler" },
      { href: "/financeiro/aprovacoes", label: "Aprovações pendentes", acao: "titulo:aprovar" },
      { href: "/financeiro/tesouraria", label: "Tesouraria", acao: "lancamento:ler" },
      { href: "/financeiro/conciliacao", label: "Conciliação", acao: "conciliacao:ler" },
      { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de caixa", acao: "lancamento:ler" },
      { href: "/financeiro/fluxo-de-caixa-projetado", label: "Fluxo de caixa projetado", acao: "titulo:ler" },
      {
        href: "/financeiro/fluxo-de-caixa-estrategico",
        label: "Fluxo de caixa estratégico",
        acao: "planejamentoEstrategico:ler",
      },
    ],
  },
  {
    titulo: "Controladoria",
    itens: [
      { href: "/controladoria/orcamento", label: "Orçamento", acao: "orcamento:ler" },
      { href: "/controladoria/fluxo-por-dimensao", label: "Fluxo de caixa por dimensão", acao: "titulo:ler" },
      { href: "/controladoria/comparacao-safras", label: "Comparação entre safras", acao: "orcamento:ler" },
      { href: "/controladoria/fiscal-gerencial", label: "Fiscal × gerencial", acao: "titulo:ler" },
    ],
  },
  {
    titulo: "Produção",
    itens: [
      { href: "/producao/recepcao", label: "Recepção de fruto", acao: "producao:ler" },
      { href: "/producao/estoque", label: "Estoque", acao: "producao:ler" },
      { href: "/producao/ajustes", label: "Ajustes de estoque", acao: "producao:ler" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/cadastros/clientes", label: "Clientes", acao: "cadastro:ler" },
      { href: "/cadastros/fornecedores", label: "Fornecedores", acao: "cadastro:ler" },
      { href: "/cadastros/categorias", label: "Categorias financeiras", acao: "cadastro:ler" },
      { href: "/cadastros/centros-de-custo", label: "Centros de custo", acao: "cadastro:ler" },
      { href: "/cadastros/centros-de-lucro", label: "Centros de lucro", acao: "cadastro:ler" },
      { href: "/cadastros/safras", label: "Safras", acao: "cadastro:ler" },
      { href: "/cadastros/projetos", label: "Projetos", acao: "cadastro:ler" },
      { href: "/cadastros/frutas", label: "Frutas", acao: "cadastro:ler" },
      { href: "/cadastros/produtos", label: "Produtos", acao: "cadastro:ler" },
      { href: "/cadastros/insumos", label: "Insumos", acao: "cadastro:ler" },
      { href: "/cadastros/talhoes", label: "Talhões", acao: "cadastro:ler" },
      { href: "/cadastros/locais-armazenamento", label: "Locais de armazenamento", acao: "cadastro:ler" },
      { href: "/cadastros/bancos", label: "Bancos", acao: "cadastro:ler" },
      { href: "/cadastros/contas-bancarias", label: "Contas bancárias", acao: "cadastro:ler" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { href: "/empresas", label: "Empresas", acao: "empresa:gerenciar" },
      { href: "/filiais", label: "Filiais", acao: "filial:gerenciar" },
      { href: "/usuarios", label: "Usuários", acao: "usuario:gerenciar" },
      { href: "/configuracao-producao", label: "Configuração de produção", acao: "producao:configurar" },
      { href: "/auditoria", label: "Auditoria", acao: "auditoria:ler" },
    ],
  },
  {
    titulo: "Gestão",
    itens: [{ href: "/dashboard-executivo", label: "Dashboard executivo", acao: "dashboardExecutivo:ler" }],
  },
  {
    titulo: "Ajuda",
    itens: [
      { href: "/ajuda/passo-a-passo", label: "Passo a passo" },
      { href: "/ajuda/novidades", label: "Novidades" },
    ],
  },
];

/** Seções e itens que o perfil pode abrir; seção sem item visível é omitida. */
export function secoesVisiveis(perfil: Perfil): NavSection[] {
  return NAV_SECTIONS.map((secao) => ({
    ...secao,
    itens: secao.itens.filter((item) => !item.acao || podeExecutar(perfil, item.acao)),
  })).filter((secao) => secao.itens.length > 0);
}
