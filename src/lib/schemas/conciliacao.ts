import { z } from "zod";
import { SEM_VALOR } from "./enums";

export const lancamentoDaLinhaSchema = z.object({
  linhaExtratoId: z.string().trim().min(1),
  descricao: z.string().trim().min(2, "Informe uma descrição"),
  categoriaFinanceiraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
});
export type LancamentoDaLinhaFormValues = z.infer<typeof lancamentoDaLinhaSchema>;
