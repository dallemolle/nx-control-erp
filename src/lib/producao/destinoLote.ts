import type { MotivoAjusteEstoque, TipoMovimentoEstoque } from "@prisma/client";
import { ROTULOS_MOTIVO_AJUSTE } from "@/lib/schemas/enums";
import { arredondar } from "./arredondar";

/** Movimento do ledger com sinal (saída < 0); `motivo` só no ajuste. */
export type MovimentoDoLote = {
  tipo: TipoMovimentoEstoque;
  quantidadeKg: number;
  motivo: MotivoAjusteEstoque | null;
};

/** Para onde foi cada kg do lote. Campos em kg positivos, salvo `ajustes` (líquido por motivo, com sinal). */
export type DestinoLote = {
  entradaKg: number;
  /** Recepção cancelada ou polpa removida. */
  estornoEntradaKg: number;
  vendidoKg: number;
  consumidoOpKg: number;
  ajustes: { motivo: MotivoAjusteEstoque; kg: number }[];
  saldoKg: number;
  /** A soma dos movimentos bate com o saldo do lote. */
  confere: boolean;
};

// `0 - x` em vez de `-x`: evita "-0" na tela.
const inverter = (kg: number) => 0 - kg;

export function destinoDoLote(movimentos: MovimentoDoLote[], saldoKg: number): DestinoLote {
  const soma = (tipos: TipoMovimentoEstoque[]) =>
    arredondar(
      movimentos.filter((m) => tipos.includes(m.tipo)).reduce((s, m) => s + m.quantidadeKg, 0),
      3,
    );

  const porMotivo = new Map<MotivoAjusteEstoque, number>();
  for (const m of movimentos) {
    if (m.tipo !== "AJUSTE") continue;
    const motivo = m.motivo ?? "OUTRO";
    porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + m.quantidadeKg);
  }

  const total = arredondar(
    movimentos.reduce((s, m) => s + m.quantidadeKg, 0),
    3,
  );
  return {
    entradaKg: soma(["ENTRADA", "PRODUCAO_OP"]),
    estornoEntradaKg: inverter(soma(["ESTORNO_RECEPCAO", "ESTORNO_PRODUCAO_OP"])),
    vendidoKg: inverter(soma(["VENDA", "ESTORNO_VENDA"])),
    consumidoOpKg: inverter(soma(["CONSUMO_OP", "ESTORNO_CONSUMO_OP"])),
    ajustes: [...porMotivo].map(([motivo, kg]) => ({ motivo, kg: arredondar(kg, 3) })),
    saldoKg,
    confere: Math.abs(total - saldoKg) < 0.0005,
  };
}

/** Extrato do lote com sinal: a soma das linhas antes de "Saldo" dá o saldo. */
export function linhasDoDestino(destino: DestinoLote): { rotulo: string; kg: number }[] {
  return [
    { rotulo: "Entrada", kg: destino.entradaKg },
    ...(destino.estornoEntradaKg !== 0 ? [{ rotulo: "Estorno da entrada", kg: inverter(destino.estornoEntradaKg) }] : []),
    { rotulo: "Vendido", kg: inverter(destino.vendidoKg) },
    { rotulo: "Consumido em OP", kg: inverter(destino.consumidoOpKg) },
    ...destino.ajustes.map((a) => ({ rotulo: `Ajuste: ${ROTULOS_MOTIVO_AJUSTE[a.motivo]}`, kg: a.kg })),
    { rotulo: "Saldo", kg: destino.saldoKg },
  ];
}
