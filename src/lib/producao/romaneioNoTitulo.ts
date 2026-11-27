/** Documento que a recepção dá à conta a pagar: o romaneio ou, sem ele, `RF-<lote>`. */
export function documentoDoTituloDaRecepcao(documentoDaRecepcao: string | null, codigoLote: string): string {
  return documentoDaRecepcao ?? `RF-${codigoLote}`;
}

export type RomaneioNoTitulo = { segue: boolean; motivo?: string };

/**
 * Se o romaneio editado na recepção vai também para o documento da conta a pagar.
 * Só vai enquanto o título tem o documento que a recepção gerou (não foi mudado à
 * mão em Contas a pagar) e não tem pagamento registrado (pendente ou aprovado).
 */
export function romaneioNoTitulo(dados: {
  documentoDaRecepcao: string | null;
  codigoLote: string;
  documentoDoTitulo: string;
  temPagamento: boolean;
}): RomaneioNoTitulo {
  if (dados.documentoDoTitulo !== documentoDoTituloDaRecepcao(dados.documentoDaRecepcao, dados.codigoLote)) {
    return { segue: false, motivo: "o documento dela foi mudado em Contas a pagar; se precisar, edite lá" };
  }
  if (dados.temPagamento) {
    return { segue: false, motivo: "ela já tem pagamento registrado; se precisar, edite em Contas a pagar" };
  }
  return { segue: true };
}
