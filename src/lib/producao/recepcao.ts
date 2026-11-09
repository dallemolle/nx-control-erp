import { arredondar } from "./arredondar";
import { paraKg, precoPorKg } from "./unidade";

export type EntradaRecepcao = {
  /** Peso bruto na unidade digitada (kg ou unidade comercial). */
  bruto: number;
  /** Descarte na triagem, na mesma unidade do bruto. */
  descarte: number;
  /** Preço por unidade digitada. */
  preco: number;
  /** kg por unidade comercial; `null` quando a digitação é em kg. */
  fatorUnidadeKg: number | null;
};

export type ResultadoRecepcao = {
  brutoKg: number;
  descarteKg: number;
  liquidoKg: number;
  percentualDescarte: number;
  precoKg: number;
  valorTotal: number;
};

/**
 * Peso líquido, % de descarte e valor da recepção (RN-04, RN-05). O valor é
 * calculado na unidade digitada (rasas × R$/rasa), para não perder centavos na
 * dízima do R$/kg.
 */
export function calcularRecepcao({ bruto, descarte, preco, fatorUnidadeKg }: EntradaRecepcao): ResultadoRecepcao {
  if (descarte < 0) throw new Error("O descarte não pode ser negativo");
  if (descarte > bruto) throw new Error("O descarte não pode ser maior que o peso bruto");
  if (bruto - descarte <= 0) throw new Error("O peso líquido precisa ser maior que zero");

  const brutoKg = paraKg(bruto, fatorUnidadeKg);
  const descarteKg = paraKg(descarte, fatorUnidadeKg);
  return {
    brutoKg,
    descarteKg,
    liquidoKg: arredondar(brutoKg - descarteKg, 3),
    percentualDescarte: descarte / bruto,
    precoKg: precoPorKg(preco, fatorUnidadeKg),
    valorTotal: arredondar((bruto - descarte) * preco, 2),
  };
}
