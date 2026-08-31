import { z } from "zod";

export const centroLucroSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  codigo: z.string().trim().min(1, "Informe o código"),
});

export type CentroLucroFormValues = z.infer<typeof centroLucroSchema>;
