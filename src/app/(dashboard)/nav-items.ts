import type { Perfil } from "@prisma/client";

export type NavItem = { href: string; label: string; permitido?: Perfil[] };
export type NavSection = { titulo: string; itens: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    titulo: "Financeiro",
    itens: [
      { href: "/financeiro/contas-a-pagar", label: "Contas a pagar" },
      { href: "/financeiro/contas-a-receber", label: "Contas a receber" },
      { href: "/financeiro/aprovacoes", label: "Aprovações pendentes", permitido: ["ADMINISTRADOR", "TESOURARIA"] },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/cadastros/clientes", label: "Clientes" },
      { href: "/cadastros/fornecedores", label: "Fornecedores" },
      { href: "/cadastros/categorias", label: "Categorias financeiras" },
      { href: "/cadastros/centros-de-custo", label: "Centros de custo" },
      { href: "/cadastros/centros-de-lucro", label: "Centros de lucro" },
      { href: "/cadastros/safras", label: "Safras" },
      { href: "/cadastros/projetos", label: "Projetos" },
      { href: "/cadastros/bancos", label: "Bancos" },
      { href: "/cadastros/contas-bancarias", label: "Contas bancárias" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { href: "/empresas", label: "Empresas", permitido: ["ADMINISTRADOR"] },
      { href: "/filiais", label: "Filiais", permitido: ["ADMINISTRADOR"] },
      { href: "/usuarios", label: "Usuários", permitido: ["ADMINISTRADOR"] },
      {
        href: "/auditoria",
        label: "Auditoria",
        permitido: ["ADMINISTRADOR", "AUDITOR", "GESTOR"],
      },
    ],
  },
];
