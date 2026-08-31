import { z } from "zod";
import { TIPO_CONTA_BANCARIA } from "./enums";

export const contaBancariaSchema = z.object({
  bancoId: z.string().trim().min(1, "Selecione o banco"),
  agencia: z.string().trim().min(1, "Informe a agência"),
  conta: z.string().trim().min(1, "Informe a conta"),
  tipo: z.enum(TIPO_CONTA_BANCARIA).default("CORRENTE"),
  moeda: z.string().trim().min(1, "Informe a moeda"),
  saldoInicial: z.coerce.number(),
});

export type ContaBancariaFormValues = z.infer<typeof contaBancariaSchema>;
