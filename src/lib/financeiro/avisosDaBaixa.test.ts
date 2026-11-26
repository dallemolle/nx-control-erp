import { describe, expect, it } from "vitest";
import { avisosDaBaixa, resumirBaixasDaParcela, type DadosAvisoBaixa } from "./avisosDaBaixa";

// Intl usa espaço não separável entre "R$" e o número.
const semNbsp = (texto: string) => texto.replace(/ /g, " ");

const dia = (aaaammdd: string) => new Date(`${aaaammdd}T00:00:00.000Z`);

/** Pagamento de R$ 1.000,00 em dia, registrado no mesmo dia às 10:20 de Brasília: nenhum aviso. */
const BASE: DadosAvisoBaixa = {
  tipoTitulo: "PAGAR",
  data: dia("2026-10-15"),
  criadoEm: new Date("2026-10-15T13:20:00.000Z"),
  valorPago: 1000,
  valorJuros: 0,
  valorMulta: 0,
  valorDesconto: 0,
  valorParcela: 1000,
  totalAprovado: 0,
  outrasPendentes: 0,
  hoje: dia("2026-10-16"),
};

const textos = (dados: Partial<DadosAvisoBaixa>) => avisosDaBaixa({ ...BASE, ...dados }).map((a) => semNbsp(a.texto));
const tipos = (dados: Partial<DadosAvisoBaixa>) => avisosDaBaixa({ ...BASE, ...dados }).map((a) => a.tipo);

describe("avisosDaBaixa", () => {
  it("baixa certinha não tem aviso", () => {
    expect(avisosDaBaixa(BASE)).toEqual([]);
  });

  describe("data", () => {
    it("data de hoje não é futuro", () => {
      expect(tipos({ data: dia("2026-10-16"), criadoEm: new Date("2026-10-16T13:00:00.000Z") })).toEqual([]);
    });

    it("data depois de hoje avisa", () => {
      expect(textos({ data: dia("2026-10-17"), criadoEm: new Date("2026-10-16T13:00:00.000Z") })).toEqual([
        "Data da baixa no futuro",
      ]);
    });

    it("30 dias antes do registro não avisa; 31 avisa com o número de dias", () => {
      expect(tipos({ data: dia("2026-09-15") })).toEqual([]);
      expect(textos({ data: dia("2026-09-14") })).toEqual(["Data da baixa 31 dias antes do registro"]);
    });

    it("o dia do registro é o de Brasília (23:30 de 15/10 em Brasília é 02:30 de 16/10 UTC)", () => {
      // Pelo dia UTC seriam 31 dias; pelo de Brasília, 30.
      expect(tipos({ data: dia("2026-09-15"), criadoEm: new Date("2026-10-16T02:30:00.000Z") })).toEqual([]);
    });

    it("data com hora (a API aceita) vale pelo dia UTC: hoje às 17:00Z não é futuro", () => {
      expect(
        tipos({ data: new Date("2026-10-16T17:00:00.000Z"), criadoEm: new Date("2026-10-16T13:00:00.000Z") }),
      ).toEqual([]);
    });

    it("data com hora conta os dias pelo dia UTC (31 dias)", () => {
      expect(textos({ data: new Date("2026-09-14T15:00:00.000Z") })).toEqual([
        "Data da baixa 31 dias antes do registro",
      ]);
    });

    it("o exemplo da lacuna: 16/01 digitado em vez de 16/10", () => {
      expect(textos({ data: dia("2026-01-16"), criadoEm: new Date("2026-10-16T14:30:00.000Z") })).toEqual([
        "Data da baixa 273 dias antes do registro",
      ]);
    });
  });

  describe("valor", () => {
    it("juros e multa entram no esperado", () => {
      expect(tipos({ valorPago: 1015, valorJuros: 12, valorMulta: 3 })).toEqual([]);
    });

    it("desconto sai do esperado", () => {
      expect(tipos({ valorPago: 950, valorDesconto: 50 })).toEqual([]);
    });

    it("pagamento parcial diz quanto falta", () => {
      expect(textos({ valorPago: 600 })).toEqual(["Pagamento parcial: faltam R$ 400,00"]);
    });

    it("no recebimento o parcial diz Recebimento", () => {
      expect(textos({ tipoTitulo: "RECEBER", valorPago: 600 })).toEqual(["Recebimento parcial: faltam R$ 400,00"]);
    });

    it("acima do saldo diz a diferença", () => {
      expect(textos({ valorPago: 1012 })).toEqual(["Acima do saldo em R$ 12,00"]);
    });

    it("parcela com baixa parcial aprovada: o esperado é o que falta", () => {
      expect(tipos({ totalAprovado: 400, valorPago: 600 })).toEqual([]);
      expect(textos({ totalAprovado: 400, valorPago: 1000 })).toEqual(["Acima do saldo em R$ 400,00"]);
    });

    it("parcela já quitada mostra só 'já está paga', sem 'acima do saldo'", () => {
      expect(textos({ totalAprovado: 1000, valorPago: 1000 })).toEqual(["A parcela já está paga"]);
    });

    it("compara em centavos (0,1 + 0,2 não vira diferença)", () => {
      expect(tipos({ valorParcela: 0.3, valorPago: 0.1 + 0.2 })).toEqual([]);
    });
  });

  it("avisa outra baixa pendente na mesma parcela", () => {
    expect(textos({ outrasPendentes: 1 })).toEqual(["Há outra baixa pendente nesta parcela"]);
  });

  it("junta vários avisos na ordem: data, valor, pendente", () => {
    expect(tipos({ data: dia("2026-10-20"), valorPago: 500, outrasPendentes: 1 })).toEqual([
      "DATA_FUTURA",
      "PARCIAL",
      "OUTRA_PENDENTE",
    ]);
  });

  it.each([
    ["CANCELADO", "Parcela cancelada: rejeite esta baixa"],
    ["RENEGOCIADO", "Parcela renegociada: rejeite esta baixa"],
  ])("parcela %s: aviso próprio, primeiro, sem os avisos de valor", (statusParcela, texto) => {
    const avisos = avisosDaBaixa({ ...BASE, valorPago: 1, statusParcela });
    expect(avisos[0]).toEqual({ tipo: "PARCELA_FECHADA", texto });
    expect(avisos.map((a) => a.tipo)).not.toContain("PARCIAL");
    expect(avisos.map((a) => a.tipo)).not.toContain("PARCELA_PAGA");
    expect(avisos.map((a) => a.tipo)).not.toContain("ACIMA_DO_SALDO");
  });

  it("parcela em aberto não gera o aviso de parcela fechada", () => {
    expect(tipos({ statusParcela: "VENCIDO" })).not.toContain("PARCELA_FECHADA");
  });
});

