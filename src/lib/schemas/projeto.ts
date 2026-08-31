import { z } from "zod";
import { STATUS_SAFRA_PROJETO } from "./enums";

export const projetoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  codigo: z.string().trim().min(1, "Informe o código"),
  status: z.enum(STATUS_SAFRA_PROJETO).default("PLANEJADO"),
});

export type ProjetoFormValues = z.infer<typeof projetoSchema>;
