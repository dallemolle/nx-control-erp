import { z } from "zod";

/** Formata um CNPJ/CPF a partir dos dígitos, ignorando qualquer pontuação já presente. */
export function formatarCnpjCpf(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length === 11) {
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digitos.length === 14) {
    return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return digitos;
}

/**
 * Schema compartilhado para os campos cnpjCpf dos cadastros (Empresa, Filial,
 * Fornecedor, Cliente). Aceita o valor com ou sem máscara e sempre devolve
 * formatado — CPF (11 dígitos) ou CNPJ (14 dígitos) são os únicos tamanhos aceitos.
 */
export const cnpjCpfSchema = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((digitos) => digitos.length === 11 || digitos.length === 14, {
    message: "CNPJ/CPF deve ter 11 (CPF) ou 14 (CNPJ) dígitos",
  })
  .transform(formatarCnpjCpf);
