import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { listarTitulos, listarTitulosPaginado } from "./titulo";
import { listarLancamentos, listarLancamentosPaginado } from "./lancamentoBancario";
import { CursorInvalidoError, type Pagina } from "./paginacao";

// Todos com o mesmo criadoEm/data: força o desempate por id.
const MESMO_INSTANTE = new Date("2026-01-15T12:00:00Z");

async function percorrer<T extends { id: string }>(buscar: (cursor?: string) => Promise<Pagina<T>>) {
  const paginas: string[][] = [];
  let cursor: string | undefined;
  do {
    const pagina = await buscar(cursor);
    paginas.push(pagina.itens.map((item) => item.id));
    cursor = pagina.proximoCursor ?? undefined;
  } while (cursor);
  return paginas;
}

describe("listagens paginadas", () => {
  let fixture: FixtureFinanceiro;
  let outraFilial: FixtureFinanceiro;
  let idsTitulosPagar: string[];
  let idTituloReceber: string;
  let idsLancamentos: string[];
  let idLancamentoOutraFilial: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("PAGIN");
    outraFilial = await criarFixtureFinanceiro("PAGIN2");

    const base = {
      filialId: fixture.filialId,
      documento: "PAG",
      dataEmissao: MESMO_INSTANTE,
      dataCompetencia: MESMO_INSTANTE,
      categoriaFinanceiraId: fixture.categoriaFinanceiraId,
      criadoEm: MESMO_INSTANTE,
    };
    idsTitulosPagar = [];
    for (let i = 0; i < 5; i++) {
      const titulo = await prisma.titulo.create({
        data: { ...base, tipo: "PAGAR", fornecedorId: fixture.fornecedorId, documento: `PAG-${i}` },
      });
      idsTitulosPagar.push(titulo.id);
    }
    idTituloReceber = (
      await prisma.titulo.create({ data: { ...base, tipo: "RECEBER", clienteId: fixture.clienteId } })
    ).id;

    const lancamento = {
      filialId: fixture.filialId,
      contaBancariaId: fixture.contaBancariaId,
      data: MESMO_INSTANTE,
      tipo: "ENTRADA" as const,
      valor: 10,
      origem: "MANUAL" as const,
      usuarioId: fixture.usuarioId,
      conciliado: true,
    };
    idsLancamentos = [];
    for (let i = 0; i < 5; i++) {
      idsLancamentos.push((await prisma.lancamentoBancario.create({ data: { ...lancamento, descricao: `L-${i}` } })).id);
    }
    idLancamentoOutraFilial = (
      await prisma.lancamentoBancario.create({
        data: {
          ...lancamento,
          filialId: outraFilial.filialId,
          contaBancariaId: outraFilial.contaBancariaId,
          usuarioId: outraFilial.usuarioId,
          descricao: "Outra filial",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await limparFixtureFinanceiro(outraFilial);
    await prisma.$disconnect();
  });

  const desc = (ids: string[]) => [...ids].sort().reverse();

  test("títulos: percorre tudo em páginas de 2, sem repetir nem pular, em id desc no empate", async () => {
    const paginas = await percorrer((cursor) =>
      listarTitulosPaginado(fixture.filialId, "PAGAR", {}, { limite: 2, cursor }),
    );

    expect(paginas.map((p) => p.length)).toEqual([2, 2, 1]);
    expect(paginas.flat()).toEqual(desc(idsTitulosPagar));
  });

  test("títulos: cursor de outro tipo ou inexistente -> CursorInvalidoError", async () => {
    await expect(
      listarTitulosPaginado(fixture.filialId, "PAGAR", {}, { limite: 2, cursor: idTituloReceber }),
    ).rejects.toBeInstanceOf(CursorInvalidoError);
    await expect(
      listarTitulosPaginado(fixture.filialId, "PAGAR", {}, { limite: 2, cursor: "nao-existe" }),
    ).rejects.toBeInstanceOf(CursorInvalidoError);
  });

  test("títulos: cursor que não bate com o filtro da listagem -> CursorInvalidoError", async () => {
    const gerencial = await prisma.titulo.create({
      data: {
        filialId: fixture.filialId,
        tipo: "PAGAR",
        fornecedorId: fixture.fornecedorId,
        documento: "PAG-GER",
        dataEmissao: MESMO_INSTANTE,
        dataCompetencia: MESMO_INSTANTE,
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        criadoEm: MESMO_INSTANTE,
        classificacaoFiscal: "GERENCIAL",
      },
    });
    try {
      await expect(
        listarTitulosPaginado(
          fixture.filialId,
          "PAGAR",
          { classificacao: "FISCAL" },
          { limite: 2, cursor: gerencial.id },
        ),
      ).rejects.toBeInstanceOf(CursorInvalidoError);
    } finally {
      await prisma.titulo.delete({ where: { id: gerencial.id } });
    }
  });

  test("títulos: a listagem das telas continua devolvendo o array na mesma ordem", async () => {
    const titulos = await listarTitulos(fixture.filialId, "PAGAR");
    expect(titulos.map((t) => t.id)).toEqual(desc(idsTitulosPagar));
  });

  test("lançamentos: percorre tudo em páginas de 2, sem repetir nem pular", async () => {
    const paginas = await percorrer((cursor) =>
      listarLancamentosPaginado(fixture.filialId, {}, { limite: 2, cursor }),
    );

    expect(paginas.map((p) => p.length)).toEqual([2, 2, 1]);
    expect(paginas.flat()).toEqual(desc(idsLancamentos));
  });

  test("lançamentos: cursor de outra filial -> CursorInvalidoError", async () => {
    await expect(
      listarLancamentosPaginado(fixture.filialId, {}, { limite: 2, cursor: idLancamentoOutraFilial }),
    ).rejects.toBeInstanceOf(CursorInvalidoError);
  });

  test("lançamentos: cursor que não bate com o filtro da listagem -> CursorInvalidoError", async () => {
    const gerencial = await prisma.lancamentoBancario.create({
      data: {
        filialId: fixture.filialId,
        contaBancariaId: fixture.contaBancariaId,
        data: MESMO_INSTANTE,
        tipo: "ENTRADA",
        valor: 10,
        origem: "MANUAL",
        usuarioId: fixture.usuarioId,
        conciliado: true,
        descricao: "L-GER",
        classificacaoFiscal: "GERENCIAL",
      },
    });
    try {
      await expect(
        listarLancamentosPaginado(
          fixture.filialId,
          { classificacao: "FISCAL" },
          { limite: 2, cursor: gerencial.id },
        ),
      ).rejects.toBeInstanceOf(CursorInvalidoError);
    } finally {
      await prisma.lancamentoBancario.delete({ where: { id: gerencial.id } });
    }
  });

  test("lançamentos: a listagem das telas continua devolvendo o array", async () => {
    const lancamentos = await listarLancamentos(fixture.filialId);
    expect(lancamentos.map((l) => l.id)).toEqual(desc(idsLancamentos));
  });
});
