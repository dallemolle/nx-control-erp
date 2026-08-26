import { z } from "zod";

export const fornecedorSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  cnpjCpf: z.string().trim().min(11, "CNPJ/CPF inválido"),
  contato: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  telefone: z.string().trim().optional().or(z.literal("")),
});

export type FornecedorFormValues = z.infer<typeof fornecedorSchema>;
