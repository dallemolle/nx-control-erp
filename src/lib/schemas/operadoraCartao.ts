import { z } from "zod";
import { MODALIDADE_CARTAO } from "./enums";
import { cnpjCpfSchema } from "@/lib/cnpjCpf";
import { validarCondicoesCartao } from "@/lib/producao/cartao";

const condicaoSchema = z.object({
  modalidade: z.enum(MODALIDADE_CARTAO, { message: "Selecione a modalidade" }),
  parcelasDe: z.coerce.number().int(),
  parcelasAte: z.coerce.number().int(),
  taxaPercentual: z.number({ message: "Informe a taxa" }),
  prazoDias: z.number({ message: "Informe o prazo" }).int("O prazo é em dias inteiros"),
  antecipado: z.boolean(),
});

/** As condições chegam do formulário como JSON num campo escondido (como os itens do pedido). */
const condicoesDoFormulario = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
}, z.array(condicaoSchema));

export const operadoraCartaoSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome"),
    cnpjCpf: cnpjCpfSchema,
    contaBancariaId: z.string().trim().min(1, "Selecione a conta de depósito"),
    categoriaTaxaId: z.string().trim().min(1, "Selecione a categoria da taxa"),
    condicoes: condicoesDoFormulario,
  })
  .superRefine((dados, ctx) => {
    const erro = validarCondicoesCartao(dados.condicoes);
    if (erro) ctx.addIssue({ code: "custom", path: ["condicoes"], message: erro });
  });

export type OperadoraCartaoFormValues = z.infer<typeof operadoraCartaoSchema>;
