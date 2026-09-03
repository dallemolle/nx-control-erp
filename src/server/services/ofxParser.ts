
export type TransacaoOfx = {
  data: Date;
  valor: number;
  tipo: "ENTRADA" | "SAIDA";
  historico: string;
  identificadorBancario: string;
};

function extrairTag(bloco: string, tag: string): string | null {
  const match = bloco.match(new RegExp(`<${tag}>([^\\r\\n<]*)`, "i"));
  return match ? match[1].trim() : null;
}

function parseDataOfx(valor: string): Date {
  const ano = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(4, 6));
  const dia = Number(valor.slice(6, 8));
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/**
 * Parser próprio, sem dependência: OFX é um bloco de tags `<TAG>valor`
 * (uma por linha, sem fechamento) dentro de `<STMTTRN>...</STMTTRN>`.
 * Nenhuma lib de OFX no npm está mantida o suficiente pra justificar a
 * dependência num formato tão simples.
 */
export function parseOfx(conteudo: string): TransacaoOfx[] {
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  return blocos.map((bloco) => {
    const trnamt = extrairTag(bloco, "TRNAMT");
    const dtposted = extrairTag(bloco, "DTPOSTED");
    const fitid = extrairTag(bloco, "FITID");
    const name = extrairTag(bloco, "NAME") ?? "";
    const memo = extrairTag(bloco, "MEMO") ?? "";
    const trntype = extrairTag(bloco, "TRNTYPE");

    if (!trnamt || !dtposted || !fitid) {
      throw new Error("Linha de extrato OFX inválida: faltam TRNAMT, DTPOSTED ou FITID");
    }

    const valorNumerico = Number(trnamt);

    // TRNTYPE manda quando presente e reconhecível — alguns bancos emitem
    // TRNAMT sem sinal (ex.: DEBIT positivo), então confiar só no sinal do
    // valor classificaria essas linhas errado. Vocabulário de TRNTYPE varia
    // entre bancos, então tratamos com tolerância (contém CREDIT/DEBIT) e
    // caímos pro sinal do valor pra qualquer tipo não reconhecido.
    const trntypeNormalizado = trntype?.toUpperCase() ?? "";
    const tipo: "ENTRADA" | "SAIDA" = trntypeNormalizado.includes("CREDIT")
      ? "ENTRADA"
      : trntypeNormalizado.includes("DEBIT")
        ? "SAIDA"
        : valorNumerico < 0
          ? "SAIDA"
          : "ENTRADA";

    return {
      data: parseDataOfx(dtposted),
      valor: Math.abs(valorNumerico),
      tipo,
      historico: [name, memo].filter(Boolean).join(" — ") || "Sem histórico",
      identificadorBancario: fitid,
    };
  });
}
