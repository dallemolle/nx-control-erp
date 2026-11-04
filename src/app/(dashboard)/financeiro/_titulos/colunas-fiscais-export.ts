import type { ClassificacaoFiscal, TipoComprovante } from "@prisma/client";
import { type ColunaExport } from "@/lib/export/csv";
import { ROTULOS_TIPO_COMPROVANTE } from "@/lib/schemas/enums";
import { pendenciasFiscaisDoTitulo, ROTULOS_PENDENCIA_FISCAL } from "@/lib/classificacaoFiscal";

export type CamposFiscaisExport = {
  classificacao: string;
  tipoComprovante: string;
  numeroNota: string;
  serie: string;
  chaveAcesso: string;
  pendencias: string;
};

/** Dados fiscais do título já formatados para o export (rótulos legíveis, pendências separadas por "; "). */
export function camposFiscaisDoTitulo(titulo: {
  classificacaoFiscal: ClassificacaoFiscal;
  tipoComprovante: TipoComprovante | null;
  numeroDocumentoFiscal: string | null;
  serieDocumentoFiscal: string | null;
  chaveAcesso: string | null;
  _count: { anexos: number };
}): CamposFiscaisExport {
  return {
    classificacao: titulo.classificacaoFiscal === "FISCAL" ? "Fiscal" : "Gerencial",
    tipoComprovante: titulo.tipoComprovante ? ROTULOS_TIPO_COMPROVANTE[titulo.tipoComprovante] : "",
    numeroNota: titulo.numeroDocumentoFiscal ?? "",
    serie: titulo.serieDocumentoFiscal ?? "",
    chaveAcesso: titulo.chaveAcesso ?? "",
    pendencias: pendenciasFiscaisDoTitulo(titulo, titulo._count.anexos)
      .map((pendencia) => ROTULOS_PENDENCIA_FISCAL[pendencia])
      .join("; "),
  };
}

/** Colunas acrescentadas AO FINAL dos exports de títulos — quem lê o arquivo por posição não quebra. */
export const COLUNAS_FISCAIS: ColunaExport<CamposFiscaisExport>[] = [
  { rotulo: "Classificação", valor: (l) => l.classificacao },
  { rotulo: "Tipo de comprovante", valor: (l) => l.tipoComprovante },
  { rotulo: "Nº nota", valor: (l) => l.numeroNota },
  { rotulo: "Série", valor: (l) => l.serie },
  { rotulo: "Chave de acesso", valor: (l) => l.chaveAcesso },
  { rotulo: "Pendências fiscais", valor: (l) => l.pendencias },
];
