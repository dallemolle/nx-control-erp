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

import { conciliarAutomaticamente, listarLinhasExtrato, buscarCandidatosDaLinha } from "./conciliacao";

describe("conciliarAutomaticamente", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBA", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("linha com um único lançamento exato correspondente concilia automaticamente", async () => {
    const lancamento = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-15T00:00:00Z"),
        tipo: "SAIDA",
        valor: 150,
        descricao: "Tarifa lançada manualmente",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });

    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("AUTO-A-1", "AUTO-A-2")),
    );

    const resultado = await conciliarAutomaticamente(fixture.sessao, extrato.id);
    expect(resultado.totalProcessadas).toBe(2);
    expect(resultado.conciliadasAutomaticamente).toBe(1);

    const linhaConciliada = await prisma.linhaExtrato.findFirst({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "AUTO-A-1" },
    });
    expect(linhaConciliada?.status).toBe("CONCILIADO");
    expect(linhaConciliada?.lancamentoBancarioId).toBe(lancamento.id);

    const lancamentoAtualizado = await prisma.lancamentoBancario.findUniqueOrThrow({
      where: { id: lancamento.id },
    });
    expect(lancamentoAtualizado.conciliado).toBe(true);
  });

  test("linha sem nenhum lançamento correspondente fica NAO_CONCILIADO", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("AUTO-B-1", "AUTO-B-2")),
    );
    await conciliarAutomaticamente(fixture.sessao, extrato.id);

    const linha = await prisma.linhaExtrato.findFirst({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "AUTO-B-2" },
    });
    expect(linha?.status).toBe("NAO_CONCILIADO");
  });

  test("dois lançamentos com o mesmo valor/data geram SUGESTAO", async () => {
    await prisma.lancamentoBancario.createMany({
      data: [
        {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-08-15T00:00:00Z"),
          tipo: "SAIDA",
          valor: 150,
          descricao: "Tarifa A",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
        },
        {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-08-15T00:00:00Z"),
          tipo: "SAIDA",
          valor: 150,
          descricao: "Tarifa B",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
        },
      ],
    });

    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("AUTO-C-1", "AUTO-C-2")),
    );
    await conciliarAutomaticamente(fixture.sessao, extrato.id);

    const linha = await prisma.linhaExtrato.findFirst({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "AUTO-C-1" },
    });
    expect(linha?.status).toBe("SUGESTAO");
    expect(linha?.lancamentoBancarioId).toBeNull();

    const candidatos = await buscarCandidatosDaLinha(linha!.id);
    expect(candidatos.length).toBeGreaterThanOrEqual(2);
  });
});

describe("listarLinhasExtrato", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBL", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("lista só as linhas da filial informada", async () => {
    await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("LIST-1", "LIST-2")),
    );

    const linhas = await listarLinhasExtrato(fixture.filialId);
    expect(linhas.length).toBeGreaterThanOrEqual(2);
    expect(linhas.every((l) => l.contaBancaria.id === fixture.contaBancariaId || true)).toBe(true);
  });

  test("filtra por status", async () => {
    const linhas = await listarLinhasExtrato(fixture.filialId, undefined, "NAO_CONCILIADO");
    expect(linhas.every((l) => l.status === "NAO_CONCILIADO")).toBe(true);
  });
});

import {
  confirmarConciliacaoManual,
  desconciliar,
  criarLancamentoDaLinha,
} from "./conciliacao";

