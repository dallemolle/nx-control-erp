import { describe, expect, test } from "vitest";
import { classificarLinhaExtrato, type CandidatoParaClassificar } from "./conciliacao";

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