describe("resumirBaixasDaParcela", () => {
  it("soma as aprovadas e conta as outras pendentes, sem contar a própria nem as rejeitadas", () => {
    const baixas = [
      { id: "esta", valorPago: 200, valorJuros: 0, valorMulta: 0, valorDesconto: 0, statusAprovacao: "PENDENTE" },
      { id: "a1", valorPago: 100.1, valorJuros: 0, valorMulta: 0, valorDesconto: 0, statusAprovacao: "APROVADO" },
      { id: "a2", valorPago: 0.2, valorJuros: 0, valorMulta: 0, valorDesconto: 0, statusAprovacao: "APROVADO" },
      { id: "p2", valorPago: 200, valorJuros: 0, valorMulta: 0, valorDesconto: 0, statusAprovacao: "PENDENTE" },
      { id: "r1", valorPago: 999, valorJuros: 0, valorMulta: 0, valorDesconto: 0, statusAprovacao: "REJEITADO" },
    ];
    expect(resumirBaixasDaParcela("esta", baixas)).toEqual({ totalAprovado: 100.3, outrasPendentes: 1 });
  });

  it("total aprovado usa o valor abatido (desconto de baixa anterior conta)", () => {
    const baixas = [
      { id: "esta", valorPago: 450, valorJuros: 0, valorMulta: 0, valorDesconto: 0, statusAprovacao: "PENDENTE" },
      { id: "a1", valorPago: 500, valorJuros: 10, valorMulta: 0, valorDesconto: 60, statusAprovacao: "APROVADO" },
    ];
    expect(resumirBaixasDaParcela("esta", baixas)).toEqual({ totalAprovado: 550, outrasPendentes: 0 });
  });
});
