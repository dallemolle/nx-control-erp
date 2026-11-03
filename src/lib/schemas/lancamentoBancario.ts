import { z } from "zod";
import { CLASSIFICACAO_FISCAL, TIPO_COMPROVANTE, TIPO_LANCAMENTO, SEM_VALOR } from "./enums";
import { grupoDoComprovante } from "@/lib/classificacaoFiscal";

/** Classificação + comprovante de um lançamento avulso (manual ou criado na conciliação). */
export const camposClassificacaoLancamento = {
  // Opcional (não `.default`) para não exigir o campo de quem já chama os services; o
  // service aplica FISCAL quando omitido.
  classificacaoFiscal: z.enum(CLASSIFICACAO_FISCAL).optional(),
  tipoComprovante: z.enum(TIPO_COMPROVANTE).optional().or(z.literal(SEM_VALOR)).or(z.literal("")),
  numeroComprovante: z.string().trim().optional().or(z.literal("")),
};

export function refinarComprovanteDoLancamento(
  dados: { classificacaoFiscal?: (typeof CLASSIFICACAO_FISCAL)[number]; tipoComprovante?: string },
  ctx: z.RefinementCtx,
) {
  const tipo = dados.tipoComprovante;
  if (!tipo || tipo === SEM_VALOR) return;
  if (grupoDoComprovante(tipo as (typeof TIPO_COMPROVANTE)[number]) !== (dados.classificacaoFiscal ?? "FISCAL")) {
    ctx.addIssue({
      code: "custom",
      path: ["tipoComprovante"],
      message: "Tipo de comprovante não combina com a classificação",
    });
  }
}

export const lancamentoManualSchema = z
  .object({
    contaBancariaId: z.string().trim().min(1, "Selecione a conta bancária"),
    data: z.coerce.date(),
    tipo: z.enum(TIPO_LANCAMENTO),
    valor: z.coerce.number().positive("Informe um valor maior que zero"),
    descricao: z.string().trim().min(2, "Informe uma descrição"),
    categoriaFinanceiraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
    centroCustoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
    centroLucroId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
    safraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
    projetoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
    ...camposClassificacaoLancamento,
  })
  .superRefine(refinarComprovanteDoLancamento);
export type LancamentoManualFormValues = z.infer<typeof lancamentoManualSchema>;

export const transferenciaSchema = z
  .object({
    contaOrigemId: z.string().trim().min(1, "Selecione a conta de origem"),
    contaDestinoId: z.string().trim().min(1, "Selecione a conta de destino"),
    data: z.coerce.date(),
    valor: z.coerce.number().positive("Informe um valor maior que zero"),
    descricao: z.string().trim().min(2, "Informe uma descrição"),
  })
  .refine((dados) => dados.contaOrigemId !== dados.contaDestinoId, {
    message: "Selecione contas diferentes para origem e destino",
    path: ["contaDestinoId"],
  });
export type TransferenciaFormValues = z.infer<typeof transferenciaSchema>;

export const saldoBancarioSchema = z.object({
  contaBancariaId: z.string().trim().min(1, "Selecione a conta bancária"),
  data: z.coerce.date(),
  saldo: z.coerce.number(),
});
export type SaldoBancarioFormValues = z.infer<typeof saldoBancarioSchema>;
