import { z } from "zod";

/**
 * Checkbox de formulário HTML: posta "on" quando marcado e nada quando desmarcado.
 * Sempre devolve boolean (ausente = false); o tipo aceita omitir o campo em
 * chamadas diretas ao serviço.
 */
export const checkboxSchema = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean().optional());

/** Número opcional vindo de `<input type="number">`: vazio vira `undefined`. */
export function numeroOpcional(schema: z.ZodNumber) {
  return z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    schema.optional(),
  );
}

/** Texto opcional: aparado; vazio vira `null` (gravado como nulo). */
export const textoOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  z.string().nullable().optional(),
);