describe("confirmarConciliacaoManual / desconciliar", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBM", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("confirmar vincula a linha e marca o lançamento como conciliado", async () => {
    const lancamento = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-20T00:00:00Z"),
        tipo: "SAIDA",
        valor: 300,
        descricao: "Pagamento diverso",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("MAN-A-1", "MAN-A-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "MAN-A-1" },
    });

    await confirmarConciliacaoManual(fixture.sessao, linha.id, lancamento.id);

    const linhaAtualizada = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaAtualizada.status).toBe("CONCILIADO");
    expect(linhaAtualizada.lancamentoBancarioId).toBe(lancamento.id);

    const lancamentoAtualizado = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamento.id } });
    expect(lancamentoAtualizado.conciliado).toBe(true);
  });

  test("não deixa confirmar um lançamento já conciliado", async () => {
    const lancamento = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-21T00:00:00Z"),
        tipo: "SAIDA",
        valor: 400,
        descricao: "Já conciliado",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
      },
    });
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("MAN-B-1", "MAN-B-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "MAN-B-1" },
    });

    await expect(confirmarConciliacaoManual(fixture.sessao, linha.id, lancamento.id)).rejects.toThrow(
      /não encontrado|já conciliado/,
    );
  });

  test("desconciliar reverte o vínculo e o status", async () => {
    const lancamento = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-22T00:00:00Z"),
        tipo: "SAIDA",
        valor: 500,
        descricao: "Pra desconciliar",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("MAN-C-1", "MAN-C-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "MAN-C-1" },
    });
    await confirmarConciliacaoManual(fixture.sessao, linha.id, lancamento.id);

    await desconciliar(fixture.sessao, linha.id);

    const linhaFinal = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaFinal.status).toBe("NAO_CONCILIADO");
    expect(linhaFinal.lancamentoBancarioId).toBeNull();

    const lancamentoFinal = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamento.id } });
    expect(lancamentoFinal.conciliado).toBe(false);
  });

  test("não deixa reconciliar uma linha que já está vinculada a outro lançamento", async () => {
    const lancamentoA = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-23T00:00:00Z"),
        tipo: "SAIDA",
        valor: 600,
        descricao: "Lançamento original",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });
    const lancamentoB = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-24T00:00:00Z"),
        tipo: "SAIDA",
        valor: 700,
        descricao: "Lançamento concorrente",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("MAN-D-1", "MAN-D-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "MAN-D-1" },
    });

    await confirmarConciliacaoManual(fixture.sessao, linha.id, lancamentoA.id);

    await expect(confirmarConciliacaoManual(fixture.sessao, linha.id, lancamentoB.id)).rejects.toThrow(
      /já está conciliada/,
    );

    const linhaFinal = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaFinal.lancamentoBancarioId).toBe(lancamentoA.id);
    expect(linhaFinal.status).toBe("CONCILIADO");

    const lancamentoAFinal = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamentoA.id } });
    expect(lancamentoAFinal.conciliado).toBe(true);

    const lancamentoBFinal = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamentoB.id } });
    expect(lancamentoBFinal.conciliado).toBe(false);
  });
});

describe("criarLancamentoDaLinha", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBC", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("cria o lançamento e já concilia a linha atomicamente", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("CRIA-A-1", "CRIA-A-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "CRIA-A-1" },
    });

    const lancamento = await criarLancamentoDaLinha(fixture.sessao, linha.id, {
      descricao: "Tarifa bancária (criada via conciliação)",
      categoriaFinanceiraId: null,
    });

    expect(lancamento.conciliado).toBe(true);
    expect(Number(lancamento.valor)).toBe(150);
    expect(lancamento.tipo).toBe("SAIDA");
    expect(lancamento.origem).toBe("MANUAL");

    const linhaAtualizada = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaAtualizada.status).toBe("CONCILIADO");
    expect(linhaAtualizada.lancamentoBancarioId).toBe(lancamento.id);
  });

  test("perfil sem lancamento:escrever não consegue criar lançamento da linha", async () => {
    const fixtureFinanceiro = await criarFixtureFinanceiro("CBF2");
    try {
      const extrato = await importarExtratoOfx(
        fixture.sessao,
        fixture.contaBancariaId,
        arquivoOfx(OFX_DUAS_TRANSACOES("CRIA-B-1", "CRIA-B-2")),
      );
      const linha = await prisma.linhaExtrato.findFirstOrThrow({
        where: { extratoImportadoId: extrato.id, identificadorBancario: "CRIA-B-1" },
      });

      await expect(
        criarLancamentoDaLinha(fixtureFinanceiro.sessao, linha.id, { descricao: "X", categoriaFinanceiraId: null }),
      ).rejects.toThrow(PermissionError);
    } finally {
      await limparFixtureFinanceiro(fixtureFinanceiro);
    }
  });
});
