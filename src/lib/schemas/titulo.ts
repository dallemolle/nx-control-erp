import { z } from "zod";
import { CLASSIFICACAO_FISCAL, SEM_VALOR, TIPO_COMPROVANTE } from "./enums";
import { normalizarChaveAcesso, validarComprovante } from "@/lib/classificacaoFiscal";

const parcelaInputSchema = z.object({
  numero: z.coerce.number().int().min(1),
  dataVencimento: z.coerce.date(),
  valorOriginal: z.coerce.number().positive("Informe um valor maior que zero"),
});

const camposComuns = {
  contraparteId: z.string().trim().min(1, "Selecione o fornecedor/cliente"),
  documento: z.string().trim().min(1, "Informe o documento"),
  dataEmissao: z.coerce.date(),
  dataCompetencia: z.coerce.date(),
  categoriaFinanceiraId: z.string().trim().min(1, "Selecione a categoria financeira"),
  centroCustoId: z.string().trim().optional().or(z.literal("")),
  centroLucroId: z.string().trim().optional().or(z.literal("")),
  safraId: z.string().trim().optional().or(z.literal("")),
  projetoId: z.string().trim().optional().or(z.literal("")),
  contaBancariaId: z.string().trim().optional().or(z.literal("")),
  formaPagamento: z.string().trim().optional().or(z.literal("")),
  // Sem `.default()`: o service distingue "omitido" para aplicar o padrão da contraparte.
  classificacaoFiscal: z.enum(CLASSIFICACAO_FISCAL).optional().or(z.literal("")),
  tipoComprovante: z.enum(TIPO_COMPROVANTE).optional().or(z.literal(SEM_VALOR)).or(z.literal("")),
  numeroDocumentoFiscal: z.string().trim().optional().or(z.literal("")),
  serieDocumentoFiscal: z.string().trim().optional().or(z.literal("")),
  chaveAcesso: z.string().transform(normalizarChaveAcesso).optional(),
  dataEmissaoDocumentoFiscal: z.coerce.date().optional().or(z.literal("")),
  motivoSemDocumento: z.string().trim().optional().or(z.literal("")),
  /** Só na edição: obrigatório quando a classificação muda (checado no service, que conhece a anterior). */
  motivoReclassificacao: z.string().trim().optional().or(z.literal("")),
};

/**
 * Coerência do comprovante — só quando a classificação vem informada. Quando é
 * omitida, quem resolve (pelo padrão da contraparte) e valida é o service.
 */
function refinarComprovante(
  dados: {
    classificacaoFiscal?: (typeof CLASSIFICACAO_FISCAL)[number] | "";
    tipoComprovante?: (typeof TIPO_COMPROVANTE)[number] | typeof SEM_VALOR | "";
    numeroDocumentoFiscal?: string;
    serieDocumentoFiscal?: string;
    chaveAcesso?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (!dados.classificacaoFiscal) return;
  const tipo = dados.tipoComprovante && dados.tipoComprovante !== SEM_VALOR ? dados.tipoComprovante : null;
  for (const erro of validarComprovante({
    classificacaoFiscal: dados.classificacaoFiscal,
    tipoComprovante: tipo,
    numeroDocumentoFiscal: dados.numeroDocumentoFiscal || null,
    serieDocumentoFiscal: dados.serieDocumentoFiscal || null,
    chaveAcesso: dados.chaveAcesso || null,
  })) {
    ctx.addIssue({ code: "custom", path: [erro.campo], message: erro.mensagem });
  }
}

const tituloHeaderBase = z.object(camposComuns);

export const tituloHeaderSchema = tituloHeaderBase.superRefine(refinarComprovante);
export type TituloHeaderFormValues = z.infer<typeof tituloHeaderSchema>;

export const tituloSchema = tituloHeaderBase
  .extend({
    parcelas: z.array(parcelaInputSchema).min(1, "Informe ao menos uma parcela"),
  })
  .superRefine(refinarComprovante);
export type TituloFormValues = z.infer<typeof tituloSchema>;
export type ParcelaInput = z.infer<typeof parcelaInputSchema>;
