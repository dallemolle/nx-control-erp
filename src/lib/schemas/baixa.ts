import { z } from "zod";
import { MSG_BAIXA_SEM_ABATIMENTO, valorAbatidoDaBaixa } from "@/lib/financeiro/valorAbatido";

export const baixaSchema = z.object({
  data: z.coerce.date(),
  valorPago: z.coerce.number().positive("Informe um valor maior que zero"),
  valorJuros: z.coerce.number().min(0).default(0),
  valorMulta: z.coerce.number().min(0).default(0),
  valorDesconto: z.coerce.number().min(0).default(0),
  contaBancariaId: z.string().trim().min(1, "Selecione a conta bancária"),
}).refine((b) => valorAbatidoDaBaixa(b) > 0, { message: MSG_BAIXA_SEM_ABATIMENTO, path: ["valorJuros"] });
export type BaixaFormValues = z.infer<typeof baixaSchema>;

export const rejeicaoBaixaSchema = z.object({
  motivo: z.string().trim().min(3, "Informe o motivo da rejeição"),
});
export type RejeicaoBaixaFormValues = z.infer<typeof rejeicaoBaixaSchema>;
