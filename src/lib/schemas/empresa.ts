import { z } from "zod";
import { cnpjCpfSchema } from "@/lib/cnpjCpf";
import { corHexValida } from "@/lib/corContraste";

export const empresaSchema = z.object({
  razaoSocial: z.string().trim().min(3, "Informe a razão social"),
  nomeFantasia: z.string().trim().min(2, "Informe o nome fantasia"),
  cnpjCpf: cnpjCpfSchema,
  moedaPadrao: z
    .string()
    .trim()
    .length(3, "Use o código ISO da moeda, ex: BRL")
    .default("BRL"),
  corPrimaria: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || corHexValida(v), "Cor inválida"),
});

export type EmpresaFormValues = z.infer<typeof empresaSchema>;
