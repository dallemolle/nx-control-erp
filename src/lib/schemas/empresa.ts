import { z } from "zod";
import { cnpjCpfSchema } from "@/lib/cnpjCpf";
import { checkboxSchema } from "./campos";

export const empresaSchema = z.object({
  razaoSocial: z.string().trim().min(3, "Informe a razão social"),
  nomeFantasia: z.string().trim().min(2, "Informe o nome fantasia"),
  cnpjCpf: cnpjCpfSchema,
  moedaPadrao: z
    .string()
    .trim()
    .length(3, "Use o código ISO da moeda, ex: BRL")
    .default("BRL"),
  // Cor e logo ficam no Tema e marca. A corPrimaria antiga continua no banco e pinta a barra lateral enquanto
  // a empresa não tem tema salvo (src/app/(dashboard)/layout.tsx).
  exigirAprovacaoPorOutro: checkboxSchema,
});

export type EmpresaFormValues = z.infer<typeof empresaSchema>;
