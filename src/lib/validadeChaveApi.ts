/** Prazos oferecidos ao gerar uma chave de API. Sem validade = `null`. */
export const OPCOES_VALIDADE_CHAVE = [
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
  { dias: 365, rotulo: "1 ano" },
] as const;

export type ValidadeChaveDias = (typeof OPCOES_VALIDADE_CHAVE)[number]["dias"];

/** Valor do formulário: "" = sem validade (`null`); prazo fora da lista = `undefined`. */
export function lerValidadeChave(valor: string): ValidadeChaveDias | null | undefined {
  if (valor === "") return null;
  return OPCOES_VALIDADE_CHAVE.find((opcao) => String(opcao.dias) === valor)?.dias;
}
