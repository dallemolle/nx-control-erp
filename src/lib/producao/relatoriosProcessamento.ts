import { arredondar } from "./arredondar";
import { rendimento } from "./op";
import { agregarOPs, razao, type OPDoPainel, type TotaisOPs } from "./painel";

export type OPDoProcessamento = OPDoPainel & {
  aguaLitros: number;
  carocoResiduoKg: number;
  perdaKg: number;
  custoFrutoTotal: number;
  custoInsumosTotal: number;
};

export type BalancoAgregado = {
  frutoKg: number;
  /** 1 L = 1 kg (RN-11). */
  aguaKg: number;
  polpaKg: number;
  carocoResiduoKg: number;
  perdaKg: number;
  diferencaKg: number;
  /** diferença ÷ (fruto + água). */
  percentual: number | null;
  /** OPs com balanço "Verificar" pela tolerância configurada. */
  opsVerificar: number;
};

export type CustoAgregado = {
  custoFruto: number;
  custoInsumos: number;
  custoTotal: number;
  polpaKg: number;
  custoKg: number | null;
};

export type LinhaProcessamento = {
  /** Abertas e encerradas: os mesmos números do painel (D-29). */
  volume: TotaisOPs;
  /** Daqui para baixo, só OPs encerradas (D-31). */
  encerradas: number;
  rendimentoMin: number | null;
  rendimentoMax: number | null;
  balanco: BalancoAgregado;
  custo: CustoAgregado;
};

const somar = <T>(itens: T[], valor: (item: T) => number) => itens.reduce((s, i) => s + valor(i), 0);

function soEncerradas(ops: OPDoProcessamento[]): Omit<LinhaProcessamento, "volume"> {
  const enc = ops.filter((op) => op.status === "ENCERRADA");
  const rendimentos = enc.map((op) => rendimento(op.frutoKg, op.polpaKg)).filter((r): r is number => r !== null);
  const fruto = somar(enc, (op) => op.frutoKg);
  const agua = somar(enc, (op) => op.aguaLitros);
  const polpa = somar(enc, (op) => op.polpaKg);
  const caroco = somar(enc, (op) => op.carocoResiduoKg);
  const perda = somar(enc, (op) => op.perdaKg);
  const diferenca = fruto + agua - polpa - caroco - perda;
  const custoFruto = somar(enc, (op) => op.custoFrutoTotal);
  const custoInsumos = somar(enc, (op) => op.custoInsumosTotal);
  const custoTotal = custoFruto + custoInsumos;
  return {
    encerradas: enc.length,
    rendimentoMin: rendimentos.length > 0 ? Math.min(...rendimentos) : null,
    rendimentoMax: rendimentos.length > 0 ? Math.max(...rendimentos) : null,
    balanco: {
      frutoKg: arredondar(fruto, 3),
      aguaKg: arredondar(agua, 3),
      polpaKg: arredondar(polpa, 3),
      carocoResiduoKg: arredondar(caroco, 3),
      perdaKg: arredondar(perda, 3),
      diferencaKg: arredondar(diferenca, 3),
      percentual: razao(diferenca, fruto + agua),
      opsVerificar: enc.filter((op) => op.balancoVerificar).length,
    },
    custo: {
      custoFruto: arredondar(custoFruto, 2),
      custoInsumos: arredondar(custoInsumos, 2),
      custoTotal: arredondar(custoTotal, 2),
      polpaKg: arredondar(polpa, 3),
      custoKg: razao(custoTotal, polpa),
    },
  };
}

/** Resumo, balanço e custo por fruta e no total; OP cancelada fica fora (D-29, D-31). */
export function agregarProcessamento(ops: OPDoProcessamento[]): {
  porFruta: Map<string, LinhaProcessamento>;
  total: LinhaProcessamento;
} {
  const validas = ops.filter((op) => op.status !== "CANCELADA");
  const volume = agregarOPs(validas);
  const grupos = new Map<string, OPDoProcessamento[]>();
  for (const op of validas) grupos.set(op.frutaId, [...(grupos.get(op.frutaId) ?? []), op]);
  return {
    porFruta: new Map(
      [...grupos].map(([frutaId, grupo]) => [frutaId, { volume: volume.porFruta.get(frutaId)!, ...soEncerradas(grupo) }]),
    ),
    total: { volume: volume.total, ...soEncerradas(validas) },
  };
}
