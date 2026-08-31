import { z } from "zod";
import { STATUS_SAFRA_PROJETO } from "./enums";

export const safraSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome"),
    dataInicio: z.coerce.date(),
    dataFim: z.coerce.date(),
    status: z.enum(STATUS_SAFRA_PROJETO).default("PLANEJADO"),
  })
  .refine((dados) => dados.dataFim > dados.dataInicio, {
    message: "Data de fim deve ser posterior à data de início",
    path: ["dataFim"],
  });

export type SafraFormValues = z.infer<typeof safraSchema>;
