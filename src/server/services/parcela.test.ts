import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { calcularStatusParcela, recalcularEPersistirStatusParcela } from "./parcela";
import { prisma } from "@/server/db/client";
import { criarFixtureFinanceiro, limparFixtureFinanceiro, type FixtureFinanceiro } from "./financeiroTestFixtures";

const HOJE = new Date("2026-08-31T12:00:00Z");

function parcela(overrides: Partial<{ valorAtualizado: number; dataVencimento: Date; status: "EM_ABERTO" | "CANCELADO" | "RENEGOCIADO" }> = {}) {
  return {
    valorAtualizado: 1000,
    dataVencimento: new Date("2026-09-30T00:00:00Z"),
    status: "EM_ABERTO" as const,
    ...overrides,
  };
}

describe("calcularStatusParcela", () => {
  test("saldo zerado por baixas aprovadas = PAGO", () => {
    const status = calcularStatusParcela(parcela(), [{ valorPago: 1000 }], HOJE);
    expect(status).toBe("PAGO");
  });

  test("saldo negativo (pagou a mais) também = PAGO", () => {
    const status = calcularStatusParcela(parcela(), [{ valorPago: 1200 }], HOJE);
    expect(status).toBe("PAGO");
  });

  test("baixa parcial = PARCIALMENTE_PAGO", () => {
    const status = calcularStatusParcela(parcela(), [{ valorPago: 400 }], HOJE);
    expect(status).toBe("PARCIALMENTE_PAGO");
  });

  test("vencimento no passado, sem baixa = VENCIDO", () => {
    const status = calcularStatusParcela(
      parcela({ dataVencimento: new Date("2026-08-01T00:00:00Z") }),
      [],
      HOJE,
    );
    expect(status).toBe("VENCIDO");
  });

  test("vencimento em 5 dias, sem baixa = A_VENCER", () => {
    const status = calcularStatusParcela(
      parcela({ dataVencimento: new Date("2026-09-05T12:00:00Z") }),
      [],
      HOJE,
    );
    expect(status).toBe("A_VENCER");
  });

  test("vencimento em exatamente 7 dias = A_VENCER (borda inclusiva)", () => {
    const status = calcularStatusParcela(
      parcela({ dataVencimento: new Date("2026-09-07T12:00:00Z") }),
      [],
      HOJE,
    );
    expect(status).toBe("A_VENCER");
  });

  test("vencimento em 8 dias = EM_ABERTO", () => {
    const status = calcularStatusParcela(
      parcela({ dataVencimento: new Date("2026-09-08T12:00:01Z") }),
      [],
      HOJE,
    );
    expect(status).toBe("EM_ABERTO");
  });

  test("CANCELADO nunca é sobrescrito, mesmo com saldo zerado", () => {
    const status = calcularStatusParcela(parcela({ status: "CANCELADO" }), [{ valorPago: 1000 }], HOJE);
    expect(status).toBe("CANCELADO");
  });

  test("RENEGOCIADO nunca é sobrescrito, mesmo vencido", () => {
    const status = calcularStatusParcela(
      parcela({ status: "RENEGOCIADO", dataVencimento: new Date("2026-01-01T00:00:00Z") }),
      [],
      HOJE,
    );
    expect(status).toBe("RENEGOCIADO");
  });
});

describe("recalcularEPersistirStatusParcela (integração)", () => {
  let fixture: FixtureFinanceiro;

  beforeAll(async () => {
    fixture = await criarFixtureFinanceiro("PARC");
  });

  afterAll(async () => {
    await limparFixtureFinanceiro(fixture);
    await prisma.$disconnect();
  });

  test("aprovar uma baixa e recalcular muda o status persistido para PAGO", async () => {
    const titulo = await prisma.titulo.create({
      data: {
        filialId: fixture.filialId,
        tipo: "PAGAR",
        fornecedorId: fixture.fornecedorId,
        documento: "NF-1",
        dataEmissao: new Date(),
        dataCompetencia: new Date(),
        categoriaFinanceiraId: fixture.categoriaFinanceiraId,
        parcelas: {
          create: { numero: 1, dataVencimento: new Date(), valorOriginal: 500, valorAtualizado: 500 },
        },
      },
      include: { parcelas: true },
    });
    const parcelaId = titulo.parcelas[0].id;

    await prisma.baixa.create({
      data: {
        parcelaId,
        data: new Date(),
        valorPago: 500,
        contaBancariaId: fixture.contaBancariaId,
        usuarioId: fixture.usuarioId,
        statusAprovacao: "APROVADO",
      },
    });

    const status = await recalcularEPersistirStatusParcela(parcelaId);
    expect(status).toBe("PAGO");

    const parcelaAtualizada = await prisma.parcela.findUniqueOrThrow({ where: { id: parcelaId } });
    expect(parcelaAtualizada.status).toBe("PAGO");
  });
});
