import { z } from "zod";
import { SEM_VALOR } from "./enums";
import { camposClassificacaoLancamento, refinarComprovanteDoLancamento } from "./lancamentoBancario";

export const lancamentoDaLinhaSchema = z
  .object({
    linhaExtratoId: z.string().trim().min(1),
    descricao: z.string().trim().min(2, "Informe uma descrição"),
    categoriaFinanceiraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
    centroCustoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
    centroLucroId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
    safraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
    projetoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
    ...camposClassificacaoLancamento,
  })
  .superRefine(refinarComprovanteDoLancamento);
export type LancamentoDaLinhaFormValues = z.infer<typeof lancamentoDaLinhaSchema>;
