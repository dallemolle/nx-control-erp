export const STATUS_SAFRA_PROJETO = ["PLANEJADO", "EM_ANDAMENTO", "ENCERRADO"] as const;

export const TIPO_CONTA_BANCARIA = [
  "CORRENTE",
  "APLICACAO",
  "INVESTIMENTO",
  "EMPRESTIMO_FINANCIAMENTO",
] as const;

export const TIPO_CATEGORIA_FINANCEIRA = ["RECEITA", "DESPESA"] as const;

export const TIPO_TITULO = ["PAGAR", "RECEBER"] as const;

export const STATUS_PARCELA = [
  "EM_ABERTO",
  "A_VENCER",
  "VENCIDO",
  "PARCIALMENTE_PAGO",
  "PAGO",
  "CANCELADO",
  "RENEGOCIADO",
] as const;

export const STATUS_APROVACAO_BAIXA = ["PENDENTE", "APROVADO", "REJEITADO"] as const;

/**
 * Sentinela de "nenhum valor selecionado" para `Select`s de campos opcionais.
 * O componente de Select não aceita `SelectItem` com `value=""`, então a opção
 * "Nenhum" posta esta string e o service a normaliza de volta para `null`.
 *
 * Distinto de `SEM_PAI` ("__raiz__"), que marca ausência de pai numa hierarquia:
 * são semanticamente diferentes, não devem ser unificados numa constante só.
 */
export const SEM_VALOR = "__nenhum__";
