import { z } from "zod";
import { TIPO_LOCAL_ARMAZENAMENTO } from "./enums";
import { numeroOpcional, textoOpcional } from "./campos";

export const localArmazenamentoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  tipo: z.enum(TIPO_LOCAL_ARMAZENAMENTO),
  temperatura: textoOpcional,
  capacidadeKg: numeroOpcional(z.number().positive("A capacidade deve ser maior que zero")),
});

export type LocalArmazenamentoFormValues = z.infer<typeof localArmazenamentoSchema>;
