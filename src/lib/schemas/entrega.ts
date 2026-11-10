import { z } from "zod";

export const STATUS_ENTREGA_EDITAVEL = ["PENDENTE", "EM_ROTA", "ENTREGUE"] as const;

/** Campo ausente do formulário fica `undefined` (mantém); enviado vazio vira `null` (apaga). */
const textoParcial = z.preprocess(
  (v) => (v === undefined ? undefined : typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  z.string().nullable().optional(),
);

/** Data ausente ou vazia fica `undefined` (mantém). */
const dataParcial = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.date().optional());

/** Alteração parcial da entrega: o serviço completa com os valores atuais. */
export const entregaSchema = z.object({
  dataPrevista: dataParcial,
  endereco: textoParcial,
  responsavel: textoParcial,
  observacao: textoParcial,
  status: z.enum(STATUS_ENTREGA_EDITAVEL).optional(),
  dataRealizada: dataParcial,
  recebidoPor: textoParcial,
});

export type DadosEntrega = z.infer<typeof entregaSchema>;
