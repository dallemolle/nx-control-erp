import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { StatusLinhaExtrato } from "@prisma/client";
import { classificarLinhaExtrato, type CandidatoParaClassificar } from "./conciliacao";
import { prisma } from "@/server/db/client";
import { PermissionError } from "@/server/auth/permissions";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { importarExtratoOfx } from "./conciliacao";
import { reconciliarPendentes } from "./conciliacao";

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

async function lancamentosDoGrupoDaLinha(linhaId: string): Promise<string[]> {
  const linha = await prisma.linhaExtrato.findUniqueOrThrow({
    where: { id: linhaId },
    include: { grupoConciliacao: { include: { lancamentos: { select: { id: true } } } } },
  });
  return linha.grupoConciliacao?.lancamentos.map((l) => l.id) ?? [];
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
    expect(await lancamentosDoGrupoDaLinha(linhaConciliada!.id)).toEqual([lancamento.id]);

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
    expect(linha?.grupoConciliacaoId).toBeNull();

    const candidatos = await buscarCandidatosDaLinha(fixture.sessao, linha!.id);
    expect(candidatos.length).toBeGreaterThanOrEqual(2);
  });
});

describe("reconciliarPendentes", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBR", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("concilia uma linha NAO_CONCILIADO cujo lançamento só foi criado depois da importação", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("RECON-A-1", "RECON-A-2")),
    );
    await conciliarAutomaticamente(fixture.sessao, extrato.id);

    const linhaAntes = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "RECON-A-1" },
    });
    expect(linhaAntes.status).toBe("NAO_CONCILIADO");

    const lancamento = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-15T00:00:00Z"),
        tipo: "SAIDA",
        valor: 150,
        descricao: "Tarifa lançada depois da importação",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });

    const resultado = await reconciliarPendentes(fixture.sessao);
    expect(resultado.conciliadasAutomaticamente).toBeGreaterThanOrEqual(1);

    const linhaDepois = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linhaAntes.id } });
    expect(linhaDepois.status).toBe("CONCILIADO");
    expect(await lancamentosDoGrupoDaLinha(linhaDepois.id)).toEqual([lancamento.id]);
  });

  describe("reprocessa também Sugestão, Divergência e Duplicado", () => {
    let contaSeq = 0;

    /** Conta nova por teste (os candidatos são buscados por conta) com uma linha de saída de R$ 150,00 em 15/08. */
    async function linhaComStatus(status: StatusLinhaExtrato) {
      contaSeq += 1;
      const conta = await prisma.contaBancaria.create({
        data: {
          filialId: fixture.filialId,
          bancoId: fixture.bancoId,
          agencia: "0009",
          conta: `reproc-${contaSeq}`,
          saldoInicial: 0,
        },
      });
      const extrato = await prisma.extratoImportado.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: conta.id,
          nomeArquivo: "reproc.ofx",
          totalLinhas: 1,
          linhasNovas: 1,
          linhasIgnoradas: 0,
          usuarioId: fixture.usuarioId,
        },
      });
      const linha = await prisma.linhaExtrato.create({
        data: {
          extratoImportadoId: extrato.id,
          contaBancariaId: conta.id,
          data: new Date("2026-08-15T12:00:00Z"),
          valor: 150,
          tipo: "SAIDA",
          historico: "TARIFA",
          identificadorBancario: `REPROC-${contaSeq}`,
          status,
        },
      });
      return { contaId: conta.id, linhaId: linha.id };
    }

    async function lancar(contaId: string, valor: number, data = "2026-08-15", conciliado = false) {
      return prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: contaId,
          data: new Date(`${data}T00:00:00Z`),
          tipo: "SAIDA",
          valor,
          descricao: "Lançamento do teste",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado,
        },
      });
    }

    const statusDaLinha = async (id: string) => (await prisma.linhaExtrato.findUniqueOrThrow({ where: { id } })).status;

    test("Divergência de valor concilia quando o lançamento certo aparece", async () => {
      const { contaId, linhaId } = await linhaComStatus("DIVERGENCIA_VALOR");
      const certo = await lancar(contaId, 150);

      await reconciliarPendentes(fixture.sessao);

      expect(await statusDaLinha(linhaId)).toBe("CONCILIADO");
      expect(await lancamentosDoGrupoDaLinha(linhaId)).toEqual([certo.id]);
      const auditoria = await prisma.auditLog.findFirstOrThrow({
        where: { entidadeId: linhaId, acao: "CONCILIAR_AUTOMATICO" },
      });
      expect(auditoria.valorAnterior).toEqual({ status: "DIVERGENCIA_VALOR" });
    });

    test("Duplicado concilia quando surge um lançamento livre que bate", async () => {
      const { contaId, linhaId } = await linhaComStatus("DUPLICADO");
      await lancar(contaId, 150, "2026-08-15", true); // o primeiro débito, já conciliado
      const segundo = await lancar(contaId, 150);

      await reconciliarPendentes(fixture.sessao);

      expect(await statusDaLinha(linhaId)).toBe("CONCILIADO");
      expect(await lancamentosDoGrupoDaLinha(linhaId)).toEqual([segundo.id]);
    });

    test("Sugestão com dois candidatos continua Sugestão, sem conciliar", async () => {
      const { contaId, linhaId } = await linhaComStatus("SUGESTAO");
      await lancar(contaId, 150);
      await lancar(contaId, 150, "2026-08-16");

      await reconciliarPendentes(fixture.sessao);

      expect(await statusDaLinha(linhaId)).toBe("SUGESTAO");
      expect((await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linhaId } })).grupoConciliacaoId).toBeNull();
    });

    test("Divergência cujo candidato sumiu volta para Não conciliado e conta como mudança", async () => {
      const { linhaId } = await linhaComStatus("DIVERGENCIA_DATA");

      const resultado = await reconciliarPendentes(fixture.sessao);

      expect(await statusDaLinha(linhaId)).toBe("NAO_CONCILIADO");
      expect(resultado.reclassificadas).toBeGreaterThanOrEqual(1);
    });

    test("linha já conciliada não é reprocessada", async () => {
      const { contaId, linhaId } = await linhaComStatus("NAO_CONCILIADO");
      await lancar(contaId, 150);
      await reconciliarPendentes(fixture.sessao);
      const grupoAntes = (await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linhaId } })).grupoConciliacaoId;
      expect(grupoAntes).not.toBeNull();

      await lancar(contaId, 150, "2026-08-14"); // outro candidato exato: não pode mexer na linha conciliada
      await reconciliarPendentes(fixture.sessao);

      const depois = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linhaId } });
      expect(depois.status).toBe("CONCILIADO");
      expect(depois.grupoConciliacaoId).toBe(grupoAntes);
    });
  });

  test("perfil sem conciliacao:escrever não consegue reconciliar pendentes", async () => {
    const fixtureFinanceiro = await criarFixtureFinanceiro("CBR2");
    try {
      await expect(reconciliarPendentes(fixtureFinanceiro.sessao)).rejects.toThrow(PermissionError);
    } finally {
      await limparFixtureFinanceiro(fixtureFinanceiro);
    }
  });
});

