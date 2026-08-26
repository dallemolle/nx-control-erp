import { z } from "zod";

export const centroCustoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  codigo: z.string().trim().min(1, "Informe o código"),
  parentId: z.string().trim().optional().or(z.literal("")),
});

export type CentroCustoFormValues = z.infer<typeof centroCustoSchema>;
