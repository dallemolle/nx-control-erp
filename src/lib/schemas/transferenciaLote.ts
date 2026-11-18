import { z } from "zod";

/** Transferência de lote entre locais (D-36): kg ≤ saldo é conferido no serviço. */
export const transferenciaLoteSchema = z.object({
  loteId: z.string().trim().min(1, "Lote não informado"),
  localId: z.string().trim().min(1, "Selecione o local de destino"),
  quantidadeKg: z.coerce.number().positive("Informe uma quantidade maior que zero"),
});

export type TransferenciaLoteValues = z.infer<typeof transferenciaLoteSchema>;
