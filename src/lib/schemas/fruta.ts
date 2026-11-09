import { z } from "zod";
import { checkboxSchema } from "./campos";

export const frutaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  custoPadraoKg: z.coerce.number().min(0, "O custo não pode ser negativo").default(0),
  exigeBranqueamento: checkboxSchema,
});

export type FrutaFormValues = z.infer<typeof frutaSchema>;
