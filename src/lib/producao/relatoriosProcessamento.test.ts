import { describe, expect, test } from "vitest";
import { agregarProcessamento, type OPDoProcessamento } from "./relatoriosProcessamento";

const op = (x: Partial<OPDoProcessamento>): OPDoProcessamento => ({
  frutaId: "a",
  status: "ENCERRADA",
  frutoKg: 0,
  polpaKg: 0,
  custoTotal: 0,
  balancoVerificar: false,
  branqueamentoVerificar: false,
  aguaLitros: 0,
  carocoResiduoKg: 0,
  perdaKg: 0,
  custoFrutoTotal: 0,
  custoInsumosTotal: 0,
  ...x,
});

const r = agregarProcessamento([
  op({
    frutoKg: 100,
    polpaKg: 40,
    aguaLitros: 20,
    carocoResiduoKg: 70,
    perdaKg: 9,
    custoFrutoTotal: 150,
    custoInsumosTotal: 5,
    custoTotal: 155,
  }),
  op({ frutoKg: 50, polpaKg: 25, carocoResiduoKg: 20, custoFrutoTotal: 75, custoTotal: 75, balancoVerificar: true }),
  op({ status: "ABERTA", frutoKg: 30, custoFrutoTotal: 45, custoTotal: 45, balancoVerificar: true }),
  op({ frutaId: "c", frutoKg: 40, polpaKg: 16, carocoResiduoKg: 20, perdaKg: 4, custoFrutoTotal: 80, custoTotal: 80 }),
  op({ frutaId: "c", status: "CANCELADA", frutoKg: 10 }),
]);
const a = r.porFruta.get("a")!;

describe("agregarProcessamento", () => {
  test("volume com abertas, como o painel (D-29)", () => {
    expect(a.volume).toMatchObject({ quantidade: 3, frutoKg: 180, polpaKg: 65 });
    expect(a.volume.rendimento).toBeCloseTo(65 / 180);
    expect(a.volume.custoMedioPolpa).toBeCloseTo(230 / 65);
  });

  test("rendimento mín./máx. só de encerradas (D-31)", () => {
    expect(a).toMatchObject({ encerradas: 2, rendimentoMin: 0.4, rendimentoMax: 0.5 });
  });

  test("balanço de massa das encerradas", () => {
    expect(a.balanco).toMatchObject({
      frutoKg: 150,
      aguaKg: 20,
      polpaKg: 65,
      carocoResiduoKg: 90,
      perdaKg: 9,
      diferencaKg: 6,
      opsVerificar: 1,
    });
    expect(a.balanco.percentual).toBeCloseTo(6 / 170);
  });

  test("custo das encerradas", () => {
    expect(a.custo).toMatchObject({ custoFruto: 225, custoInsumos: 5, custoTotal: 230, polpaKg: 65 });
    expect(a.custo.custoKg).toBeCloseTo(230 / 65);
  });

  test("cancelada fora; total de todas as frutas", () => {
    expect(r.porFruta.get("c")!.volume.quantidade).toBe(1);
    expect(r.total.volume).toMatchObject({ quantidade: 4, frutoKg: 220, polpaKg: 81 });
    expect(r.total).toMatchObject({ encerradas: 3, rendimentoMin: 0.4, rendimentoMax: 0.5 });
    expect(r.total.balanco).toMatchObject({ diferencaKg: 6, opsVerificar: 1 });
    expect(r.total.custo.custoTotal).toBe(310);
  });

  test("só abertas: nada de encerradas", () => {
    const s = agregarProcessamento([op({ status: "ABERTA", frutoKg: 30 })]);
    expect(s.total).toMatchObject({ encerradas: 0, rendimentoMin: null, rendimentoMax: null });
    expect(s.total.balanco.percentual).toBeNull();
    expect(s.total.custo.custoKg).toBeNull();
    expect(s.total.volume.quantidade).toBe(1);
  });
});
