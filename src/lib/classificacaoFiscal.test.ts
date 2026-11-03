import { describe, expect, test } from "vitest";
import {
  chaveAcessoValida,
  classificacaoDaUrl,
  grupoDoComprovante,
  normalizarChaveAcesso,
  pendenciasFiscaisDoTitulo,
  resolverClassificacao,
  tiposDeComprovanteDa,
  validarComprovante,
} from "./classificacaoFiscal";
import { SEM_VALOR } from "@/lib/schemas/enums";

// 43 dígitos (cUF 35, AAMM 2403, CNPJ, modelo 55, série 001, nNF, tpEmis, cNF) + DV 2.
const CHAVE_VALIDA = "35240312345678000195550010000012341123456782";
const CHAVE_DV_ERRADO = "35240312345678000195550010000012341123456783";

describe("chaveAcessoValida", () => {
  test("aceita chave com DV módulo 11 correto", () => {
    expect(chaveAcessoValida(CHAVE_VALIDA)).toBe(true);
  });

  test("recusa a mesma chave com o DV alterado", () => {
    expect(chaveAcessoValida(CHAVE_DV_ERRADO)).toBe(false);
  });

  test("recusa tamanho diferente de 44 ou caractere não numérico", () => {
    expect(chaveAcessoValida(CHAVE_VALIDA.slice(0, 43))).toBe(false);
    expect(chaveAcessoValida(`${CHAVE_VALIDA}0`)).toBe(false);
    expect(chaveAcessoValida(`A${CHAVE_VALIDA.slice(1)}`)).toBe(false);
  });

  test("resto 0 ou 1 gera DV 0", () => {
    // 43 zeros: soma 0, resto 0 → DV 0.
    expect(chaveAcessoValida("0".repeat(44))).toBe(true);
    expect(chaveAcessoValida(`${"0".repeat(43)}1`)).toBe(false);
  });
});

describe("normalizarChaveAcesso", () => {
  test("remove espaços e pontuação de chave copiada do DANFE", () => {
    const comMascara = "3524 0312 3456 7800 0195 5500 1000 0012 3411 2345 6782";
    expect(normalizarChaveAcesso(comMascara)).toBe(CHAVE_VALIDA);
  });
});

describe("classificacaoDaUrl", () => {
  test("aceita FISCAL e GERENCIAL", () => {
    expect(classificacaoDaUrl("FISCAL")).toBe("FISCAL");
    expect(classificacaoDaUrl("GERENCIAL")).toBe("GERENCIAL");
  });

  test("ausente, vazio, sentinela ou valor desconhecido = todos (undefined)", () => {
    expect(classificacaoDaUrl(undefined)).toBeUndefined();
    expect(classificacaoDaUrl("")).toBeUndefined();
    expect(classificacaoDaUrl(SEM_VALOR)).toBeUndefined();
    expect(classificacaoDaUrl("fiscal")).toBeUndefined();
  });
});

describe("resolverClassificacao", () => {
  test("informada vence o padrão da contraparte", () => {
    expect(resolverClassificacao("FISCAL", "GERENCIAL")).toBe("FISCAL");
  });

  test("sem informada, usa o padrão da contraparte", () => {
    expect(resolverClassificacao(undefined, "GERENCIAL")).toBe("GERENCIAL");
  });

  test("sem informada nem padrão, cai em FISCAL", () => {
    expect(resolverClassificacao(undefined, null)).toBe("FISCAL");
  });
});

describe("grupoDoComprovante / tiposDeComprovanteDa", () => {
  test("recibo é gerencial, NF-e é fiscal", () => {
    expect(grupoDoComprovante("RECIBO")).toBe("GERENCIAL");
    expect(grupoDoComprovante("NFE")).toBe("FISCAL");
  });

  test("as listas por classificação não se sobrepõem", () => {
    const fiscais = tiposDeComprovanteDa("FISCAL");
    expect(tiposDeComprovanteDa("GERENCIAL").some((tipo) => fiscais.includes(tipo))).toBe(false);
  });
});

