import { z } from "zod";
import { cnpjCpfSchema } from "@/lib/cnpjCpf";

export const filialSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  cnpjCpf: cnpjCpfSchema,
});

export type FilialFormValues = z.infer<typeof filialSchema>;
