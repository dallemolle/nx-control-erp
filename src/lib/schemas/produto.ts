import { z } from "zod";
import { CATEGORIA_PRODUTO, CONSERVACAO } from "./enums";
import { numeroOpcional, textoOpcional } from "./campos";

export const produtoSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,6}$/, "Código com 1 a 6 letras ou números, sem espaços nem traços"),
    descricao: z.string().trim().min(2, "Informe a descrição"),
    categoria: z.enum(CATEGORIA_PRODUTO),
    frutaId: z.string().min(1, "Selecione a fruta"),
    conservacao: z.enum(CONSERVACAO),
    validadeDias: z.coerce.number().int("Use dias inteiros").min(1, "Validade mínima de 1 dia"),
    precoReferenciaKg: numeroOpcional(z.number().min(0, "O preço não pode ser negativo")),
    armazenamento: textoOpcional,
    unidadeComercial: textoOpcional,
    fatorUnidadeKg: numeroOpcional(z.number().positive("O fator deve ser maior que zero")),
  })
  .superRefine((dados, ctx) => {
    const temUnidade = dados.unidadeComercial != null;
    const temFator = dados.fatorUnidadeKg !== undefined;
    if (temUnidade !== temFator) {
      ctx.addIssue({
        code: "custom",
        path: [temUnidade ? "fatorUnidadeKg" : "unidadeComercial"],
        message: "Informe a unidade comercial e quantos kg ela tem, ou deixe os dois em branco",
      });
    }
  });

export type ProdutoFormValues = z.infer<typeof produtoSchema>;
