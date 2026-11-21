import type { StatusEntrega } from "@prisma/client";

/**
 * O exemplo de Entregas: as entregas dos pedidos de novembro da história (os mesmos da ajuda de Pedidos). O 128 foi
 * entregue à Ana no dia previsto; o 127 foi cancelado; o 131, da Sorveteria Polar, previsto para 22/11, sai com o
 * João nesse dia, mas a sorveteria está fechada e a entrega só é feita em 23/11, ao Rui. Fictício e fixo. A cena
 * calcula o atraso com `atrasoEntregaDias`; o teste confere os números citados.
 */

export const DIA_DA_SAIDA = "22/11/2026";
export const HOJE = "23/11/2026";
export const MOTORISTA = "João";
export const RECEBEDOR = "Rui";
export const OBSERVACAO = "Ligar para o Rui ao chegar";

export type EntregaExemplo = {
  pedido: number;
  cliente: string;
  endereco: string;
  /** DD/MM/AAAA. */
  prevista: string;
  status: StatusEntrega;
  responsavel: string | null;
  entregueEm: string | null;
  recebidoPor: string | null;
};

/** Na ordem da lista: data prevista e número do pedido. O 131 muda conforme o roteiro (ver a cena). */
export const ENTREGAS: readonly EntregaExemplo[] = [
  {
    pedido: 127,
    cliente: "Açaí da Vila",
    endereco: "Rua das Palmeiras, 45 · Belém",
    prevista: "21/11/2026",
    status: "CANCELADA",
    responsavel: null,
    entregueEm: null,
    recebidoPor: null,
  },
  {
    pedido: 128,
    cliente: "Açaí da Vila",
    endereco: "Rua das Palmeiras, 45 · Belém",
    prevista: "21/11/2026",
    status: "ENTREGUE",
    responsavel: MOTORISTA,
    entregueEm: "21/11/2026",
    recebidoPor: "Ana",
  },
  {
    pedido: 131,
    cliente: "Sorveteria Polar",
    endereco: "Av. Nazaré, 900 · Belém",
    prevista: "22/11/2026",
    status: "EM_ROTA",
    responsavel: MOTORISTA,
    entregueEm: null,
    recebidoPor: null,
  },
];
