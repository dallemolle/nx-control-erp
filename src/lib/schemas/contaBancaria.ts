import { z } from "zod";
import { TIPO_CONTA_BANCARIA } from "./enums";

/** Código do banco sentinela das contas Caixa (dinheiro em espécie). */
export const CODIGO_BANCO_CAIXA = "CX";
/** Agência gravada nas contas Caixa, que não têm agência. */
export const AGENCIA_CONTA_CAIXA = "-";

export const contaBancariaSchema = z
  .object({
    // Conta Caixa não informa banco nem agência: o serviço usa o banco CX.
    bancoId: z.string().trim().default(""),
    agencia: z.string().trim().default(""),
    conta: z.string().trim().min(1, "Informe a conta"),
    tipo: z.enum(TIPO_CONTA_BANCARIA).default("CORRENTE"),
    moeda: z.string().trim().min(1, "Informe a moeda"),
    saldoInicial: z.coerce.number(),
  })
  .superRefine((dados, ctx) => {
    if (dados.tipo === "CAIXA") return;
    if (!dados.bancoId) ctx.addIssue({ code: "custom", path: ["bancoId"], message: "Selecione o banco" });
    if (!dados.agencia) ctx.addIssue({ code: "custom", path: ["agencia"], message: "Informe a agência" });
  });

export type ContaBancariaFormValues = z.infer<typeof contaBancariaSchema>;