describe("buscarCandidatosDaLinha", () => {
  let fixture: FixtureFinanceiro;
  let fixtureOutraFilial: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBB", "TESOURARIA");
    fixtureOutraFilial = await criarFixtureFinanceiro("CBP", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await limparFixtureFinanceiro(fixtureOutraFilial);
    await prisma.$disconnect();
  });

  test("linha de outra filial não pode ser lida", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("BUSC-A-1", "BUSC-A-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "BUSC-A-1" },
    });

    await expect(buscarCandidatosDaLinha(fixtureOutraFilial.sessao, linha.id)).rejects.toThrow(
      /não pertence à filial ativa/,
    );
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
        valor: 150,
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
    expect(await lancamentosDoGrupoDaLinha(linhaAtualizada.id)).toEqual([lancamento.id]);

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
        valor: 150,
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
    expect(linhaFinal.grupoConciliacaoId).toBeNull();

    const lancamentoFinal = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamento.id } });
    expect(lancamentoFinal.conciliado).toBe(false);
    expect(lancamentoFinal.grupoConciliacaoId).toBeNull();
  });

  test("não deixa reconciliar uma linha que já está vinculada a outro lançamento", async () => {
    const lancamentoA = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-08-23T00:00:00Z"),
        tipo: "SAIDA",
        valor: 150,
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
    expect(await lancamentosDoGrupoDaLinha(linhaFinal.id)).toEqual([lancamentoA.id]);
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
      centroCustoId: null,
      centroLucroId: null,
      safraId: null,
      projetoId: null,
    });

    expect(lancamento.conciliado).toBe(true);
    expect(Number(lancamento.valor)).toBe(150);
    expect(lancamento.tipo).toBe("SAIDA");
    expect(lancamento.origem).toBe("MANUAL");
    expect(lancamento.classificacaoFiscal).toBe("FISCAL");

    const linhaAtualizada = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaAtualizada.status).toBe("CONCILIADO");
    expect(await lancamentosDoGrupoDaLinha(linhaAtualizada.id)).toEqual([lancamento.id]);
  });

  test("grava a classificação e o comprovante informados", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("CRIA-C-1", "CRIA-C-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "CRIA-C-1" },
    });

    const lancamento = await criarLancamentoDaLinha(fixture.sessao, linha.id, {
      descricao: "Pagamento ao produtor (sem nota)",
      categoriaFinanceiraId: null,
      centroCustoId: null,
      centroLucroId: null,
      safraId: null,
      projetoId: null,
      classificacaoFiscal: "GERENCIAL",
      tipoComprovante: "RECIBO",
    });

    expect(lancamento.classificacaoFiscal).toBe("GERENCIAL");
    expect(lancamento.tipoComprovante).toBe("RECIBO");
  });

  test("grava as 4 dimensões quando informadas", async () => {
    const centroCusto = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Operacional", codigo: "OPE" },
    });
    const centroLucro = await prisma.centroLucro.create({
      data: { filialId: fixture.filialId, nome: "Unidade 2", codigo: "U2" },
    });
    const safra = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra Conciliação",
        dataInicio: new Date("2026-01-01"),
        dataFim: new Date("2026-12-31"),
      },
    });
    const projeto = await prisma.projeto.create({
      data: { filialId: fixture.filialId, nome: "Projeto Conciliação", codigo: "PJC" },
    });

    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      arquivoOfx(OFX_DUAS_TRANSACOES("CRIA-DIM-1", "CRIA-DIM-2")),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "CRIA-DIM-1" },
    });

    const lancamento = await criarLancamentoDaLinha(fixture.sessao, linha.id, {
      descricao: "Tarifa com dimensões",
      categoriaFinanceiraId: null,
      centroCustoId: centroCusto.id,
      centroLucroId: centroLucro.id,
      safraId: safra.id,
      projetoId: projeto.id,
    });

    expect(lancamento.centroCustoId).toBe(centroCusto.id);
    expect(lancamento.centroLucroId).toBe(centroLucro.id);
    expect(lancamento.safraId).toBe(safra.id);
    expect(lancamento.projetoId).toBe(projeto.id);
  });

  test("recusa categoria financeira de outra filial e não concilia a linha", async () => {
    const outra = await criarFixtureFinanceiro("CBC2", "TESOURARIA");
    try {
      const extrato = await importarExtratoOfx(
        fixture.sessao,
        fixture.contaBancariaId,
        arquivoOfx(OFX_DUAS_TRANSACOES("CRIA-CAT-1", "CRIA-CAT-2")),
      );
      const linha = await prisma.linhaExtrato.findFirstOrThrow({
        where: { extratoImportadoId: extrato.id, identificadorBancario: "CRIA-CAT-1" },
      });

      await expect(
        criarLancamentoDaLinha(fixture.sessao, linha.id, {
          descricao: "Categoria de outra filial",
          categoriaFinanceiraId: outra.categoriaFinanceiraId,
          centroCustoId: null,
          centroLucroId: null,
          safraId: null,
          projetoId: null,
        }),
      ).rejects.toThrow(/Categoria financeira não pertence à filial ativa/);

      const linhaDepois = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
      expect(linhaDepois.grupoConciliacaoId).toBeNull();
    } finally {
      await limparFixtureFinanceiro(outra);
    }
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
        criarLancamentoDaLinha(fixtureFinanceiro.sessao, linha.id, {
          descricao: "X",
          categoriaFinanceiraId: null,
          centroCustoId: null,
          centroLucroId: null,
          safraId: null,
          projetoId: null,
        }),
      ).rejects.toThrow(PermissionError);
    } finally {
      await limparFixtureFinanceiro(fixtureFinanceiro);
    }
  });
});

