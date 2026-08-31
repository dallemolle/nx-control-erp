import { z } from "zod";

export const bancoSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código"),
  nome: z.string().trim().min(2, "Informe o nome"),
});

export type BancoFormValues = z.infer<typeof bancoSchema>;
