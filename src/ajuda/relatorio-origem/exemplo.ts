import type { OrigemRecepcao } from "@prisma/client";

/**
 * O exemplo do Relatório de origem: o período é novembro de 2026 e o ano (da data "Até") é 2026. São as mesmas
 * recepções do Relatório mensal, agora com a origem de cada uma: o José da Silva, o Sítio Boa Esperança e a
 * Cooperativa Vale Verde (terceiros) e os talhões 1, 2 e 3 (próprios). Fictício e fixo. A cena monta as tabelas com
 * `agregarPorOrigem`, `produtividadeTalhoes` e `precoTerceirosPorMes`; o teste confere os números citados e que os
 * totais batem com o Painel e o Relatório mensal.
 */

export const ANO = 2026;
export const PERIODO = { inicio: "01/11/2026", fim: "30/11/2026" } as const;
export const MES_DO_PERIODO = 10;

export const FRUTAS = [
  { id: "acai", nome: "Açaí" },
  { id: "acerola", nome: "Acerola" },
] as const;

export const TALHOES = [
  { id: "t1", nome: "Talhão 1 – Terra firme", fruta: "Açaí", areaHa: 2.5, ativo: true },
  { id: "t2", nome: "Talhão 2 – Acerolal", fruta: "Acerola", areaHa: 1.2, ativo: true },
  { id: "t3", nome: "Talhão 3 – Várzea", fruta: "Açaí", areaHa: 4, ativo: true },
] as const;

const dia = (mes: number, d: number) => new Date(Date.UTC(ANO, mes - 1, d));

export type RecepcaoComOrigem = {
  tipo: OrigemRecepcao;
  origemId: string;
  nome: string;
  frutaId: string;
  brutoKg: number;
  descarteKg: number;
  /** Valor pago (só conta nas compras de terceiro). */
  valorTotal: number;
  data: Date;
};

const JOSE = { tipo: "TERCEIRO", origemId: "jose", nome: "José da Silva" } as const;
const SITIO = { tipo: "TERCEIRO", origemId: "sitio", nome: "Sítio Boa Esperança" } as const;
const COOPERATIVA = { tipo: "TERCEIRO", origemId: "cooperativa", nome: "Cooperativa Vale Verde" } as const;
const T1 = { tipo: "PROPRIA", origemId: "t1", nome: "Talhão 1 – Terra firme" } as const;
const T3 = { tipo: "PROPRIA", origemId: "t3", nome: "Talhão 3 – Várzea" } as const;

/** Recepções ativas do ano (as mesmas do Relatório mensal, com a origem). */
export const RECEPCOES: readonly RecepcaoComOrigem[] = [
  // Setembro
  { ...SITIO, frutaId: "acai", brutoKg: 1800, descarteKg: 60, valorTotal: 8352, data: dia(9, 12) },
  { ...T3, frutaId: "acai", brutoKg: 900, descarteKg: 30, valorTotal: 3480, data: dia(9, 15) },
  // Outubro
  { ...JOSE, frutaId: "acai", brutoKg: 1200, descarteKg: 36, valorTotal: 5820, data: dia(10, 8) },
  { ...SITIO, frutaId: "acai", brutoKg: 1200, descarteKg: 36, valorTotal: 5820, data: dia(10, 8) },
  { ...T1, frutaId: "acai", brutoKg: 600, descarteKg: 18, valorTotal: 2328, data: dia(10, 10) },
  { ...T3, frutaId: "acai", brutoKg: 500, descarteKg: 15, valorTotal: 1940, data: dia(10, 10) },
  { ...COOPERATIVA, frutaId: "acerola", brutoKg: 500, descarteKg: 20, valorTotal: 1680, data: dia(10, 20) },
  // Novembro (as recepções da história)
  { ...T1, frutaId: "acai", brutoKg: 35, descarteKg: 0, valorTotal: 140, data: dia(11, 17) },
  { ...COOPERATIVA, frutaId: "acerola", brutoKg: 300, descarteKg: 10, valorTotal: 1015, data: dia(11, 17) },
  { ...JOSE, frutaId: "acai", brutoKg: 560, descarteKg: 14, valorTotal: 2730, data: dia(11, 18) },
  { ...JOSE, frutaId: "acai", brutoKg: 700, descarteKg: 28, valorTotal: 3360, data: dia(11, 20) },
  { ...T3, frutaId: "acai", brutoKg: 420, descarteKg: 14, valorTotal: 1624, data: dia(11, 20) },
];

/** Números citados nos roteiros, como a tela formata (o teste confere com as funções do sistema). */
export const CITADOS = {
  totalKg: "1.949",
  joseKg: "1.218",
  joseCargas: 2,
  produtividadeT3: "0,44",
  precoAcaiAno: "4,93",
} as const;
