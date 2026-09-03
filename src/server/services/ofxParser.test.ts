import { describe, expect, test } from "vitest";
import { parseOfx } from "./ofxParser";

const AMOSTRA_OFX = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260815120000
<TRNAMT>-150.00
<FITID>202608150001
<NAME>TARIFA MANUTENCAO CONTA
<MEMO>PACOTE DE SERVICOS
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260816120000
<TRNAMT>980.50
<FITID>202608160002
<NAME>PIX RECEBIDO
<MEMO>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

describe("parseOfx", () => {
  test("extrai as transações do bloco STMTTRN", () => {
    const transacoes = parseOfx(AMOSTRA_OFX);
    expect(transacoes).toHaveLength(2);
  });

  test("TRNAMT negativo vira SAIDA com valor positivo", () => {
    const [primeira] = parseOfx(AMOSTRA_OFX);
    expect(primeira.tipo).toBe("SAIDA");
    expect(primeira.valor).toBe(150);
    expect(primeira.identificadorBancario).toBe("202608150001");
    expect(primeira.historico).toBe("TARIFA MANUTENCAO CONTA — PACOTE DE SERVICOS");
    expect(primeira.data.getUTCFullYear()).toBe(2026);
    expect(primeira.data.getUTCMonth()).toBe(7); // agosto (0-indexado)
    expect(primeira.data.getUTCDate()).toBe(15);
  });

  test("TRNAMT positivo vira ENTRADA, e MEMO vazio não quebra o histórico", () => {
    const [, segunda] = parseOfx(AMOSTRA_OFX);
    expect(segunda.tipo).toBe("ENTRADA");
    expect(segunda.valor).toBe(980.5);
    expect(segunda.historico).toBe("PIX RECEBIDO");
  });

  test("linha sem FITID lança erro", () => {
    const semFitid = `<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260815120000\n<TRNAMT>-10.00\n<NAME>X\n</STMTTRN>`;
    expect(() => parseOfx(semFitid)).toThrow(/FITID/);
  });

  test("conteúdo sem nenhum STMTTRN retorna lista vazia", () => {
    expect(parseOfx("<OFX></OFX>")).toEqual([]);
  });
});
