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
    avaliadoEm: new Date("2026-10-15T18:00:00.000Z"),
    motivoRejeicao: null,
    dispensadaEm: null,
    motivoDispensa: null,
    dispensadaPor: null,
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
      {
        id: "p1",
        numero: 1,
        dataVencimento: vencimento,
        valorAtualizado: 150.25,
        status: "ABERTA",
        baixas: [],
        temBaixaPendente: false,
      },
    ]);
    expect(titulo.contaBancaria).toEqual({ tipo: "CORRENTE", agencia: "0001", conta: "123-4", banco: { nome: "Banco X" } });
    expect(titulo.documento).toBe("NF 1");
  });

  it("leva todas as baixas, convertidas, inclusive rejeitadas", () => {
    const estornadaEm = new Date("2026-10-16T12:40:00.000Z");
    const parcela = {
      ...tituloDoServico.parcelas[0],
      baixas: [
        baixa("pendente", "PENDENTE", { avaliadoPor: null, lancamentos: [] }),
        baixa("rejeitada", "REJEITADO", {
          criadoEm: new Date("2026-10-14T13:00:00.000Z"),
          avaliadoEm: new Date("2026-10-14T18:00:00.000Z"),
          motivoRejeicao: "valor errado",
        }),
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

    expect(titulo.parcelas[0].temBaixaPendente).toBe(true);
    expect(titulo.parcelas[0].baixas).toEqual([
      expect.objectContaining({
        id: "rejeitada",
        status: "REJEITADO",
        aprovadaPor: null,
        rejeitadaPor: "João",
        rejeitadaEm: new Date("2026-10-14T18:00:00.000Z"),
        motivoRejeicao: "valor errado",
        // Vieram baixas depois da rejeição: resolvida.
        rejeicaoEmAberto: false,
      }),
      expect.objectContaining({ id: "pendente", status: "PENDENTE", aprovadaPor: null }),
      {
        id: "estornada",
        data: new Date("2026-10-15T00:00:00.000Z"),
        registradaEm: new Date("2026-10-15T13:00:00.000Z"),
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
        rejeitadaPor: null,
        rejeitadaEm: null,
        motivoRejeicao: null,
        rejeicaoEmAberto: false,
        dispensadaPor: null,
        dispensadaEm: null,
        motivoDispensa: null,
        conciliada: false,
        deRepasse: false,
      },
      expect.objectContaining({ id: "aprovada", status: "APROVADO", estornadaPor: null }),
    ]);
  });

  it("parcela só com baixa rejeitada: sem pendente, com a rejeição em aberto", () => {
    const parcela = {
      ...tituloDoServico.parcelas[0],
      baixas: [baixa("rejeitada", "REJEITADO", { motivoRejeicao: "valor errado" })],
    };
    const [titulo] = titulosParaCliente([{ ...tituloDoServico, parcelas: [parcela] }]);
    expect(titulo.parcelas[0].temBaixaPendente).toBe(false);
    expect(titulo.parcelas[0].baixas).toEqual([
      expect.objectContaining({ id: "rejeitada", rejeicaoEmAberto: true, motivoRejeicao: "valor errado" }),
    ]);
  });

  it("rejeição dispensada leva quem, quando e o motivo, e não está em aberto", () => {
    const dispensadaEm = new Date("2026-10-16T12:00:00.000Z");
    const parcela = {
      ...tituloDoServico.parcelas[0],
      baixas: [
        baixa("rejeitada", "REJEITADO", {
          dispensadaEm,
          dispensadaPor: { nome: "Maria" },
          motivoDispensa: "pagamento não aconteceu",
        }),
      ],
    };
    const [titulo] = titulosParaCliente([{ ...tituloDoServico, parcelas: [parcela] }]);
    expect(titulo.parcelas[0].baixas[0]).toMatchObject({
      rejeicaoEmAberto: false,
      dispensadaPor: "Maria",
      dispensadaEm,
      motivoDispensa: "pagamento não aconteceu",
    });
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
