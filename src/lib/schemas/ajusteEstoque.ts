import { z } from "zod";
import { MOTIVO_AJUSTE_ESTOQUE } from "./enums";
import { textoOpcional } from "./campos";

export const SENTIDO_AJUSTE = ["ENTRADA", "SAIDA"] as const;

export const ajusteSchema = z.object({
  loteId: z.string().trim().min(1, "Selecione o lote"),
  data: z.coerce.date({ message: "Informe a data" }),
  sentido: z.enum(SENTIDO_AJUSTE),
  /** Sempre positiva; o sinal vem do sentido. */
  quantidadeKg: z.coerce.number().positive("Informe uma quantidade maior que zero"),
  motivo: z.enum(MOTIVO_AJUSTE_ESTOQUE),
  observacao: textoOpcional,
});

export type AjusteFormValues = z.infer<typeof ajusteSchema>;
