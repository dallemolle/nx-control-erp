import type { MeioPagamento, TipoChavePix, TipoContaTerceiro } from "@prisma/client";

const ROTULOS_CHAVE_PIX: Record<TipoChavePix, string> = {
  CPF_CNPJ: "CPF/CNPJ",
  CELULAR: "Celular",
  EMAIL: "Email",
  ALEATORIA: "Chave aleatória",
};

const ROTULOS_TIPO_CONTA: Record<TipoContaTerceiro, string> = { CORRENTE: "corrente", POUPANCA: "poupança" };

export type DadosBancariosDoCadastro = {
  meioPagamento: MeioPagamento | null;
  tipoChavePix: TipoChavePix | null;
  chavePix: string | null;
  banco: { codigo: string; nome: string } | null;
  agencia: string | null;
  conta: string | null;
  tipoContaTerceiro: TipoContaTerceiro | null;
  titularConta: string | null;
};

/**
 * Os dados bancários do cadastro do fornecedor/cliente numa linha, para pagar (ou devolver)
 * sem abrir o cadastro. `null` quando não há o que mostrar.
 */
export function dadosBancariosDaContraparte(dados: DadosBancariosDoCadastro): string | null {
  if (dados.meioPagamento === "PIX") {
    if (!dados.chavePix) return null;
    const tipo = dados.tipoChavePix ? ` (${ROTULOS_CHAVE_PIX[dados.tipoChavePix]})` : "";
    return `Pix${tipo}: ${dados.chavePix}`;
  }
  if (dados.meioPagamento === "DEPOSITO_BANCARIO") {
    const partes = [
      dados.banco ? `${dados.banco.codigo} · ${dados.banco.nome}` : null,
      dados.agencia ? `ag. ${dados.agencia}` : null,
      dados.conta
        ? `conta ${dados.conta}${dados.tipoContaTerceiro ? ` (${ROTULOS_TIPO_CONTA[dados.tipoContaTerceiro]})` : ""}`
        : null,
      dados.titularConta ? `titular ${dados.titularConta}` : null,
    ].filter((parte) => parte !== null);
    return partes.length > 0 ? `Depósito: ${partes.join(" · ")}` : null;
  }
  return null;
}
