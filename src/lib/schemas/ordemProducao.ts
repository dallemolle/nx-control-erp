import { z } from "zod";
import { numeroOpcional, textoOpcional } from "./campos";

const kg = (mensagem: string) => z.coerce.number({ message: mensagem }).positive(mensagem);
const naoNegativo = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 0 : v),
  z.coerce.number().min(0, "Não pode ser negativo"),
);
/** Número que pode ser apagado: vazio vira `null`. */
const numeroOuNulo = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), schema.nullable());

/** Nova OP e edição do cabeçalho (data e fruta só sem linhas). */
export const cabecalhoOPSchema = z.object({
  data: z.coerce.date({ message: "Informe a data" }),
  frutaId: z.string().trim().min(1, "Selecione a fruta"),
  responsavel: textoOpcional,
});

export type CabecalhoOPValues = z.infer<typeof cabecalhoOPSchema>;

/** Aba "Processo": substitui todos estes campos de uma vez. */
export const processoOPSchema = z.object({
  branqueamentoTemperaturaC: numeroOuNulo(z.number().min(0, "Mínimo 0 °C").max(150, "Máximo 150 °C")),
  branqueamentoTempoS: numeroOuNulo(z.number().int("Use segundos inteiros").min(0, "Não pode ser negativo")),
  aguaLitros: naoNegativo,
  carocoResiduoKg: naoNegativo,
  perdaKg: naoNegativo,
  observacao: textoOpcional,
});

export type ProcessoOPValues = z.infer<typeof processoOPSchema>;

export const consumoSchema = z.object({
  loteId: z.string().trim().min(1, "Selecione o lote"),
  quantidadeKg: kg("Informe a quantidade"),
  motivoLiberacaoVencido: textoOpcional,
});

export type ConsumoValues = z.infer<typeof consumoSchema>;

export const producaoSchema = z.object({
  produtoId: z.string().trim().min(1, "Selecione o produto"),
  quantidadeKg: kg("Informe a quantidade"),
  embalagens: numeroOpcional(
    z.number().int("Use embalagens inteiras").min(1, "Mínimo 1 embalagem").max(10000, "Máximo 10.000 embalagens"),
  ),
  localId: z.string().trim().min(1, "Selecione o local"),
});

export type ProducaoValues = z.infer<typeof producaoSchema>;

export const insumoOPSchema = z.object({
  insumoId: z.string().trim().min(1, "Selecione o insumo"),
  quantidade: kg("Informe a quantidade"),
});

export type InsumoOPValues = z.infer<typeof insumoOPSchema>;
