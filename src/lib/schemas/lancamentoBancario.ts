import { z } from "zod";
import { TIPO_LANCAMENTO, SEM_VALOR } from "./enums";

export const lancamentoManualSchema = z.object({
  contaBancariaId: z.string().trim().min(1, "Selecione a conta bancária"),
  data: z.coerce.date(),
  tipo: z.enum(TIPO_LANCAMENTO),
  valor: z.coerce.number().positive("Informe um valor maior que zero"),
  descricao: z.string().trim().min(2, "Informe uma descrição"),
  categoriaFinanceiraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
});
export type LancamentoManualFormValues = z.infer<typeof lancamentoManualSchema>;

export const transferenciaSchema = z
  .object({
    contaOrigemId: z.string().trim().min(1, "Selecione a conta de origem"),
    contaDestinoId: z.string().trim().min(1, "Selecione a conta de destino"),
    data: z.coerce.date(),
    valor: z.coerce.number().positive("Informe um valor maior que zero"),
    descricao: z.string().trim().min(2, "Informe uma descrição"),
  })
  .refine((dados) => dados.contaOrigemId !== dados.contaDestinoId, {
    message: "Selecione contas diferentes para origem e destino",
    path: ["contaDestinoId"],
  });
export type TransferenciaFormValues = z.infer<typeof transferenciaSchema>;

export const saldoBancarioSchema = z.object({
  contaBancariaId: z.string().trim().min(1, "Selecione a conta bancária"),
  data: z.coerce.date(),
  saldo: z.coerce.number(),
});
export type SaldoBancarioFormValues = z.infer<typeof saldoBancarioSchema>;
