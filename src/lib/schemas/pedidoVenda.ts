import { z } from "zod";
import { CANAL_VENDA, CLASSIFICACAO_FISCAL, FORMA_PAGAMENTO_VENDA, SEM_VALOR } from "./enums";
import { checkboxSchema, textoOpcional } from "./campos";

/** `<input type="date">` vazio vira `undefined`. */
const dataOpcional = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.date().optional());

/** Id opcional vindo de Select: vazio ou "nenhum" vira `undefined`. */
const idOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" && v !== SEM_VALOR ? v.trim() : undefined),
  z.string().optional(),
);

/** Enum opcional vindo de Select: vazio ou "nenhum" vira `undefined`. */
function enumOpcional<T extends readonly [string, ...string[]]>(valores: T) {
  return z.preprocess((v) => (v === "" || v === SEM_VALOR || v === null ? undefined : v), z.enum(valores).optional());
}

export const itemPedidoSchema = z.object({
  loteId: z.string().trim().min(1, "Selecione o lote"),
  quantidadeKg: z.coerce.number().positive("Informe a quantidade"),
  precoKg: z.coerce.number().positive("Informe o preço"),
  motivoLiberacaoVencido: textoOpcional,
});

export type ItemPedidoFormValues = z.infer<typeof itemPedidoSchema>;

/** Os itens chegam do formulário como JSON num campo escondido. */
const itensDoFormulario = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return [];
    }
  },
  z.array(itemPedidoSchema).min(1, "Inclua ao menos um item"),
);

export const pedidoVendaSchema = z
  .object({
    data: z.coerce.date({ message: "Informe a data" }),
    clienteId: z.string().trim().min(1, "Selecione o cliente"),
    canal: enumOpcional(CANAL_VENDA),
    formaPagamento: z.enum(FORMA_PAGAMENTO_VENDA, { message: "Selecione a forma de pagamento" }),
    vencimento: dataOpcional,
    contaBancariaId: idOpcional,
    retiraNaPropriedade: checkboxSchema.transform((v) => v ?? false),
    classificacaoFiscal: enumOpcional(CLASSIFICACAO_FISCAL),
    numeroDocumentoFiscal: textoOpcional,
    observacao: textoOpcional,
    entregaDataPrevista: dataOpcional,
    entregaEndereco: textoOpcional,
    itens: itensDoFormulario,
  })
  .superRefine((dados, ctx) => {
    if (dados.formaPagamento === "A_PRAZO" && !dados.vencimento) {
      ctx.addIssue({ code: "custom", path: ["vencimento"], message: "Informe o vencimento" });
    }
  });

export type PedidoVendaFormValues = z.infer<typeof pedidoVendaSchema>;

export const dadosEditaveisPedidoSchema = z.object({ observacao: textoOpcional });

export type DadosEditaveisPedido = z.infer<typeof dadosEditaveisPedidoSchema>;
