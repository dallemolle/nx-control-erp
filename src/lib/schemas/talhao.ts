import { z } from "zod";
import { numeroOpcional, textoOpcional } from "./campos";

export const talhaoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  frutaId: z.string().min(1, "Selecione a cultura"),
  areaHa: z.coerce.number().positive("A área deve ser maior que zero"),
  anoPlantio: numeroOpcional(
    z
      .number()
      .int("Ano inválido")
      .min(1950, "Ano de plantio a partir de 1950")
      .max(new Date().getFullYear(), "Ano de plantio não pode ser futuro"),
  ),
  espacamento: textoOpcional,
  observacao: textoOpcional,
});

export type TalhaoFormValues = z.infer<typeof talhaoSchema>;
