import { z } from "zod";

/**
 * Checkbox de formulário HTML: posta "on" quando marcado e nada quando desmarcado.
 * Sempre devolve boolean (ausente = false).
 *
 * O schema interno não pode ser `.optional()`: desde o zod 4.6, chave ausente
 * com schema opcional pula o `preprocess` e some do resultado — o checkbox
 * desmarcado viraria `undefined` e a edição não gravaria o `false`.
 */
export const checkboxSchema = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Número opcional vindo de `<input type="number">`: vazio vira `undefined`. */
export function numeroOpcional(schema: z.ZodNumber) {
  return z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    schema.optional(),
  );
}

/**
 * Texto opcional: aparado; vazio ou ausente vira `null` (gravado como nulo).
 * Sem `.optional()` no schema interno pelo mesmo motivo do `checkboxSchema`.
 */
export const textoOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  z.string().nullable(),
);
