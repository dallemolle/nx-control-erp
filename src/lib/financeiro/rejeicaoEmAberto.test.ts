import { describe, expect, it } from "vitest";
import { parcelaTemRejeicaoEmAberto, rejeicaoEmAberto, type BaixaParaRejeicao } from "./rejeicaoEmAberto";

const rejeitada: BaixaParaRejeicao = {
  id: "r1",
  statusAprovacao: "REJEITADO",
  criadoEm: new Date("2026-10-15T13:00:00.000Z"),
  avaliadoEm: new Date("2026-10-15T18:00:00.000Z"),
  dispensadaEm: null,
};
const depois = (id: string, statusAprovacao = "PENDENTE"): BaixaParaRejeicao => ({
  id,
  statusAprovacao,
  criadoEm: new Date("2026-10-16T09:00:00.000Z"),
  avaliadoEm: null,
  dispensadaEm: null,
});

describe("rejeicaoEmAberto", () => {
  it("rejeitada, sem dispensa, sem baixa depois e parcela em aberto: em aberto", () => {
    expect(rejeicaoEmAberto(rejeitada, [rejeitada], "VENCIDO")).toBe(true);
  });

  it("baixa que não é rejeitada nunca está em aberto", () => {
    for (const status of ["PENDENTE", "APROVADO", "ESTORNADO"]) {
      expect(rejeicaoEmAberto({ ...rejeitada, statusAprovacao: status }, [], "EM_ABERTO")).toBe(false);
    }
  });

  it("dispensada: resolvida", () => {
    const dispensada = { ...rejeitada, dispensadaEm: new Date("2026-10-16T10:00:00.000Z") };
    expect(rejeicaoEmAberto(dispensada, [dispensada], "EM_ABERTO")).toBe(false);
  });

  it("outra baixa registrada depois da rejeição, com qualquer status: resolvida", () => {
    for (const status of ["PENDENTE", "APROVADO", "REJEITADO", "ESTORNADO"]) {
      expect(rejeicaoEmAberto(rejeitada, [rejeitada, depois("b2", status)], "EM_ABERTO")).toBe(false);
    }
  });

  it("baixa registrada antes da rejeição não resolve", () => {
    const antes = { ...depois("b0", "ESTORNADO"), criadoEm: new Date("2026-10-01T09:00:00.000Z") };
    expect(rejeicaoEmAberto(rejeitada, [antes, rejeitada], "PARCIALMENTE_PAGO")).toBe(true);
  });

  it("parcela paga, cancelada ou renegociada: resolvida", () => {
    for (const status of ["PAGO", "CANCELADO", "RENEGOCIADO"]) {
      expect(rejeicaoEmAberto(rejeitada, [rejeitada], status)).toBe(false);
    }
  });

  it("sem avaliadoEm (dado antigo), compara com o registro da própria baixa", () => {
    const semData = { ...rejeitada, avaliadoEm: null };
    expect(rejeicaoEmAberto(semData, [semData], "EM_ABERTO")).toBe(true);
    expect(rejeicaoEmAberto(semData, [semData, depois("b2")], "EM_ABERTO")).toBe(false);
  });
});

describe("parcelaTemRejeicaoEmAberto", () => {
  it("rejeitada duas vezes: só a mais nova conta, e a parcela tem rejeição em aberto", () => {
    const segunda = { ...depois("r2", "REJEITADO"), avaliadoEm: new Date("2026-10-16T15:00:00.000Z") };
    expect(rejeicaoEmAberto(rejeitada, [rejeitada, segunda], "VENCIDO")).toBe(false);
    expect(rejeicaoEmAberto(segunda, [rejeitada, segunda], "VENCIDO")).toBe(true);
    expect(parcelaTemRejeicaoEmAberto({ status: "VENCIDO", baixas: [rejeitada, segunda] })).toBe(true);
  });

  it("relançada e aprovada: a parcela não tem rejeição em aberto", () => {
    expect(parcelaTemRejeicaoEmAberto({ status: "PAGO", baixas: [rejeitada, depois("b2", "APROVADO")] })).toBe(false);
  });

  it("parcela sem baixas", () => {
    expect(parcelaTemRejeicaoEmAberto({ status: "EM_ABERTO", baixas: [] })).toBe(false);
  });
});
