import { z } from "zod";
import { CANAL_VENDA, CLASSIFICACAO_FISCAL, FORMA_PAGAMENTO_VENDA, SEM_VALOR } from "./enums";
import { checkboxSchema, textoOpcional } from "./campos";
import { MAX_PARCELAS_VENDA } from "@/lib/producao/venda";

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

/** Parcelas da venda a prazo, em JSON num campo escondido (como os itens). */
const parcelasDoFormulario = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === "") return [];
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return [];
    }
  },
  z.array(
    z.object({
      dataVencimento: z.coerce.date({ message: "Informe o vencimento de cada parcela" }),
      valor: z.coerce.number({ message: "Informe o valor de cada parcela" }),
    }),
  ),
);

export const pedidoVendaSchema = z
  .object({
    data: z.coerce.date({ message: "Informe a data" }),
    clienteId: z.string().trim().min(1, "Selecione o cliente"),
    canal: enumOpcional(CANAL_VENDA),
    formaPagamento: z.enum(FORMA_PAGAMENTO_VENDA, { message: "Selecione a forma de pagamento" }),
    parcelas: parcelasDoFormulario,
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
    if (dados.formaPagamento !== "A_PRAZO") return;
    if (dados.parcelas.length === 0) {
      ctx.addIssue({ code: "custom", path: ["parcelas"], message: "Informe os prazos" });
    } else if (dados.parcelas.length > MAX_PARCELAS_VENDA) {
      ctx.addIssue({ code: "custom", path: ["parcelas"], message: `No máximo ${MAX_PARCELAS_VENDA} parcelas` });
    }
  });

export type PedidoVendaFormValues = z.infer<typeof pedidoVendaSchema>;

export const dadosEditaveisPedidoSchema = z.object({ observacao: textoOpcional });

export type DadosEditaveisPedido = z.infer<typeof dadosEditaveisPedidoSchema>;
