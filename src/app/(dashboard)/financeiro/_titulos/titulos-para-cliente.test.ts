import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { titulosParaCliente } from "./titulos-para-cliente";

const vencimento = new Date("2026-11-10T00:00:00.000Z");

const tituloDoServico = {
  id: "t1",
  documento: "NF 1",
  contaBancaria: {
    tipo: "CORRENTE",
    agencia: "0001",
    conta: "123-4",
    saldoInicial: new Prisma.Decimal("1000.00"),
    banco: { nome: "Banco X", codigo: "001" },
  },
  parcelas: [
    {
      id: "p1",
      numero: 1,
      dataVencimento: vencimento,
      valorOriginal: new Prisma.Decimal("150.00"),
      valorAtualizado: new Prisma.Decimal("150.25"),
      status: "ABERTA",
      baixas: [{ id: "b1", valorPago: new Prisma.Decimal("10.00") }],
    },
  ],
};

describe("titulosParaCliente", () => {
  it("converte valorAtualizado para number e descarta campos Decimal não usados", () => {
    const [titulo] = titulosParaCliente([tituloDoServico]);

    expect(titulo.parcelas).toEqual([
      { id: "p1", numero: 1, dataVencimento: vencimento, valorAtualizado: 150.25, status: "ABERTA" },
    ]);
    expect(titulo.contaBancaria).toEqual({ tipo: "CORRENTE", agencia: "0001", conta: "123-4", banco: { nome: "Banco X" } });
    expect(titulo.documento).toBe("NF 1");
  });

  it("não sobra nenhum Decimal no resultado", () => {
    const resultado = titulosParaCliente([tituloDoServico]);
    const temDecimal = (valor: unknown): boolean =>
      Prisma.Decimal.isDecimal(valor) ||
      (typeof valor === "object" && valor !== null && !(valor instanceof Date) && Object.values(valor).some(temDecimal));
    expect(temDecimal(resultado)).toBe(false);
  });

  it("mantém contaBancaria nula", () => {
    const [titulo] = titulosParaCliente([{ ...tituloDoServico, contaBancaria: null }]);
    expect(titulo.contaBancaria).toBeNull();
  });
});