describe("validarComprovante", () => {
  test("FISCAL sem nenhum dado de nota é válido (nota pode chegar depois)", () => {
    expect(validarComprovante({ classificacaoFiscal: "FISCAL" })).toEqual([]);
  });

  test("NF-e completa com chave válida é válida", () => {
    expect(
      validarComprovante({
        classificacaoFiscal: "FISCAL",
        tipoComprovante: "NFE",
        numeroDocumentoFiscal: "1234",
        serieDocumentoFiscal: "1",
        chaveAcesso: CHAVE_VALIDA,
      }),
    ).toEqual([]);
  });

  test("tipo gerencial em lançamento fiscal é recusado", () => {
    expect(validarComprovante({ classificacaoFiscal: "FISCAL", tipoComprovante: "RECIBO" })).toEqual([
      expect.objectContaining({ campo: "tipoComprovante" }),
    ]);
  });

  test("tipo fiscal em lançamento gerencial é recusado", () => {
    expect(validarComprovante({ classificacaoFiscal: "GERENCIAL", tipoComprovante: "NFE" })).toEqual([
      expect.objectContaining({ campo: "tipoComprovante" }),
    ]);
  });

  test("gerencial com número, série ou chave de nota é recusado", () => {
    const erros = validarComprovante({
      classificacaoFiscal: "GERENCIAL",
      tipoComprovante: "RECIBO",
      numeroDocumentoFiscal: "1",
      serieDocumentoFiscal: "1",
      chaveAcesso: CHAVE_VALIDA,
    });
    expect(erros.map((erro) => erro.campo)).toEqual(["numeroDocumentoFiscal", "serieDocumentoFiscal", "chaveAcesso"]);
  });

  test("número da nota sem tipo de comprovante é recusado", () => {
    expect(validarComprovante({ classificacaoFiscal: "FISCAL", numeroDocumentoFiscal: "1234" })).toEqual([
      expect.objectContaining({ campo: "tipoComprovante" }),
    ]);
  });

  test("chave de acesso em tipo que não tem chave (NFS-e) é recusada", () => {
    expect(
      validarComprovante({ classificacaoFiscal: "FISCAL", tipoComprovante: "NFSE", chaveAcesso: CHAVE_VALIDA }),
    ).toEqual([expect.objectContaining({ campo: "chaveAcesso" })]);
  });

  test("chave com DV errado é recusada", () => {
    expect(
      validarComprovante({ classificacaoFiscal: "FISCAL", tipoComprovante: "NFE", chaveAcesso: CHAVE_DV_ERRADO }),
    ).toEqual([expect.objectContaining({ campo: "chaveAcesso" })]);
  });
});

describe("pendenciasFiscaisDoTitulo", () => {
  const vazio = { tipoComprovante: null, numeroDocumentoFiscal: null, chaveAcesso: null };

  test("gerencial nunca tem pendência fiscal", () => {
    expect(pendenciasFiscaisDoTitulo({ classificacaoFiscal: "GERENCIAL", ...vazio }, 0)).toEqual([]);
  });

  test("fiscal legado (sem nenhum dado) pede tipo e anexo", () => {
    expect(pendenciasFiscaisDoTitulo({ classificacaoFiscal: "FISCAL", ...vazio }, 0)).toEqual([
      "SEM_TIPO_DOCUMENTO",
      "SEM_ANEXO",
    ]);
  });

  test("NF-e sem número nem chave, com anexo", () => {
    expect(
      pendenciasFiscaisDoTitulo({ classificacaoFiscal: "FISCAL", ...vazio, tipoComprovante: "NFE" }, 1),
    ).toEqual(["SEM_NUMERO_NOTA", "SEM_CHAVE_ACESSO"]);
  });

  test("NFS-e não exige chave; guia de tributo não exige número", () => {
    expect(
      pendenciasFiscaisDoTitulo({ classificacaoFiscal: "FISCAL", ...vazio, tipoComprovante: "NFSE" }, 1),
    ).toEqual(["SEM_NUMERO_NOTA"]);
    expect(
      pendenciasFiscaisDoTitulo({ classificacaoFiscal: "FISCAL", ...vazio, tipoComprovante: "GUIA_TRIBUTO" }, 1),
    ).toEqual([]);
  });

  test("NF-e completa com anexo não tem pendência", () => {
    expect(
      pendenciasFiscaisDoTitulo(
        { classificacaoFiscal: "FISCAL", tipoComprovante: "NFE", numeroDocumentoFiscal: "1", chaveAcesso: CHAVE_VALIDA },
        1,
      ),
    ).toEqual([]);
  });
});
