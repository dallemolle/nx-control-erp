import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { titulosParaCliente } from "./titulos-para-cliente";

const vencimento = new Date("2026-11-10T00:00:00.000Z");
const conta = { tipo: "CORRENTE", agencia: "0001", conta: "123-4", banco: { nome: "Banco X" } };
const dec = (valor: string) => new Prisma.Decimal(valor);

function baixa(id: string, statusAprovacao: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    data: new Date("2026-10-15T00:00:00.000Z"),
    criadoEm: new Date("2026-10-15T13:00:00.000Z"),
    statusAprovacao,
    valorPago: dec("1012.00"),
    valorJuros: dec("12.00"),
    valorMulta: dec("0"),
    valorDesconto: dec("0"),
    contaBancaria: conta,
    usuario: { nome: "Maria" },
    avaliadoPor: { nome: "João" },
    estornadoPor: null,
    estornadoEm: null,
    motivoEstorno: null,
    lancamentos: [{ grupoConciliacaoId: null }],
    repasseRecebimento: null,
    repasseTaxa: null,
    ...extra,
  };
}

const tituloDoServico = {
  id: "t1",
  documento: "NF 1",
  contaBancaria: {
    tipo: "CORRENTE",
    agencia: "0001",
    conta: "123-4",
    saldoInicial: dec("1000.00"),
    banco: { nome: "Banco X", codigo: "001" },
  },
  parcelas: [
    {
      id: "p1",
      numero: 1,
      dataVencimento: vencimento,
      valorOriginal: dec("150.00"),
      valorAtualizado: dec("150.25"),
      status: "ABERTA",
      baixas: [] as ReturnType<typeof baixa>[],
    },
  ],
};

describe("titulosParaCliente", () => {
  it("converte valorAtualizado para number e descarta campos Decimal não usados", () => {
    const [titulo] = titulosParaCliente([tituloDoServico]);

    expect(titulo.parcelas).toEqual([
      { id: "p1", numero: 1, dataVencimento: vencimento, valorAtualizado: 150.25, status: "ABERTA", baixas: [] },
    ]);
    expect(titulo.contaBancaria).toEqual({ tipo: "CORRENTE", agencia: "0001", conta: "123-4", banco: { nome: "Banco X" } });
    expect(titulo.documento).toBe("NF 1");
  });

  it("leva só as baixas aprovadas e estornadas, convertidas", () => {
    const estornadaEm = new Date("2026-10-16T12:40:00.000Z");
    const parcela = {
      ...tituloDoServico.parcelas[0],
      baixas: [
        baixa("pendente", "PENDENTE"),
        baixa("rejeitada", "REJEITADO"),
        baixa("estornada", "ESTORNADO", {
          estornadoPor: { nome: "João" },
          estornadoEm: estornadaEm,
          motivoEstorno: "conta errada",
          lancamentos: [],
        }),
        baixa("aprovada", "APROVADO", { data: new Date("2026-10-20T00:00:00.000Z") }),
      ],
    };
    const [titulo] = titulosParaCliente([{ ...tituloDoServico, parcelas: [parcela] }]);

    expect(titulo.parcelas[0].baixas).toEqual([
      {
        id: "estornada",
        data: new Date("2026-10-15T00:00:00.000Z"),
        status: "ESTORNADO",
        valorPago: 1012,
        valorJuros: 12,
        valorMulta: 0,
        valorDesconto: 0,
        conta: "Banco X - Ag 0001/CC 123-4",
        registradaPor: "Maria",
        aprovadaPor: "João",
        estornadaPor: "João",
        estornadaEm,
        motivoEstorno: "conta errada",
        conciliada: false,
        deRepasse: false,
      },
      expect.objectContaining({ id: "aprovada", status: "APROVADO", estornadaPor: null }),
    ]);
  });

  it("marca conciliada e de repasse", () => {
    const parcela = {
      ...tituloDoServico.parcelas[0],
      baixas: [
        baixa("conciliada", "APROVADO", { lancamentos: [{ grupoConciliacaoId: "g1" }] }),
        baixa("repasse", "APROVADO", { repasseTaxa: { id: "r1" } }),
      ],
    };
    const [titulo] = titulosParaCliente([{ ...tituloDoServico, parcelas: [parcela] }]);
    const [conciliada, repasse] = titulo.parcelas[0].baixas;
    expect(conciliada).toMatchObject({ conciliada: true, deRepasse: false });
    expect(repasse).toMatchObject({ conciliada: false, deRepasse: true });
  });

  it("não sobra nenhum Decimal no resultado", () => {
    const parcela = { ...tituloDoServico.parcelas[0], baixas: [baixa("aprovada", "APROVADO")] };
    const resultado = titulosParaCliente([{ ...tituloDoServico, parcelas: [parcela] }]);
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
