import type { Acao } from "@/server/auth/permissions";
import type { PERFIS } from "@/lib/schemas/usuario";

/**
 * O exemplo de Usuários: a Empresa Demonstração em 21/11/2026, com a Matriz (filial ativa) e a Filial Igarapé-Miri.
 * Quem lê a ajuda é o Paulo Andrade, o Administrador. As pessoas são as das outras ajudas: o Carlos Lima aprova as
 * baixas (Tesouraria), a Maria registra os títulos (Financeiro), a Rita vende. Fictício e fixo.
 */
type Perfil = (typeof PERFIS)[number];

export type UsuarioExemplo = {
  chave: string;
  nome: string;
  email: string;
  perfil: Perfil;
  /** Acesso por filial: leitura e alteração. */
  matriz: { leitura: boolean; alteracao: boolean };
  igarape: { leitura: boolean; alteracao: boolean };
};

export const FILIAL_ATIVA = "Matriz";
export const OUTRA_FILIAL = "Filial Igarapé-Miri";

const TUDO = { leitura: true, alteracao: true };
const NADA = { leitura: false, alteracao: false };
const LEITURA = { leitura: true, alteracao: false };

export const VOCE: UsuarioExemplo = {
  chave: "paulo",
  nome: "Paulo Andrade",
  email: "paulo.andrade@exemplo.com.br",
  perfil: "ADMINISTRADOR",
  matriz: TUDO,
  igarape: TUDO,
};

/** Quem já está na empresa, além de você. */
export const USUARIOS: readonly UsuarioExemplo[] = [
  VOCE,
  { chave: "carlos", nome: "Carlos Lima", email: "carlos.lima@exemplo.com.br", perfil: "TESOURARIA", matriz: TUDO, igarape: TUDO },
  { chave: "maria", nome: "Maria Souza", email: "maria.souza@exemplo.com.br", perfil: "FINANCEIRO", matriz: TUDO, igarape: NADA },
  { chave: "pedro", nome: "Pedro Alves", email: "pedro.alves@exemplo.com.br", perfil: "CONSULTA", matriz: LEITURA, igarape: NADA },
  { chave: "rita", nome: "Rita Nogueira", email: "rita.nogueira@exemplo.com.br", perfil: "VENDAS", matriz: TUDO, igarape: NADA },
];

/** Nova no sistema: precisa de nome e senha. Produção na Matriz, com alteração (para lançar recepções e OPs). */
export const JOANA: UsuarioExemplo = {
  chave: "joana",
  nome: "Joana Pires",
  email: "joana.pires@exemplo.com.br",
  perfil: "PRODUCAO",
  matriz: TUDO,
  igarape: NADA,
};
export const SENHA_JOANA = "Polpa2026!";

/** A contadora: já tem login no sistema por outra empresa. Só ganha o vínculo com esta, para leitura. */
export const LUCIA: UsuarioExemplo = {
  chave: "lucia",
  nome: "Lúcia Martins",
  email: "lucia@contabilmartins.com.br",
  perfil: "AUDITOR",
  matriz: LEITURA,
  igarape: NADA,
};

/** A Rita passa a cuidar também do financeiro da Filial Igarapé-Miri. */
export const RITA_NOVO_PERFIL: Perfil = "FINANCEIRO";

/**
 * O que cada perfil faz, como a ajuda conta. `pode` e `naoPode` são conferidos no teste com o `podeExecutar` real
 * (src/server/auth/permissions.ts): mudou uma permissão lá, este texto precisa mudar junto.
 */
export const PERFIS_RESUMO: readonly { perfil: Perfil; faz: string; pode: readonly Acao[]; naoPode: readonly Acao[] }[] = [
  {
    perfil: "ADMINISTRADOR",
    faz: "Tudo, inclusive empresas, filiais, usuários e a configuração de produção.",
    pode: ["usuario:gerenciar", "empresa:gerenciar", "producao:configurar", "titulo:aprovar"],
    naoPode: [],
  },
  {
    perfil: "FINANCEIRO",
    faz: "Títulos (cria e baixa), orçamento, cadastros e pedidos de venda. Não aprova baixas.",
    pode: ["titulo:escrever", "titulo:baixar", "orcamento:escrever", "cadastro:escrever", "venda:escrever"],
    naoPode: ["titulo:aprovar", "lancamento:escrever", "usuario:gerenciar"],
  },
  {
    perfil: "TESOURARIA",
    faz: "Baixa e aprova baixas, lança na Tesouraria e concilia. Vê os títulos, sem criar.",
    pode: ["titulo:baixar", "titulo:aprovar", "lancamento:escrever", "conciliacao:escrever"],
    naoPode: ["titulo:escrever", "usuario:gerenciar"],
  },
  {
    perfil: "GESTOR",
    faz: "Consulta tudo, a auditoria e o dashboard executivo; planejamento estratégico; libera lote vencido.",
    pode: ["auditoria:ler", "dashboardExecutivo:ler", "planejamentoEstrategico:escrever", "estoque:liberarVencido"],
    naoPode: ["titulo:escrever", "usuario:gerenciar"],
  },
  {
    perfil: "AUDITOR",
    faz: "Só consulta, inclusive a auditoria e o dashboard executivo.",
    pode: ["auditoria:ler", "dashboardExecutivo:ler", "titulo:ler"],
    naoPode: ["titulo:escrever", "cadastro:escrever", "planejamentoEstrategico:escrever"],
  },
  {
    perfil: "CONSULTA",
    faz: "Só consulta: financeiro, produção e vendas. Sem auditoria e sem dashboard executivo.",
    pode: ["titulo:ler", "producao:ler", "venda:ler"],
    naoPode: ["auditoria:ler", "dashboardExecutivo:ler", "cadastro:escrever"],
  },
  {
    perfil: "PRODUCAO",
    faz: "Cadastros de produção, recepção, processamento, estoque e ajustes.",
    pode: ["cadastroProducao:escrever", "producao:escrever", "estoque:ajustar"],
    naoPode: ["titulo:ler", "venda:escrever", "usuario:gerenciar"],
  },
  {
    perfil: "VENDAS",
    faz: "Clientes e pedidos de venda.",
    pode: ["cliente:escrever", "venda:escrever"],
    naoPode: ["titulo:ler", "venda:cancelar", "producao:escrever"],
  },
];

/** Chaves de API do Carlos. A chave completa é fictícia, no formato real: `sk_` + 43 caracteres. */
export const CHAVE_NOVA = {
  nome: "Agente IA - lançamentos",
  validadeDias: 90,
  completa: "sk_q7Lm2Xa9Vt4Rb8Nc1Pz6Kw3Hd5Jf0Gs2Ye7Ua4Ti9Ox",
  criadaEm: "21/11/2026, 10:15:00",
  expiraEm: "19/02/2027",
} as const;

export const CHAVE_ANTIGA = {
  nome: "Planilha de importação",
  prefixo: "sk_B3vQ8mZ1",
  criadaEm: "02/03/2026, 14:40:00",
  ultimoUso: "30/09/2026, 08:02:00",
} as const;

export const HOJE = "21/11/2026";
export const CNPJ_MATRIZ = "12.345.678/0001-90";
