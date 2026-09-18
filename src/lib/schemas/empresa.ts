import { z } from "zod";
import { cnpjCpfSchema } from "@/lib/cnpjCpf";

export const empresaSchema = z.object({
  razaoSocial: z.string().trim().min(3, "Informe a razão social"),
  nomeFantasia: z.string().trim().min(2, "Informe o nome fantasia"),
  cnpjCpf: cnpjCpfSchema,
  moedaPadrao: z
    .string()
    .trim()
    .length(3, "Use o código ISO da moeda, ex: BRL")
    .default("BRL"),
});

export type EmpresaFormValues = z.infer<typeof empresaSchema>;
