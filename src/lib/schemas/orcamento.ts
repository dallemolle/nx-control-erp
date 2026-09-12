import { z } from "zod";

export const valorOrcamentoSchema = z.coerce.number().min(0, "Não pode ser negativo").max(999999999999999.99, "Valor muito alto");
