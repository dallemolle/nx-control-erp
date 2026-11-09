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

export const MEIO_PAGAMENTO = ["PIX", "DEPOSITO_BANCARIO"] as const;

export const TIPO_CHAVE_PIX = ["CPF_CNPJ", "CELULAR", "EMAIL", "ALEATORIA"] as const;

export const TIPO_CONTA_TERCEIRO = ["CORRENTE", "POUPANCA"] as const;

export const TIPO_LANCAMENTO = ["ENTRADA", "SAIDA"] as const;

export const ORIGEM_LANCAMENTO = ["MANUAL", "BAIXA", "TRANSFERENCIA"] as const;

export const STATUS_LINHA_EXTRATO = [
  "NAO_CONCILIADO",
  "SUGESTAO",
  "CONCILIADO",
  "DIVERGENCIA_VALOR",
  "DIVERGENCIA_DATA",
  "DUPLICADO",
] as const;

export const CLASSIFICACAO_FISCAL = ["FISCAL", "GERENCIAL"] as const;

export const TIPO_COMPROVANTE_FISCAL = [
  "NFE",
  "NFCE",
  "NFSE",
  "CTE",
  "NF_PRODUTOR",
  "NF_ENTRADA",
  "GUIA_TRIBUTO",
  "FOLHA_PAGAMENTO",
  "TARIFA_BANCARIA",
  "CONTRATO",
  "OUTRO_FISCAL",
] as const;

export const TIPO_COMPROVANTE_GERENCIAL = ["RECIBO", "PEDIDO_INTERNO", "SEM_COMPROVANTE"] as const;

export const TIPO_COMPROVANTE = [...TIPO_COMPROVANTE_FISCAL, ...TIPO_COMPROVANTE_GERENCIAL] as const;

/** Tipos que identificam uma nota com número/série. */
export const TIPOS_COM_NUMERO_NOTA = ["NFE", "NFCE", "NFSE", "CTE", "NF_PRODUTOR", "NF_ENTRADA"] as const;

/** Tipos com chave de acesso de 44 dígitos. */
export const TIPOS_COM_CHAVE_ACESSO = ["NFE", "NFCE", "CTE"] as const;

export const ROTULOS_CLASSIFICACAO_FISCAL = {
  FISCAL: "Fiscal (com documento)",
  GERENCIAL: "Gerencial (sem nota)",
} as const;

export const ROTULOS_TIPO_COMPROVANTE = {
  NFE: "NF-e",
  NFCE: "NFC-e",
  NFSE: "NFS-e",
  CTE: "CT-e",
  NF_PRODUTOR: "Nota do produtor / avulsa",
  NF_ENTRADA: "Nota de entrada (emissão própria)",
  GUIA_TRIBUTO: "Guia de tributo",
  FOLHA_PAGAMENTO: "Folha de pagamento",
  TARIFA_BANCARIA: "Tarifa bancária",
  CONTRATO: "Contrato",
  OUTRO_FISCAL: "Outro documento oficial",
  RECIBO: "Recibo",
  PEDIDO_INTERNO: "Pedido interno",
  SEM_COMPROVANTE: "Sem comprovante",
} as const;

/**
 * Sentinela de "nenhum valor selecionado" para `Select`s de campos opcionais.
 * O componente de Select não aceita `SelectItem` com `value=""`, então a opção
 * "Nenhum" posta esta string e o service a normaliza de volta para `null`.
 *
 * Distinto de `SEM_PAI` ("__raiz__"), que marca ausência de pai numa hierarquia:
 * são semanticamente diferentes, não devem ser unificados numa constante só.
 */
export const SEM_VALOR = "__nenhum__";

// Fase 7 — produção, estoque e vendas
export const CATEGORIA_PRODUTO = ["FRUTO", "POLPA"] as const;
export const CONSERVACAO = ["IN_NATURA", "RESFRIADO", "CONGELADO"] as const;
export const TIPO_LOCAL_ARMAZENAMENTO = ["CAMARA_FRIA", "FREEZER", "REFRIGERADOR", "RECEPCAO", "OUTRO"] as const;
export const CANAL_VENDA = [
  "BATEDOR",
  "ATACADO",
  "VAREJO",
  "RESTAURANTE",
  "INDUSTRIA",
  "CONSUMIDOR_FINAL",
  "OUTRO",
] as const;

export const ROTULOS_CATEGORIA_PRODUTO = { FRUTO: "Fruto", POLPA: "Polpa" } as const;
export const ROTULOS_CONSERVACAO = { IN_NATURA: "In natura", RESFRIADO: "Resfriado", CONGELADO: "Congelado" } as const;
export const ROTULOS_TIPO_LOCAL = {
  CAMARA_FRIA: "Câmara fria",
  FREEZER: "Freezer",
  REFRIGERADOR: "Refrigerador",
  RECEPCAO: "Recepção",
  OUTRO: "Outro",
} as const;
export const ROTULOS_CANAL_VENDA = {
  BATEDOR: "Batedor / ponto de açaí",
  ATACADO: "Atacado / distribuidor",
  VAREJO: "Varejo / mercado",
  RESTAURANTE: "Restaurante / lanchonete",
  INDUSTRIA: "Indústria",
  CONSUMIDOR_FINAL: "Consumidor final",
  OUTRO: "Outro",
} as const;

// Fase 7b — recepção e estoque
export const ORIGEM_RECEPCAO = ["PROPRIA", "TERCEIRO"] as const;
export const ROTULOS_ORIGEM_RECEPCAO = { PROPRIA: "Própria", TERCEIRO: "Terceiro" } as const;
export const QUALIDADE_FRUTO = ["A", "B", "C"] as const;
export const MOTIVO_AJUSTE_ESTOQUE = ["VENCIDO", "AVARIA", "AMOSTRA", "INVENTARIO", "CONSUMO_INTERNO", "OUTRO"] as const;
export const ROTULOS_MOTIVO_AJUSTE = {
  VENCIDO: "Vencido",
  AVARIA: "Avaria/quebra",
  AMOSTRA: "Amostra (ADEPARA/laboratório)",
  INVENTARIO: "Inventário",
  CONSUMO_INTERNO: "Consumo interno",
  OUTRO: "Outro",
} as const;
