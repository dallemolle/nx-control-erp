import type { ClassificacaoFiscal, TipoComprovante } from "@prisma/client";
import {
  CLASSIFICACAO_FISCAL,
  TIPO_COMPROVANTE_FISCAL,
  TIPO_COMPROVANTE_GERENCIAL,
  TIPOS_COM_CHAVE_ACESSO,
  TIPOS_COM_NUMERO_NOTA,
} from "@/lib/schemas/enums";

/**
 * Regras puras da classificação Fiscal × Gerencial. Ficam em `lib/` (e não em
 * `server/`) porque são usadas tanto pelos schemas Zod quanto pelo formulário
 * no navegador (validação da chave de acesso ao digitar).
 */

export type FiltroClassificacao = ClassificacaoFiscal | undefined; // undefined = todos

/** Aceita só "FISCAL" | "GERENCIAL"; qualquer outro valor (inclusive SEM_VALOR) = todos. */
export function classificacaoDaUrl(valor: string | undefined): FiltroClassificacao {
  return valor !== undefined && (CLASSIFICACAO_FISCAL as readonly string[]).includes(valor)
    ? (valor as ClassificacaoFiscal)
    : undefined;
}

export function grupoDoComprovante(tipo: TipoComprovante): ClassificacaoFiscal {
  return (TIPO_COMPROVANTE_GERENCIAL as readonly string[]).includes(tipo) ? "GERENCIAL" : "FISCAL";
}

export function tiposDeComprovanteDa(classificacao: ClassificacaoFiscal): readonly TipoComprovante[] {
  return classificacao === "FISCAL" ? TIPO_COMPROVANTE_FISCAL : TIPO_COMPROVANTE_GERENCIAL;
}

export function exigeNumeroNota(tipo: TipoComprovante | null | undefined): boolean {
  return !!tipo && (TIPOS_COM_NUMERO_NOTA as readonly string[]).includes(tipo);
}

export function aceitaChaveAcesso(tipo: TipoComprovante | null | undefined): boolean {
  return !!tipo && (TIPOS_COM_CHAVE_ACESSO as readonly string[]).includes(tipo);
}

/** Remove espaços, pontos e qualquer outro caractere que não seja dígito. */
export function normalizarChaveAcesso(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** 44 dígitos com o último sendo o DV módulo 11 (pesos 2..9 da direita para a esquerda). */
export function chaveAcessoValida(chave: string): boolean {
  if (!/^\d{44}$/.test(chave)) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(chave[43]);
}

/** informada ?? padrão da contraparte ?? FISCAL */
export function resolverClassificacao(
  informada: ClassificacaoFiscal | undefined,
  padraoContraparte: ClassificacaoFiscal | null | undefined,
): ClassificacaoFiscal {
  return informada ?? padraoContraparte ?? "FISCAL";
}

export type DadosComprovante = {
  classificacaoFiscal: ClassificacaoFiscal;
  tipoComprovante?: TipoComprovante | null;
  numeroDocumentoFiscal?: string | null;
  serieDocumentoFiscal?: string | null;
  chaveAcesso?: string | null;
};

export type ErroComprovante = { campo: keyof DadosComprovante; mensagem: string };

/**
 * Coerência entre a classificação e os dados do comprovante. Usada pelo
 * `superRefine` dos schemas, pelos services e pela importação CSV — as mesmas
 * regras valem em toda porta de entrada.
 */
export function validarComprovante(dados: DadosComprovante): ErroComprovante[] {
  const erros: ErroComprovante[] = [];
  const { classificacaoFiscal, tipoComprovante, numeroDocumentoFiscal, serieDocumentoFiscal, chaveAcesso } = dados;

  if (tipoComprovante && grupoDoComprovante(tipoComprovante) !== classificacaoFiscal) {
    erros.push({
      campo: "tipoComprovante",
      mensagem:
        classificacaoFiscal === "FISCAL"
          ? "Tipo de comprovante gerencial não pode ser usado em lançamento fiscal"
          : "Tipo de comprovante fiscal não pode ser usado em lançamento gerencial",
    });
  }

  if (classificacaoFiscal === "GERENCIAL") {
    if (numeroDocumentoFiscal) {
      erros.push({ campo: "numeroDocumentoFiscal", mensagem: "Lançamento gerencial não tem número de nota" });
    }
    if (serieDocumentoFiscal) {
      erros.push({ campo: "serieDocumentoFiscal", mensagem: "Lançamento gerencial não tem série de nota" });
    }
    if (chaveAcesso) {
      erros.push({ campo: "chaveAcesso", mensagem: "Lançamento gerencial não tem chave de acesso" });
    }
    return erros;
  }

  if (numeroDocumentoFiscal && !tipoComprovante) {
    erros.push({ campo: "tipoComprovante", mensagem: "Selecione o tipo de documento da nota" });
  }

  if (chaveAcesso) {
    if (!aceitaChaveAcesso(tipoComprovante)) {
      erros.push({ campo: "chaveAcesso", mensagem: "Chave de acesso só existe para NF-e, NFC-e e CT-e" });
    } else if (!chaveAcessoValida(chaveAcesso)) {
      erros.push({ campo: "chaveAcesso", mensagem: "Chave de acesso inválida (44 dígitos com dígito verificador)" });
    }
  }

  return erros;
}

export type PendenciaFiscal = "SEM_TIPO_DOCUMENTO" | "SEM_NUMERO_NOTA" | "SEM_CHAVE_ACESSO" | "SEM_ANEXO";

export const ROTULOS_PENDENCIA_FISCAL: Record<PendenciaFiscal, string> = {
  SEM_TIPO_DOCUMENTO: "Sem tipo de documento",
  SEM_NUMERO_NOTA: "Sem número da nota",
  SEM_CHAVE_ACESSO: "Sem chave de acesso",
  SEM_ANEXO: "Sem anexo",
};

/** O que falta num título FISCAL. Não bloqueia o cadastro (FG2) — alimenta o relatório de pendências. */
export function pendenciasFiscaisDoTitulo(
  titulo: {
    classificacaoFiscal: ClassificacaoFiscal;
    tipoComprovante: TipoComprovante | null;
    numeroDocumentoFiscal: string | null;
    chaveAcesso: string | null;
  },
  quantidadeAnexos: number,
): PendenciaFiscal[] {
  if (titulo.classificacaoFiscal === "GERENCIAL") return [];

  const pendencias: PendenciaFiscal[] = [];
  if (!titulo.tipoComprovante) pendencias.push("SEM_TIPO_DOCUMENTO");
  if (exigeNumeroNota(titulo.tipoComprovante) && !titulo.numeroDocumentoFiscal) pendencias.push("SEM_NUMERO_NOTA");
  if (aceitaChaveAcesso(titulo.tipoComprovante) && !titulo.chaveAcesso) pendencias.push("SEM_CHAVE_ACESSO");
  if (quantidadeAnexos === 0) pendencias.push("SEM_ANEXO");
  return pendencias;
}
