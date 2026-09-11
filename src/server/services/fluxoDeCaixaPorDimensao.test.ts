import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";
import { criarTitulo } from "./titulo";
import { registrarBaixa, aprovarBaixa } from "./baixa";
import {
  buscarRealizadoPorDimensao,
  buscarProjetadoPorDimensao,
  listarValoresDimensao,
  listarFluxoDeCaixaPorDimensao,
} from "./fluxoDeCaixaPorDimensao";

describe("fluxoDeCaixaPorDimensao", () => {
  let fixture: FixtureFinanceiro;
  let centroCustoAtivoId: string;
  let centroCustoInativoId: string;
  let centroCustoFilhoId: string;
  let centroLucroAtivoId: string;
  let safraAtivaId: string;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("FCD", "FINANCEIRO");

    const centroCustoAtivo = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Ativo", codigo: "ATV" },
    });
    centroCustoAtivoId = centroCustoAtivo.id;

    const centroCustoInativo = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Inativo", codigo: "INA", ativo: false },
    });
    centroCustoInativoId = centroCustoInativo.id;

    const centroCustoFilho = await prisma.centroCusto.create({
      data: { filialId: fixture.filialId, nome: "Filho", codigo: "FLH", parentId: centroCustoAtivoId },
    });
    centroCustoFilhoId = centroCustoFilho.id;

    const centroLucroAtivo = await prisma.centroLucro.create({
      data: { filialId: fixture.filialId, nome: "Lucro Ativo", codigo: "LCR" },
    });
    centroLucroAtivoId = centroLucroAtivo.id;

    const safraAtiva = await prisma.safra.create({
      data: {
        filialId: fixture.filialId,
        nome: "Safra Ativa",
        dataInicio: new Date("2026-01-01T00:00:00Z"),
        dataFim: new Date("2026-12-31T00:00:00Z"),
      },
    });
    safraAtivaId = safraAtiva.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { filialId: fixture.filialId } });
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  describe("buscarRealizadoPorDimensao", () => {
    test("soma pelo campo direto quando presente", async () => {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-04-10T00:00:00Z"),
          tipo: "SAIDA",
          valor: 200,
          descricao: "Direto",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
          centroCustoId: centroCustoAtivoId,
        },
      });

      const totais = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 4);
      expect(totais.get(centroCustoAtivoId)?.saidas).toBe(200);
    });

    test("usa o fallback via baixa quando o campo direto está nulo (dado histórico)", async () => {
      const titulo = await criarTitulo(fixture.sessao, "PAGAR", {
        contraparteId: fixture.fornecedorId,
        documento: `FCD-FALLBACK-${Date.now()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        centroCustoId: centroCustoAtivoId,
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: fixture.contaBancariaId,
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date("2026-05-01T00:00:00Z"), valorOriginal: 400 }],
      });
      const parcela = titulo.parcelas[0];

      const baixa = await registrarBaixa(fixture.sessao, parcela.id, {
        data: new Date("2026-05-05T00:00:00Z"),
        valorPago: 400,
        valorJuros: 0,
        valorMulta: 0,
        valorDesconto: 0,
        contaBancariaId: fixture.contaBancariaId,
      });
      await aprovarBaixa(fixture.sessaoAdmin, baixa.id);

      // Simula dado histórico anterior a esta correção: apaga o campo direto
      // que aprovarBaixa já copiou (Task 3), deixando só o vínculo via baixaId.
      // Também concilia o lançamento — aprovarBaixa não marca `conciliado`
      // (isso só acontece no fluxo de conciliação bancária, fora do escopo
      // desta task), e o realizado só considera lançamentos conciliados.
      await prisma.lancamentoBancario.updateMany({
        where: { baixaId: baixa.id },
        data: { centroCustoId: null, conciliado: true },
      });

      const totais = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 5);
      expect(totais.get(centroCustoAtivoId)?.saidas).toBe(400);
    });

    test("sem campo direto e sem baixa cai na chave null (Não classificado)", async () => {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-06-10T00:00:00Z"),
          tipo: "ENTRADA",
          valor: 90,
          descricao: "Sem dimensão",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
        },
      });

      const totais = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 6);
      expect(totais.get(null)?.entradas).toBe(90);
    });

    test("escopo de filial — lançamento de outra filial não vaza", async () => {
      const outraFixture = await criarFixtureFinanceiro("FCD2", "FINANCEIRO");
      try {
        const outroCentro = await prisma.centroCusto.create({
          data: { filialId: outraFixture.filialId, nome: "Outro", codigo: "OUT" },
        });
        await prisma.lancamentoBancario.create({
          data: {
            filialId: outraFixture.filialId,
            contaBancariaId: outraFixture.contaBancariaId,
            data: new Date("2026-04-10T00:00:00Z"),
            tipo: "SAIDA",
            valor: 999,
            descricao: "Outra filial",
            origem: "MANUAL",
            usuarioId: outraFixture.usuarioId,
            conciliado: true,
            centroCustoId: outroCentro.id,
          },
        });

        const totais = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 4);
        expect(totais.get(outroCentro.id)).toBeUndefined();
      } finally {
        await limparFixtureFinanceiro(outraFixture);
      }
    });

    test("CENTRO_LUCRO usa centroLucroId — não aparece em CENTRO_CUSTO nem SAFRA (pega mapeamento trocado)", async () => {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-10-10T00:00:00Z"),
          tipo: "SAIDA",
          valor: 150,
          descricao: "Centro de lucro",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
          centroLucroId: centroLucroAtivoId,
        },
      });

      const porCentroLucro = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_LUCRO", 2026, 10);
      expect(porCentroLucro.get(centroLucroAtivoId)?.saidas).toBe(150);

      const porCentroCusto = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 10);
      expect(porCentroCusto.get(centroLucroAtivoId)).toBeUndefined();

      const porSafra = await buscarRealizadoPorDimensao(fixture.filialId, "SAFRA", 2026, 10);
      expect(porSafra.get(centroLucroAtivoId)).toBeUndefined();
    });

    test("SAFRA usa safraId — não aparece em CENTRO_CUSTO nem CENTRO_LUCRO (pega mapeamento trocado)", async () => {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-11-10T00:00:00Z"),
          tipo: "ENTRADA",
          valor: 250,
          descricao: "Safra",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
          safraId: safraAtivaId,
        },
      });

      const porSafra = await buscarRealizadoPorDimensao(fixture.filialId, "SAFRA", 2026, 11);
      expect(porSafra.get(safraAtivaId)?.entradas).toBe(250);

      const porCentroCusto = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 11);
      expect(porCentroCusto.get(safraAtivaId)).toBeUndefined();

      const porCentroLucro = await buscarRealizadoPorDimensao(fixture.filialId, "CENTRO_LUCRO", 2026, 11);
      expect(porCentroLucro.get(safraAtivaId)).toBeUndefined();
    });
  });

  describe("buscarProjetadoPorDimensao", () => {
    test("só considera parcelas em aberto dentro do mês, separadas por tipo", async () => {
      await criarTitulo(fixture.sessao, "PAGAR", {
        contraparteId: fixture.fornecedorId,
        documento: `FCD-PROJ-PAG-${Date.now()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        centroCustoId: centroCustoAtivoId,
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: fixture.contaBancariaId,
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date("2026-08-15T00:00:00Z"), valorOriginal: 500 }],
      });
      await criarTitulo(fixture.sessao, "RECEBER", {
        contraparteId: fixture.clienteId,
        documento: `FCD-PROJ-REC-${Date.now()}`,
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        centroCustoId: centroCustoAtivoId,
        centroLucroId: "",
        safraId: "",
        projetoId: "",
        contaBancariaId: fixture.contaBancariaId,
        formaPagamento: "",
        parcelas: [{ numero: 1, dataVencimento: new Date("2026-08-20T00:00:00Z"), valorOriginal: 700 }],
      });

      const totais = await buscarProjetadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 8);
      expect(totais.get(centroCustoAtivoId)?.saidas).toBeGreaterThanOrEqual(500);
      expect(totais.get(centroCustoAtivoId)?.entradas).toBeGreaterThanOrEqual(700);

      const totaisMesErrado = await buscarProjetadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 9);
      expect(totaisMesErrado.get(centroCustoAtivoId)).toBeUndefined();
    });

    test("escopo de filial — parcela em aberto de outra filial não vaza", async () => {
      const outraFixture = await criarFixtureFinanceiro("FCD3", "FINANCEIRO");
      try {
        const outroCentro = await prisma.centroCusto.create({
          data: { filialId: outraFixture.filialId, nome: "Outro", codigo: "OUT" },
        });

        await criarTitulo(outraFixture.sessao, "PAGAR", {
          contraparteId: outraFixture.fornecedorId,
          documento: `FCD3-PROJ-PAG-${Date.now()}`,
          dataEmissao: new Date(),
          dataCompetencia: new Date(),
          categoriaFinanceiraId: outraFixture.categoriaFinanceiraId,
          centroCustoId: outroCentro.id,
          centroLucroId: "",
          safraId: "",
          projetoId: "",
          contaBancariaId: outraFixture.contaBancariaId,
          formaPagamento: "",
          parcelas: [{ numero: 1, dataVencimento: new Date("2026-08-15T00:00:00Z"), valorOriginal: 999 }],
        });

        const totais = await buscarProjetadoPorDimensao(fixture.filialId, "CENTRO_CUSTO", 2026, 8);
        expect(totais.get(outroCentro.id)).toBeUndefined();
      } finally {
        await limparFixtureFinanceiro(outraFixture);
      }
    });
  });

  describe("listarValoresDimensao", () => {
    test("retorna só centros de custo ativos da filial", async () => {
      const valores = await listarValoresDimensao(fixture.filialId, "CENTRO_CUSTO");
      const ids = valores.map((v) => v.id);
      expect(ids).toContain(centroCustoAtivoId);
      expect(ids).toContain(centroCustoFilhoId);
      expect(ids).not.toContain(centroCustoInativoId);
    });
  });

  describe("listarFluxoDeCaixaPorDimensao", () => {
    test("inclui a linha Não classificado sempre, mesmo zerada", async () => {
      const linhas = await listarFluxoDeCaixaPorDimensao(fixture.sessao, "CENTRO_LUCRO", 2030, 1);
      const naoClassificado = linhas.find((l) => l.dimensaoId === null);
      expect(naoClassificado).toBeDefined();
      expect(naoClassificado?.dimensaoNome).toBe("Não classificado");
      expect(naoClassificado?.entradasRealizadas).toBe(0);
      expect(naoClassificado?.saidasRealizadas).toBe(0);
    });

    test("centro de custo filho não soma no total do pai (sem rollup)", async () => {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-07-10T00:00:00Z"),
          tipo: "SAIDA",
          valor: 60,
          descricao: "Do filho",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
          centroCustoId: centroCustoFilhoId,
        },
      });

      const linhas = await listarFluxoDeCaixaPorDimensao(fixture.sessao, "CENTRO_CUSTO", 2026, 7);
      const linhaPai = linhas.find((l) => l.dimensaoId === centroCustoAtivoId);
      const linhaFilho = linhas.find((l) => l.dimensaoId === centroCustoFilhoId);
      expect(linhaPai?.saidasRealizadas ?? 0).toBe(0);
      expect(linhaFilho?.saidasRealizadas).toBe(60);
    });

    test("dimensão inativa mas classificada aparece em linha própria '(inativo)', não some nem vira Não classificado", async () => {
      await prisma.lancamentoBancario.create({
        data: {
          filialId: fixture.filialId,
          contaBancariaId: fixture.contaBancariaId,
          data: new Date("2026-12-10T00:00:00Z"),
          tipo: "SAIDA",
          valor: 80,
          descricao: "Centro de custo desativado depois de classificado",
          origem: "MANUAL",
          usuarioId: fixture.usuarioId,
          conciliado: true,
          centroCustoId: centroCustoInativoId,
        },
      });

      const linhas = await listarFluxoDeCaixaPorDimensao(fixture.sessao, "CENTRO_CUSTO", 2026, 12);

      const linhaInativa = linhas.find((l) => l.dimensaoId === centroCustoInativoId);
      expect(linhaInativa).toBeDefined();
      expect(linhaInativa?.dimensaoNome).toBe("Inativo (inativo)");
      expect(linhaInativa?.saidasRealizadas).toBe(80);

      const naoClassificado = linhas.find((l) => l.dimensaoId === null);
      expect(naoClassificado?.saidasRealizadas ?? 0).toBe(0);
    });
  });
});
