import { z } from "zod";
import { TIPO_CATEGORIA_FINANCEIRA } from "./enums";
import { checkboxSchema } from "./campos";

export const categoriaFinanceiraSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  tipo: z.enum(TIPO_CATEGORIA_FINANCEIRA),
  parentId: z.string().trim().optional().or(z.literal("")),
  naoOperacional: checkboxSchema,
});

export type CategoriaFinanceiraFormValues = z.infer<typeof categoriaFinanceiraSchema>;

/** O que o serviço aceita: igual ao formulário, mas `naoOperacional` ausente vale `false`. */
export type CategoriaFinanceiraDados = Omit<CategoriaFinanceiraFormValues, "naoOperacional"> & {
  naoOperacional?: boolean;
};
