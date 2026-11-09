import { z } from "zod";
import { CLASSIFICACAO_FISCAL, ORIGEM_RECEPCAO, QUALIDADE_FRUTO, SEM_VALOR } from "./enums";
import { numeroOpcional, textoOpcional } from "./campos";

export const UNIDADE_RECEPCAO = ["KG", "COMERCIAL"] as const;

/** `<input type="date">` vazio vira `undefined`. */
const dataOpcional = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.date().optional());

/** Id opcional vindo de Select: vazio ou "nenhum" vira `undefined`. */
const idOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" && v !== SEM_VALOR ? v.trim() : undefined),
  z.string().optional(),
);

export const recepcaoSchema = z
  .object({
    data: z.coerce.date({ message: "Informe a data" }),
    produtoId: z.string().trim().min(1, "Selecione o produto"),
    origem: z.enum(ORIGEM_RECEPCAO),
    talhaoId: idOpcional,
    fornecedorId: idOpcional,
    localId: z.string().trim().min(1, "Selecione o local"),
    /** Unidade em que peso, descarte e preço foram digitados. */
    unidade: z.enum(UNIDADE_RECEPCAO).default("KG"),
    pesoBruto: z.coerce.number().positive("Informe o peso bruto"),
    descarte: z.coerce.number().min(0, "O descarte não pode ser negativo").default(0),
    preco: numeroOpcional(z.number().min(0, "O preço não pode ser negativo")),
    qualidade: z.preprocess(
      (v) => (v === "" || v === SEM_VALOR ? undefined : v),
      z.enum(QUALIDADE_FRUTO).optional(),
    ),
    documento: textoOpcional,
    observacao: textoOpcional,
    safraId: idOpcional,
    dataVencimento: dataOpcional,
    classificacaoFiscal: z.preprocess((v) => (v === "" ? undefined : v), z.enum(CLASSIFICACAO_FISCAL).optional()),
    numeroNotaProdutor: textoOpcional,
  })
  .superRefine((dados, ctx) => {
    if (dados.origem === "PROPRIA" && !dados.talhaoId) {
      ctx.addIssue({ code: "custom", path: ["talhaoId"], message: "Selecione o talhão" });
    }
    if (dados.origem === "TERCEIRO") {
      if (!dados.fornecedorId) {
        ctx.addIssue({ code: "custom", path: ["fornecedorId"], message: "Selecione o fornecedor" });
      }
      if (dados.preco === undefined) {
        ctx.addIssue({ code: "custom", path: ["preco"], message: "Informe o preço" });
      }
      if (dados.classificacaoFiscal === "FISCAL" && !dados.numeroNotaProdutor) {
        ctx.addIssue({
          code: "custom",
          path: ["numeroNotaProdutor"],
          message: "Informe o número da nota do produtor",
        });
      }
    }
  });

export type RecepcaoFormValues = z.infer<typeof recepcaoSchema>;

export const dadosEditaveisRecepcaoSchema = z.object({
  qualidade: z.preprocess((v) => (v === "" || v === SEM_VALOR ? undefined : v), z.enum(QUALIDADE_FRUTO).optional()),
  documento: textoOpcional,
  observacao: textoOpcional,
});

export type DadosEditaveisRecepcao = z.infer<typeof dadosEditaveisRecepcaoSchema>;
