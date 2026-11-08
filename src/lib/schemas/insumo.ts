import { z } from "zod";

export const insumoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  unidade: z.string().trim().min(1, "Informe a unidade (un, kWh, h…)"),
  custoUnitario: z.coerce.number().min(0, "O custo não pode ser negativo"),
});

export type InsumoFormValues = z.infer<typeof insumoSchema>;
