import { z } from "zod";
import { SEM_VALOR } from "./enums";
import { camposClassificacaoLancamento, refinarComprovanteDoLancamento } from "./lancamentoBancario";

/** Lançamento criado na conciliação: a partir de uma linha ou como diferença de um grupo. */
const camposLancamentoAvulso = {
  descricao: z.string().trim().min(2, "Informe uma descrição"),
  categoriaFinanceiraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  centroCustoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  centroLucroId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  safraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  projetoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  ...camposClassificacaoLancamento,
};

export const lancamentoAvulsoSchema = z.object(camposLancamentoAvulso).superRefine(refinarComprovanteDoLancamento);
export type LancamentoAvulsoFormValues = z.infer<typeof lancamentoAvulsoSchema>;

export const lancamentoDaLinhaSchema = z
  .object({ linhaExtratoId: z.string().trim().min(1), ...camposLancamentoAvulso })
  .superRefine(refinarComprovanteDoLancamento);
export type LancamentoDaLinhaFormValues = z.infer<typeof lancamentoDaLinhaSchema>;
