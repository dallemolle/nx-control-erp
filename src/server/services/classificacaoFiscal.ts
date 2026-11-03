import type { Prisma } from "@prisma/client";
import { validarComprovante, type DadosComprovante, type FiltroClassificacao } from "@/lib/classificacaoFiscal";

// Regras puras (compartilhadas com schemas e formulários) — reexportadas para
// que services e módulos futuros tenham um único ponto de import no servidor.
export * from "@/lib/classificacaoFiscal";

/**
 * Regra de classificação/comprovante violada no service (depois de resolver o
 * padrão da contraparte, ou em duplicidade de nota). A API v1 devolve 422 com
 * `campos`; as Server Actions mostram a mensagem no formulário.
 */
export class ErroClassificacaoFiscal extends Error {
  campos: string[];

  constructor(message: string, campos: string[] = []) {
    super(message);
    this.name = "ErroClassificacaoFiscal";
    this.campos = campos;
  }
}

/** Lança `ErroClassificacaoFiscal` com todas as violações de `validarComprovante`. */
export function garantirComprovanteValido(dados: DadosComprovante): void {
  const erros = validarComprovante(dados);
  if (erros.length > 0) {
    throw new ErroClassificacaoFiscal(
      erros.map((erro) => erro.mensagem).join("; "),
      erros.map((erro) => erro.campo),
    );
  }
}

/** Filtro de `lancamentoBancario` por classificação; `undefined` = todos (consulta inalterada). */
export function whereLancamentoPorClassificacao(
  classificacao: FiltroClassificacao,
): Prisma.LancamentoBancarioWhereInput {
  return classificacao ? { classificacaoFiscal: classificacao } : {};
}

/** Filtro de `parcela` pela classificação do título; `undefined` = todos (consulta inalterada). */
export function whereParcelaPorClassificacao(classificacao: FiltroClassificacao): Prisma.ParcelaWhereInput {
  return classificacao ? { titulo: { classificacaoFiscal: classificacao } } : {};
}
