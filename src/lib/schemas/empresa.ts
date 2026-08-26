import { z } from "zod";

export const empresaSchema = z.object({
  razaoSocial: z.string().trim().min(3, "Informe a razão social"),
  nomeFantasia: z.string().trim().min(2, "Informe o nome fantasia"),
  cnpj: z.string().trim().min(11, "CNPJ inválido"),
  moedaPadrao: z
    .string()
    .trim()
    .length(3, "Use o código ISO da moeda, ex: BRL")
    .default("BRL"),
});

export type EmpresaFormValues = z.infer<typeof empresaSchema>;
