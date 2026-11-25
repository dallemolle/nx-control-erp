import { formatarMoeda } from "@/lib/formatacao";
import { MSG_BAIXA_SEM_ABATIMENTO, valorAbatidoDaBaixa } from "./valorAbatido";

type CamposDaBaixa = { valorPago: string; valorJuros: string; valorMulta: string; valorDesconto: string };
const num = (texto: string) => (texto.trim() === "" ? 0 : Number(texto));
const centavos = (valor: number) => Math.round(valor * 100);

/** Texto abaixo dos campos do diálogo: quanto a baixa tira da parcela e o que sobra. */
export function previaDaBaixa(saldoEmAberto: number, campos: CamposDaBaixa): { texto: string; erro: boolean } | null {
  if (campos.valorPago.trim() === "") return null;
  const valores = {
    valorPago: num(campos.valorPago), valorJuros: num(campos.valorJuros),
    valorMulta: num(campos.valorMulta), valorDesconto: num(campos.valorDesconto),
  };
  if (Object.values(valores).some((n) => Number.isNaN(n))) return null;
  const abatido = valorAbatidoDaBaixa(valores);
  if (abatido <= 0) return { texto: MSG_BAIXA_SEM_ABATIMENTO, erro: true };
  const resto = (centavos(saldoEmAberto) - centavos(abatido)) / 100;
  const depois = resto >= 0 ? `fica ${formatarMoeda(resto)} em aberto` : `${formatarMoeda(-resto)} acima do saldo`;
  return { texto: `Abate ${formatarMoeda(abatido)} da parcela · ${depois}`, erro: false };
}