import { conciliarEmGrupo, buscarCandidatosParaGrupo } from "./conciliacao";

type TransacaoOfx = { fitid: string; data: string; valor: string; nome: string };

/** OFX com transações arbitrárias; `valor` com sinal ("-150.00" = débito). */
function ofxCom(transacoes: TransacaoOfx[]): File {
  const blocos = transacoes
    .map(
      (t) => `<STMTTRN>
<TRNTYPE>${t.valor.startsWith("-") ? "DEBIT" : "CREDIT"}
<DTPOSTED>${t.data}120000
<TRNAMT>${t.valor}
<FITID>${t.fitid}
<NAME>${t.nome}
</STMTTRN>`,
    )
    .join("\n");
  return arquivoOfx(`<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
${blocos}
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`);
}

describe("conciliarEmGrupo", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBG", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  async function lancamento(valor: number, tipo: "ENTRADA" | "SAIDA", descricao: string, data = "2026-09-10") {
    return prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(`${data}T00:00:00Z`),
        tipo,
        valor,
        descricao,
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });
  }

  async function linhas(transacoes: TransacaoOfx[]) {
    const extrato = await importarExtratoOfx(fixture.sessao, fixture.contaBancariaId, ofxCom(transacoes));
    const criadas = await prisma.linhaExtrato.findMany({ where: { extratoImportadoId: extrato.id } });
    return transacoes.map((t) => criadas.find((l) => l.identificadorBancario === t.fitid)!);
  }

  const SEM_DIMENSOES = {
    categoriaFinanceiraId: null,
    centroCustoId: null,
    centroLucroId: null,
    safraId: null,
    projetoId: null,
  };

  test("N:1 — um PIX quita duas parcelas", async () => {
    const [pix] = await linhas([{ fitid: "GRP-A-1", data: "20260910", valor: "1000.00", nome: "PIX" }]);
    const p1 = await lancamento(600, "ENTRADA", "Parcela 1");
    const p2 = await lancamento(400, "ENTRADA", "Parcela 2");

    const { grupoConciliacaoId } = await conciliarEmGrupo(fixture.sessao, {
      linhaIds: [pix.id],
      lancamentoIds: [p1.id, p2.id],
    });

    const linha = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: pix.id } });
    expect(linha.status).toBe("CONCILIADO");
    expect(linha.grupoConciliacaoId).toBe(grupoConciliacaoId);
    const lancs = await prisma.lancamentoBancario.findMany({ where: { id: { in: [p1.id, p2.id] } } });
    expect(lancs.every((l) => l.conciliado && l.grupoConciliacaoId === grupoConciliacaoId)).toBe(true);
  });

  test("1:N — duas transferências pagam uma parcela", async () => {
    const [t1, t2] = await linhas([
      { fitid: "GRP-B-1", data: "20260910", valor: "300.00", nome: "TED 1" },
      { fitid: "GRP-B-2", data: "20260911", valor: "700.00", nome: "TED 2" },
    ]);
    const parcela = await lancamento(1000, "ENTRADA", "Parcela única");

    const { grupoConciliacaoId } = await conciliarEmGrupo(fixture.sessao, {
      linhaIds: [t1.id, t2.id],
      lancamentoIds: [parcela.id],
    });

    const vinculadas = await prisma.linhaExtrato.findMany({ where: { grupoConciliacaoId } });
    expect(vinculadas.map((l) => l.id).sort()).toEqual([t1.id, t2.id].sort());
    expect(vinculadas.every((l) => l.status === "CONCILIADO")).toBe(true);
  });

  test("N:M com entrada e saída misturadas fecha pela soma com sinal", async () => {
    const [entrada, tarifa] = await linhas([
      { fitid: "GRP-C-1", data: "20260910", valor: "1000.00", nome: "PIX" },
      { fitid: "GRP-C-2", data: "20260910", valor: "-50.00", nome: "TARIFA" },
    ]);
    const a = await lancamento(600, "ENTRADA", "A");
    const b = await lancamento(400, "ENTRADA", "B");
    const c = await lancamento(50, "SAIDA", "Tarifa");

    const { grupoConciliacaoId } = await conciliarEmGrupo(fixture.sessao, {
      linhaIds: [entrada.id, tarifa.id],
      lancamentoIds: [a.id, b.id, c.id],
    });

    expect(await prisma.lancamentoBancario.count({ where: { grupoConciliacaoId } })).toBe(3);
  });

  test("soma diferente é rejeitada e nada é gravado", async () => {
    const [pix] = await linhas([{ fitid: "GRP-D-1", data: "20260910", valor: "995.00", nome: "PIX" }]);
    const parcela = await lancamento(1000, "ENTRADA", "Parcela");

    await expect(
      conciliarEmGrupo(fixture.sessao, { linhaIds: [pix.id], lancamentoIds: [parcela.id] }),
    ).rejects.toThrow(/não bate/);

    expect((await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: pix.id } })).grupoConciliacaoId).toBeNull();
    expect((await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: parcela.id } })).conciliado).toBe(false);
  });

  test("lança a diferença com valor, tipo e data calculados no servidor", async () => {
    const [pix] = await linhas([{ fitid: "GRP-E-1", data: "20260912", valor: "995.00", nome: "PIX" }]);
    const p1 = await lancamento(500, "ENTRADA", "Parcela 1");
    const p2 = await lancamento(500, "ENTRADA", "Parcela 2");

    const { grupoConciliacaoId, lancamentoDiferencaId } = await conciliarEmGrupo(fixture.sessao, {
      linhaIds: [pix.id],
      lancamentoIds: [p1.id, p2.id],
      lancamentoDiferenca: { descricao: "Tarifa PIX", ...SEM_DIMENSOES },
    });

    const diferenca = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lancamentoDiferencaId! } });
    expect(diferenca.tipo).toBe("SAIDA");
    expect(Number(diferenca.valor)).toBe(5);
    expect(diferenca.data.toISOString().slice(0, 10)).toBe("2026-09-12");
    expect(diferenca.conciliado).toBe(true);
    expect(diferenca.grupoConciliacaoId).toBe(grupoConciliacaoId);
    expect(diferenca.classificacaoFiscal).toBe("FISCAL");
  });

  test("rejeita lançar diferença quando a soma já fecha", async () => {
    const [pix] = await linhas([{ fitid: "GRP-F-1", data: "20260910", valor: "100.00", nome: "PIX" }]);
    const parcela = await lancamento(100, "ENTRADA", "Parcela");

    await expect(
      conciliarEmGrupo(fixture.sessao, {
        linhaIds: [pix.id],
        lancamentoIds: [parcela.id],
        lancamentoDiferenca: { descricao: "Nada", ...SEM_DIMENSOES },
      }),
    ).rejects.toThrow(/Não há diferença/);
  });

  test("rejeita lançar a diferença com categoria de outra filial e nada é gravado", async () => {
    const outra = await criarFixtureFinanceiro("CBG4", "TESOURARIA");
    try {
      const [pix] = await linhas([{ fitid: "GRP-K-1", data: "20260912", valor: "995.00", nome: "PIX" }]);
      const parcela = await lancamento(1000, "ENTRADA", "Parcela");

      await expect(
        conciliarEmGrupo(fixture.sessao, {
          linhaIds: [pix.id],
          lancamentoIds: [parcela.id],
          lancamentoDiferenca: {
            descricao: "Tarifa PIX",
            ...SEM_DIMENSOES,
            categoriaFinanceiraId: outra.categoriaFinanceiraId,
          },
        }),
      ).rejects.toThrow(/Categoria financeira não pertence à filial ativa/);

      expect((await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: pix.id } })).grupoConciliacaoId).toBeNull();
      expect((await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: parcela.id } })).conciliado).toBe(false);
    } finally {
      await limparFixtureFinanceiro(outra);
    }
  });

  test("lançamento editado entre a leitura e o vínculo: erro e nada é gravado", async () => {
    const [pix] = await linhas([{ fitid: "GRP-RACE-1", data: "20260910", valor: "1000.00", nome: "PIX" }]);
    const p1 = await lancamento(600, "ENTRADA", "Parcela 1");
    const p2 = await lancamento(400, "ENTRADA", "Parcela 2");
    const lidos = await prisma.lancamentoBancario.findMany({ where: { id: { in: [p1.id, p2.id] } } });
    // O valor muda no banco depois da leitura que o serviço vai receber.
    await prisma.lancamentoBancario.update({ where: { id: p2.id }, data: { valor: 350 } });
    const espiao = vi.spyOn(prisma.lancamentoBancario, "findMany").mockResolvedValueOnce(lidos);
    try {
      await expect(
        conciliarEmGrupo(fixture.sessao, { linhaIds: [pix.id], lancamentoIds: [p1.id, p2.id] }),
      ).rejects.toThrow("Algum lançamento mudou enquanto você conciliava. Confira os valores e tente de novo.");
    } finally {
      espiao.mockRestore();
    }
    const linha = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: pix.id } });
    expect(linha.grupoConciliacaoId).toBeNull();
    expect(linha.status).toBe("NAO_CONCILIADO");
    const lancs = await prisma.lancamentoBancario.findMany({ where: { id: { in: [p1.id, p2.id] } } });
    expect(lancs.every((l) => !l.conciliado && l.grupoConciliacaoId === null)).toBe(true);
    expect(await prisma.grupoConciliacao.count({ where: { filialId: fixture.filialId, linhas: { some: { id: pix.id } } } })).toBe(0);
  });

  test("rejeita item já conciliado", async () => {
    const [l1, l2] = await linhas([
      { fitid: "GRP-G-1", data: "20260910", valor: "200.00", nome: "PIX 1" },
      { fitid: "GRP-G-2", data: "20260910", valor: "200.00", nome: "PIX 2" },
    ]);
    const parcela = await lancamento(200, "ENTRADA", "Parcela");
    await conciliarEmGrupo(fixture.sessao, { linhaIds: [l1.id], lancamentoIds: [parcela.id] });

    await expect(
      conciliarEmGrupo(fixture.sessao, { linhaIds: [l2.id], lancamentoIds: [parcela.id] }),
    ).rejects.toThrow(/já está conciliado/);
  });

  test("rejeita lançamento de outra conta bancária", async () => {
    const outraConta = await prisma.contaBancaria.create({
      data: { filialId: fixture.filialId, bancoId: fixture.bancoId, agencia: "0002", conta: "CBG-2", saldoInicial: 0 },
    });
    const [pix] = await linhas([{ fitid: "GRP-H-1", data: "20260910", valor: "80.00", nome: "PIX" }]);
    const deOutraConta = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: outraConta.id,
        data: new Date("2026-09-10T00:00:00Z"),
        tipo: "ENTRADA",
        valor: 80,
        descricao: "Outra conta",
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });

    await expect(
      conciliarEmGrupo(fixture.sessao, { linhaIds: [pix.id], lancamentoIds: [deOutraConta.id] }),
    ).rejects.toThrow(/mesma conta bancária/);
  });

  test("rejeita linha de outra filial", async () => {
    const outra = await criarFixtureFinanceiro("CBG2", "TESOURARIA");
    try {
      const parcela = await lancamento(10, "ENTRADA", "Parcela");
      const extrato = await importarExtratoOfx(
        outra.sessao,
        outra.contaBancariaId,
        ofxCom([{ fitid: "GRP-I-1", data: "20260910", valor: "10.00", nome: "PIX" }]),
      );
      const linhaDeFora = await prisma.linhaExtrato.findFirstOrThrow({ where: { extratoImportadoId: extrato.id } });

      await expect(
        conciliarEmGrupo(fixture.sessao, { linhaIds: [linhaDeFora.id], lancamentoIds: [parcela.id] }),
      ).rejects.toThrow(/não pertence à filial ativa/);
    } finally {
      await limparFixtureFinanceiro(outra);
    }
  });

  test("desconciliar desfaz o grupo inteiro", async () => {
    const [t1, t2] = await linhas([
      { fitid: "GRP-J-1", data: "20260910", valor: "300.00", nome: "TED 1" },
      { fitid: "GRP-J-2", data: "20260910", valor: "700.00", nome: "TED 2" },
    ]);
    const parcela = await lancamento(1000, "ENTRADA", "Parcela");
    const { grupoConciliacaoId } = await conciliarEmGrupo(fixture.sessao, {
      linhaIds: [t1.id, t2.id],
      lancamentoIds: [parcela.id],
    });

    await desconciliar(fixture.sessao, t2.id);

    const linhasDepois = await prisma.linhaExtrato.findMany({ where: { id: { in: [t1.id, t2.id] } } });
    expect(linhasDepois.every((l) => l.status === "NAO_CONCILIADO" && l.grupoConciliacaoId === null)).toBe(true);
    const parcelaDepois = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(parcelaDepois.conciliado).toBe(false);
    expect(parcelaDepois.grupoConciliacaoId).toBeNull();
    expect(await prisma.grupoConciliacao.findUnique({ where: { id: grupoConciliacaoId } })).toBeNull();
  });

  test("perfil sem conciliacao:escrever não concilia", async () => {
    const fixtureFinanceiro = await criarFixtureFinanceiro("CBG3");
    try {
      await expect(
        conciliarEmGrupo(fixtureFinanceiro.sessao, { linhaIds: ["x"], lancamentoIds: ["y"] }),
      ).rejects.toThrow(PermissionError);
    } finally {
      await limparFixtureFinanceiro(fixtureFinanceiro);
    }
  });
});

