import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { classificarLinhaExtrato, type CandidatoParaClassificar } from "./conciliacao";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { importarExtratoOfx } from "./conciliacao";

const LINHA_BASE = { data: new Date("2026-08-15T00:00:00Z"), valor: 150, tipo: "SAIDA" as const };

function candidato(overrides: Partial<CandidatoParaClassificar>): CandidatoParaClassificar {
  return { id: "cand-1", data: new Date("2026-08-15T00:00:00Z"), valor: 150, conciliado: false, ...overrides };
}

describe("classificarLinhaExtrato", () => {
  test("um único candidato exato (valor+data dentro de 3 dias, não conciliado) -> CONCILIADO", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [candidato({ id: "c1" })]);
    expect(resultado).toEqual({ status: "CONCILIADO", lancamentoAutoVinculadoId: "c1" });
  });

  test("data 3 dias depois ainda está dentro da janela -> CONCILIADO", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [
      candidato({ id: "c1", data: new Date("2026-08-18T00:00:00Z") }),
    ]);
    expect(resultado.status).toBe("CONCILIADO");
  });

  test("dois candidatos exatos -> SUGESTAO", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [
      candidato({ id: "c1" }),
      candidato({ id: "c2" }),
    ]);
    expect(resultado).toEqual({ status: "SUGESTAO", lancamentoAutoVinculadoId: null });
  });

  test("candidato exato mas já conciliado, sem nenhum outro -> DUPLICADO", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [candidato({ id: "c1", conciliado: true })]);
    expect(resultado).toEqual({ status: "DUPLICADO", lancamentoAutoVinculadoId: null });
  });

  test("candidato com data dentro da janela mas valor diferente, único -> DIVERGENCIA_VALOR", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [candidato({ id: "c1", valor: 155 })]);
    expect(resultado).toEqual({ status: "DIVERGENCIA_VALOR", lancamentoAutoVinculadoId: null });
  });

  test("candidato com valor igual mas fora da janela de 3 dias (dentro de 30), único -> DIVERGENCIA_DATA", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [
      candidato({ id: "c1", data: new Date("2026-08-25T00:00:00Z") }),
    ]);
    expect(resultado).toEqual({ status: "DIVERGENCIA_DATA", lancamentoAutoVinculadoId: null });
  });

  test("nenhum candidato -> NAO_CONCILIADO", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, []);
    expect(resultado).toEqual({ status: "NAO_CONCILIADO", lancamentoAutoVinculadoId: null });
  });

  test("múltiplos candidatos de divergência de valor -> NAO_CONCILIADO (ambíguo demais pra sugerir)", () => {
    const resultado = classificarLinhaExtrato(LINHA_BASE, [
      candidato({ id: "c1", valor: 140 }),
      candidato({ id: "c2", valor: 160 }),
    ]);
    expect(resultado).toEqual({ status: "NAO_CONCILIADO", lancamentoAutoVinculadoId: null });
  });
});

const OFX_DUAS_TRANSACOES = (fitidA: string, fitidB: string) => `
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260815120000
<TRNAMT>-150.00
<FITID>${fitidA}
<NAME>TARIFA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260816120000
<TRNAMT>980.50
<FITID>${fitidB}
<NAME>PIX RECEBIDO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`;

function arquivoOfx(conteudo: string, nome = "extrato.ofx"): File {
  return new File([conteudo], nome, { type: "application/x-ofx" });
}

describe("importarExtratoOfx", () => {
  let fixture: FixtureFinanceiro;
  let fixtureOutraFilial: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBI", "TESOURARIA");
    fixtureOutraFilial = await criarFixtureFinanceiro("CBO", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await limparFixtureFinanceiro(fixtureOutraFilial);
    await prisma.$disconnect();
  });

  test("importa as linhas novas do OFX", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("IMP-A-1", "IMP-A-2")),
    );

    expect(extrato.totalLinhas).toBe(2);
    expect(extrato.linhasNovas).toBe(2);
    expect(extrato.linhasIgnoradas).toBe(0);

    const linhas = await prisma.linhaExtrato.findMany({ where: { extratoImportadoId: extrato.id } });
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.status === "NAO_CONCILIADO")).toBe(true);
  });

  test("reimportar o mesmo arquivo não duplica linha (dedupe por FITID)", async () => {
    const conteudo = OFX_DUAS_TRANSACOES("IMP-B-1", "IMP-B-2");
    await importarExtratoOfx(fixture.sessao, fixture.contaBancariaId, arquivoOfx(conteudo));
    const segundaImportacao = await importarExtratoOfx(fixture.sessao, fixture.contaBancariaId, arquivoOfx(conteudo));

    expect(segundaImportacao.totalLinhas).toBe(2);
    expect(segundaImportacao.linhasNovas).toBe(0);
    expect(segundaImportacao.linhasIgnoradas).toBe(2);
  });

  test("conta bancária de outra filial é rejeitada", async () => {
    await expect(
      importarExtratoOfx(
        fixture.sessao,
        fixtureOutraFilial.contaBancariaId,
        arquivoOfx(OFX_DUAS_TRANSACOES("IMP-C-1", "IMP-C-2")),
      ),
    ).rejects.toThrow(/não pertence à filial ativa/);
  });

  test("perfil sem conciliacao:escrever não consegue importar", async () => {
    const fixtureFinanceiro = await criarFixtureFinanceiro("CBF");
    try {
      await expect(
        importarExtratoOfx(
          fixtureFinanceiro.sessao,
          fixtureFinanceiro.contaBancariaId,
          arquivoOfx(OFX_DUAS_TRANSACOES("IMP-D-1", "IMP-D-2")),
        ),
      ).rejects.toThrow(PermissionError);
    } finally {
      await limparFixtureFinanceiro(fixtureFinanceiro);
    }
  });
});
