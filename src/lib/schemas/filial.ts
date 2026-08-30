import { z } from "zod";

export const filialSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  cnpj: z.string().trim().min(11, "CNPJ inválido"),
});

export type FilialFormValues = z.infer<typeof filialSchema>;
