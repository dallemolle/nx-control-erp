import { z } from "zod";
import { MEIO_PAGAMENTO, TIPO_CHAVE_PIX, TIPO_CONTA_TERCEIRO, SEM_VALOR } from "./enums";

export const clienteSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome"),
    cnpjCpf: z.string().trim().min(11, "CNPJ/CPF inválido"),
    contato: z.string().trim().optional().or(z.literal("")),
    email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
    telefone: z.string().trim().optional().or(z.literal("")),
    meioPagamento: z.enum(MEIO_PAGAMENTO).optional().or(z.literal(SEM_VALOR)),
    tipoChavePix: z.enum(TIPO_CHAVE_PIX).optional().or(z.literal(SEM_VALOR)),
    chavePix: z.string().trim().optional().or(z.literal("")),
    bancoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
    agencia: z.string().trim().optional().or(z.literal("")),
    conta: z.string().trim().optional().or(z.literal("")),
    tipoContaTerceiro: z.enum(TIPO_CONTA_TERCEIRO).optional().or(z.literal(SEM_VALOR)),
    titularConta: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((dados, ctx) => {
    if (dados.meioPagamento === "PIX") {
      if (!dados.tipoChavePix || dados.tipoChavePix === SEM_VALOR) {
        ctx.addIssue({ code: "custom", path: ["tipoChavePix"], message: "Selecione o tipo de chave" });
      }
      if (!dados.chavePix) {
        ctx.addIssue({ code: "custom", path: ["chavePix"], message: "Informe a chave PIX" });
      }
    }
    if (dados.meioPagamento === "DEPOSITO_BANCARIO") {
      if (!dados.bancoId || dados.bancoId === SEM_VALOR) {
        ctx.addIssue({ code: "custom", path: ["bancoId"], message: "Selecione o banco" });
      }
      if (!dados.agencia) {
        ctx.addIssue({ code: "custom", path: ["agencia"], message: "Informe a agência" });
      }
      if (!dados.conta) {
        ctx.addIssue({ code: "custom", path: ["conta"], message: "Informe a conta" });
      }
      if (!dados.tipoContaTerceiro || dados.tipoContaTerceiro === SEM_VALOR) {
        ctx.addIssue({ code: "custom", path: ["tipoContaTerceiro"], message: "Selecione o tipo de conta" });
      }
    }
  });

export type ClienteFormValues = z.infer<typeof clienteSchema>;
