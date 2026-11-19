import { MODALIDADE_CARTAO, ROTULOS_MODALIDADE_CARTAO } from "@/lib/schemas/enums";

export type ModalidadeCartaoValor = (typeof MODALIDADE_CARTAO)[number];

export type CondicaoCartao = {
  modalidade: ModalidadeCartaoValor;
  parcelasDe: number;
  parcelasAte: number;
  taxaPercentual: number;
  prazoDias: number;
  antecipado: boolean;
};

export type RepasseCalculado = { numero: number; data: Date; bruto: number; taxa: number; liquido: number };

export const MAX_PARCELAS_CARTAO = 12;
const UM_DIA_MS = 86_400_000;
const centavos = (valor: number) => Math.round(valor * 100);

/** Condição da modalidade cuja faixa contém as parcelas (fora do parcelado, sempre 1). */
export function condicaoParaVenda(
  condicoes: CondicaoCartao[],
  modalidade: ModalidadeCartaoValor,
  parcelas: number,
): CondicaoCartao | null {
  return (
    condicoes.find((c) => c.modalidade === modalidade && parcelas >= c.parcelasDe && parcelas <= c.parcelasAte) ?? null
  );
}

/**
 * RN-35: um repasse (débito, crédito à vista, Pix, parcelado antecipado) ou um
 * por parcela (parcelado sem antecipação), o 1º em data + prazo e os seguintes
 * de 30 em 30 dias. Bruto dividido igual e taxa total arredondada dividida na
 * mesma proporção; as sobras de centavos vão na última.
 */
export function calcularRepasses(
  data: Date,
  valor: number,
  condicao: CondicaoCartao,
  parcelas: number,
): RepasseCalculado[] {
  const quantos = condicao.modalidade === "CREDITO_PARCELADO" && !condicao.antecipado ? parcelas : 1;
  const brutoTotal = centavos(valor);
  const taxaTotal = Math.round((brutoTotal * condicao.taxaPercentual) / 100);
  const parteBruto = Math.floor(brutoTotal / quantos);
  const parteTaxa = brutoTotal === 0 ? 0 : Math.floor((taxaTotal * parteBruto) / brutoTotal);
  return Array.from({ length: quantos }, (_, i) => {
    const ultima = i === quantos - 1;
    const bruto = ultima ? brutoTotal - parteBruto * (quantos - 1) : parteBruto;
    const taxa = ultima ? taxaTotal - parteTaxa * (quantos - 1) : parteTaxa;
    return {
      numero: i + 1,
      data: new Date(data.getTime() + (condicao.prazoDias + 30 * i) * UM_DIA_MS),
      bruto: bruto / 100,
      taxa: taxa / 100,
      liquido: (bruto - taxa) / 100,
    };
  });
}

/** Regras do cadastro de condições; devolve a mensagem do primeiro erro ou `null`. */
export function validarCondicoesCartao(condicoes: CondicaoCartao[]): string | null {
  if (condicoes.length === 0) return "Inclua ao menos uma condição";
  for (const c of condicoes) {
    if (!(c.taxaPercentual >= 0 && c.taxaPercentual < 100)) return "A taxa deve ficar entre 0 e 100%";
    if (!Number.isInteger(c.prazoDias) || c.prazoDias < 0 || c.prazoDias > 365) {
      return "O prazo deve ficar entre 0 e 365 dias";
    }
    if (c.modalidade === "CREDITO_PARCELADO") {
      if (c.parcelasDe < 2 || c.parcelasAte > MAX_PARCELAS_CARTAO || c.parcelasDe > c.parcelasAte) {
        return "A faixa do parcelado vai de 2 a 12 parcelas";
      }
    } else {
      if (c.parcelasDe !== 1 || c.parcelasAte !== 1) return "Só o crédito parcelado tem faixa de parcelas";
      if (c.antecipado) return "Só o crédito parcelado pode ser antecipado";
      if (condicoes.filter((o) => o.modalidade === c.modalidade).length > 1) {
        return `${ROTULOS_MODALIDADE_CARTAO[c.modalidade]} aparece mais de uma vez`;
      }
    }
  }
  const faixas = condicoes
    .filter((c) => c.modalidade === "CREDITO_PARCELADO")
    .sort((a, b) => a.parcelasDe - b.parcelasDe);
  if (faixas.some((f, i) => i > 0 && f.parcelasDe <= faixas[i - 1].parcelasAte)) {
    return "As faixas do parcelado se sobrepõem";
  }
  return null;
}

/** "Crédito 3x — Stone", "Débito", "Pix na maquininha — Cielo". */
export function descricaoPagamentoCartao(
  modalidade: ModalidadeCartaoValor,
  parcelas: number | null,
  operadora?: string,
): string {
  const base = modalidade === "CREDITO_PARCELADO" ? `Crédito ${parcelas}x` : ROTULOS_MODALIDADE_CARTAO[modalidade];
  return operadora ? `${base} — ${operadora}` : base;
}
