import { z } from "zod";

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
};

export const tituloHeaderSchema = z.object(camposComuns);
export type TituloHeaderFormValues = z.infer<typeof tituloHeaderSchema>;

export const tituloSchema = tituloHeaderSchema.extend({
  parcelas: z.array(parcelaInputSchema).min(1, "Informe ao menos uma parcela"),
});
export type TituloFormValues = z.infer<typeof tituloSchema>;
export type ParcelaInput = z.infer<typeof parcelaInputSchema>;
