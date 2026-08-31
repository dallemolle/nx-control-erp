import { z } from "zod";
import { TIPO_CATEGORIA_FINANCEIRA } from "./enums";

export const categoriaFinanceiraSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  tipo: z.enum(TIPO_CATEGORIA_FINANCEIRA),
  parentId: z.string().trim().optional().or(z.literal("")),
});

export type CategoriaFinanceiraFormValues = z.infer<typeof categoriaFinanceiraSchema>;
