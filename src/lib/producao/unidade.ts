import { arredondar } from "./arredondar";

/** Quantidade na unidade comercial (ex.: rasa) → kg. Sem fator, já está em kg. (RN-03) */
export function paraKg(quantidade: number, fatorUnidadeKg: number | null): number {
  return arredondar(fatorUnidadeKg ? quantidade * fatorUnidadeKg : quantidade, 3);
}

/** Preço por unidade comercial → R$/kg, com 4 casas. Sem fator, já está em R$/kg. (RN-03) */
export function precoPorKg(preco: number, fatorUnidadeKg: number | null): number {
  return arredondar(fatorUnidadeKg ? preco / fatorUnidadeKg : preco, 4);
}
