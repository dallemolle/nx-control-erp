import { z } from "zod";

export const premissasCenarioSchema = z.object({
  crescimentoReceita: z.coerce.number().min(-1, "Não pode ser menor que -100%").max(10, "Valor muito alto"),
  crescimentoCustos: z.coerce.number().min(-1, "Não pode ser menor que -100%").max(10, "Valor muito alto"),
  capexPercentualReceita: z.coerce.number().min(0, "Não pode ser negativo").max(1, "Não pode passar de 100% da receita"),
  novoEndividamentoAnual: z.coerce.number().min(0, "Não pode ser negativo").max(999999999999999.99, "Valor muito alto"),
  taxaJurosAnual: z.coerce.number().min(0, "Não pode ser negativa").max(2, "Valor muito alto"),
});

export type PremissasCenarioFormValues = z.infer<typeof premissasCenarioSchema>;