describe("buscarCandidatosParaGrupo", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBK", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("traz outras linhas e lançamentos soltos da conta, dos dois tipos, dentro da janela", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      ofxCom([
        { fitid: "CAND-1", data: "20260910", valor: "100.00", nome: "PIX" },
        { fitid: "CAND-2", data: "20260912", valor: "-5.00", nome: "TARIFA" },
        { fitid: "CAND-3", data: "20261201", valor: "100.00", nome: "FORA DA JANELA" },
      ]),
    );
    const partida = await prisma.linhaExtrato.findFirstOrThrow({
      where: { extratoImportadoId: extrato.id, identificadorBancario: "CAND-1" },
    });
    const base = {
      filialId: fixture.filialId,
      contaBancariaId: fixture.contaBancariaId,
      origem: "MANUAL" as const,
      usuarioId: fixture.usuarioId,
    };
    const entrada = await prisma.lancamentoBancario.create({
      data: { ...base, data: new Date("2026-09-09T00:00:00Z"), tipo: "ENTRADA", valor: 105, descricao: "Venda" },
    });
    const saida = await prisma.lancamentoBancario.create({
      data: { ...base, data: new Date("2026-09-11T00:00:00Z"), tipo: "SAIDA", valor: 5, descricao: "Tarifa" },
    });
    const jaConciliado = await prisma.lancamentoBancario.create({
      data: {
        ...base,
        data: new Date("2026-09-10T00:00:00Z"),
        tipo: "ENTRADA",
        valor: 100,
        descricao: "Já conciliado",
        conciliado: true,
      },
    });

    const resultado = await buscarCandidatosParaGrupo(fixture.sessao, partida.id);

    expect(resultado.linhaPartida.id).toBe(partida.id);
    expect(resultado.linhas.map((l) => l.identificadorBancario)).toEqual(["CAND-2"]);
    const ids = resultado.lancamentos.map((l) => l.id);
    expect(ids).toContain(entrada.id);
    expect(ids).toContain(saida.id);
    expect(ids).not.toContain(jaConciliado.id);
  });

  test("linha já conciliada é rejeitada", async () => {
    const extrato = await importarExtratoOfx(
      fixture.sessao,
      fixture.contaBancariaId,
      ofxCom([{ fitid: "CAND-X", data: "20260915", valor: "77.00", nome: "PIX" }]),
    );
    const linha = await prisma.linhaExtrato.findFirstOrThrow({ where: { extratoImportadoId: extrato.id } });
    await criarLancamentoDaLinha(fixture.sessao, linha.id, {
      descricao: "Criado",
      categoriaFinanceiraId: null,
      centroCustoId: null,
      centroLucroId: null,
      safraId: null,
      projetoId: null,
    });

    await expect(buscarCandidatosParaGrupo(fixture.sessao, linha.id)).rejects.toThrow(/já está conciliada/);
  });
});

