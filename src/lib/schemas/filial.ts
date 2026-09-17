import { z } from "zod";

export const filialSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  cnpjCpf: z.string().trim().min(11, "CNPJ/CPF inválido"),
});

export type FilialFormValues = z.infer<typeof filialSchema>;
