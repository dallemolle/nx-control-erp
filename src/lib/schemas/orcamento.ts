import { z } from "zod";
import { lerValorEmReais } from "@/lib/valorEmReais";

/**
 * Valor orçado digitado no Orçamento e na Comparação entre safras: lido do jeito brasileiro ("1.500" = R$ 1.500,00,
 * não R$ 1,50). Vazio ou ausente vale 0. Texto que não é um valor claro chega ao `z.number` como texto e dá o erro.
 */
export const valorOrcamentoSchema = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v !== "string") return v;
    return lerValorEmReais(v) ?? v;
  },
  z
    .number({ message: "Valor inválido: use o formato 1.500,00" })
    .min(0, "Não pode ser negativo")
    .max(999999999999999.99, "Valor muito alto"),
);