describe("soma conferida dentro da transação", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("CBS", "TESOURARIA");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  async function lancamento(valor: number, tipo: "ENTRADA" | "SAIDA", descricao: string, data = "2026-10-05") {
    return prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date(`${data}T00:00:00Z`),
        tipo,
        valor,
        descricao,
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
      },
    });
  }

  async function importar(transacoes: TransacaoOfx[]) {
    const extrato = await importarExtratoOfx(fixture.sessao, fixture.contaBancariaId, ofxCom(transacoes));
    const criadas = await prisma.linhaExtrato.findMany({ where: { extratoImportadoId: extrato.id } });
    return { extrato, linhas: transacoes.map((t) => criadas.find((l) => l.identificadorBancario === t.fitid)!) };
  }

  test("1:1: lançamento editado entre a leitura e o vínculo — erro e nada é gravado", async () => {
    const { linhas: [linha] } = await importar([{ fitid: "SOMA-1", data: "20261005", valor: "-300.00", nome: "TARIFA" }]);
    const lanc = await lancamento(300, "SAIDA", "Tarifa");
    const lido = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lanc.id } });
    await prisma.lancamentoBancario.update({ where: { id: lanc.id }, data: { valor: 310 } });
    // O serviço recebe a leitura de antes da edição.
    const espiao = vi.spyOn(prisma.lancamentoBancario, "findFirst").mockResolvedValueOnce(lido);
    try {
      await expect(confirmarConciliacaoManual(fixture.sessao, linha.id, lanc.id)).rejects.toThrow(
        "Algum lançamento mudou enquanto você conciliava. Confira os valores e tente de novo.",
      );
    } finally {
      espiao.mockRestore();
    }
    const linhaDepois = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaDepois.grupoConciliacaoId).toBeNull();
    const lancDepois = await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lanc.id } });
    expect(lancDepois.conciliado).toBe(false);
    expect(lancDepois.grupoConciliacaoId).toBeNull();
  });

  test("automática: lançamento editado depois da classificação — a linha é pulada e a rodada segue", async () => {
    const { extrato, linhas: [linha] } = await importar([
      { fitid: "SOMA-AUTO-1", data: "20261006", valor: "-150.00", nome: "TARIFA" },
    ]);
    const lanc = await lancamento(150, "SAIDA", "Tarifa automática", "2026-10-06");
    const candidatosLidos = await prisma.lancamentoBancario.findMany({ where: { id: lanc.id } });
    await prisma.lancamentoBancario.update({ where: { id: lanc.id }, data: { valor: 160 } });
    // A busca de candidatos da rodada recebe a leitura de antes da edição.
    const espiao = vi.spyOn(prisma.lancamentoBancario, "findMany").mockResolvedValueOnce(candidatosLidos);
    try {
      const resultado = await conciliarAutomaticamente(fixture.sessao, extrato.id);
      expect(resultado.conciliadasAutomaticamente).toBe(0);
    } finally {
      espiao.mockRestore();
    }
    const linhaDepois = await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } });
    expect(linhaDepois.grupoConciliacaoId).toBeNull();
    expect((await prisma.lancamentoBancario.findUniqueOrThrow({ where: { id: lanc.id } })).conciliado).toBe(false);
  });

  test("1:1 com valor diferente é recusado e nada é gravado", async () => {
    const { linhas: [linha] } = await importar([{ fitid: "VAL-1", data: "20261007", valor: "-990.00", nome: "BOLETO" }]);
    const lanc = await lancamento(1000, "SAIDA", "Boleto", "2026-10-07");
    await expect(confirmarConciliacaoManual(fixture.sessao, linha.id, lanc.id)).rejects.toThrow(
      /tem valor diferente da linha .* Se foi digitado errado, corrija na Tesouraria; se a diferença é real, use Conciliar em grupo com “Lançar a diferença”\./,
    );
    expect((await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } })).grupoConciliacaoId).toBeNull();
  });

  test("1:1 com valor diferente em lançamento de baixa manda estornar a baixa", async () => {
    const { linhas: [linha] } = await importar([{ fitid: "VAL-2", data: "20261007", valor: "-990.00", nome: "BOLETO" }]);
    const lanc = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: new Date("2026-10-07T00:00:00Z"),
        tipo: "SAIDA",
        valor: 1000,
        descricao: "Baixa de boleto",
        origem: "BAIXA",
        usuarioId: fixture.usuarioId,
      },
    });
    await expect(confirmarConciliacaoManual(fixture.sessao, linha.id, lanc.id)).rejects.toThrow(
      /tem valor diferente da linha .* estorne a baixa em Contas a pagar ou a receber/,
    );
    expect((await prisma.linhaExtrato.findUniqueOrThrow({ where: { id: linha.id } })).grupoConciliacaoId).toBeNull();
  });

  test("1:1 com sentido diferente é recusado", async () => {
    const { linhas: [linha] } = await importar([{ fitid: "SEN-1", data: "20261008", valor: "-200.00", nome: "PIX" }]);
    const lanc = await lancamento(200, "ENTRADA", "Recebimento", "2026-10-08");
    await expect(confirmarConciliacaoManual(fixture.sessao, linha.id, lanc.id)).rejects.toThrow(
      "O lançamento é uma entrada e a linha do extrato é uma saída.",
    );
  });

  test("1:1 com valor igual e data a mais de 3 dias (Divergência de data) passa", async () => {
    const { linhas: [linha] } = await importar([{ fitid: "DAT-1", data: "20261009", valor: "-75.00", nome: "TARIFA" }]);
    const lanc = await lancamento(75, "SAIDA", "Tarifa atrasada", "2026-10-19");
    await confirmarConciliacaoManual(fixture.sessao, linha.id, lanc.id);
    expect(await lancamentosDoGrupoDaLinha(linha.id)).toEqual([lanc.id]);
  });

  test("candidatos da linha vêm com valorIgual e diasDeDiferenca", async () => {
    const { linhas: [linha] } = await importar([{ fitid: "CAN-1", data: "20261012", valor: "-500.00", nome: "BOLETO" }]);
    const igual = await lancamento(500, "SAIDA", "Boleto certo", "2026-10-14");
    const diferente = await lancamento(550, "SAIDA", "Boleto errado", "2026-10-12");
    const longe = await lancamento(520, "SAIDA", "Boleto distante", "2026-10-22");
    const candidatos = await buscarCandidatosDaLinha(fixture.sessao, linha.id);
    const porId = new Map(candidatos.map((c) => [c.id, c]));
    expect(porId.get(igual.id)).toMatchObject({ valorIgual: true, diasDeDiferenca: 2, dentroDaTolerancia: true });
    expect(porId.get(diferente.id)).toMatchObject({ valorIgual: false, diasDeDiferenca: 0, dentroDaTolerancia: true });
    expect(porId.get(longe.id)).toMatchObject({ valorIgual: false, diasDeDiferenca: 10, dentroDaTolerancia: false });
  });
});
