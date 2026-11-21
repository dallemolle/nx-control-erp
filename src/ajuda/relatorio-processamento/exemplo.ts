import type { StatusOrdemProducao } from "@prisma/client";

/**
 * O exemplo do Relatório de processamento: novembro de 2026, com as três OPs da história (as mesmas do Painel e do
 * Processamento). A OP-261120-01 tem os números da ajuda do Processamento; as dos dias 18 e 19 ganharam água, caroço
 * e perda coerentes (a de acerola fica com o balanço "Verificar"). Fictício e fixo. A cena monta as tabelas com
 * `agregarProcessamento`; o teste confere os números citados e que o resumo bate com o Painel.
 */

export const PERIODO = { inicio: "01/11/2026", fim: "30/11/2026" } as const;

export const FRUTAS = [
  { id: "acai", nome: "Açaí" },
  { id: "acerola", nome: "Acerola" },
] as const;

export const OPS: readonly {
  numero: string;
  frutaId: string;
  status: StatusOrdemProducao;
  frutoKg: number;
  polpaKg: number;
  aguaLitros: number;
  carocoResiduoKg: number;
  perdaKg: number;
  custoFrutoTotal: number;
  custoInsumosTotal: number;
  balancoVerificar: boolean;
  branqueamentoVerificar: boolean;
}[] = [
  {
    numero: "OP-261118-01",
    frutaId: "acai",
    status: "ENCERRADA",
    frutoKg: 546,
    polpaKg: 500,
    aguaLitros: 200,
    carocoResiduoKg: 230,
    perdaKg: 10,
    custoFrutoTotal: 2730,
    custoInsumosTotal: 320,
    balancoVerificar: false,
    branqueamentoVerificar: false,
  },
  {
    numero: "OP-261119-01",
    frutaId: "acerola",
    status: "ENCERRADA",
    frutoKg: 250,
    polpaKg: 190,
    aguaLitros: 0,
    carocoResiduoKg: 30,
    perdaKg: 5,
    custoFrutoTotal: 875,
    custoInsumosTotal: 113,
    balancoVerificar: true,
    branqueamentoVerificar: false,
  },
  {
    numero: "OP-261120-01",
    frutaId: "acai",
    status: "ENCERRADA",
    frutoKg: 1078,
    polpaKg: 1000,
    aguaLitros: 400,
    carocoResiduoKg: 450,
    perdaKg: 20,
    custoFrutoTotal: 4984,
    custoInsumosTotal: 778,
    balancoVerificar: false,
    branqueamentoVerificar: false,
  },
];

/** Números citados nos roteiros, como a tela formata (o teste confere com as funções do sistema). */
export const CITADOS = {
  fruto: "1.874",
  polpa: "1.690",
  rendimento: "90,2%",
  acaiMin: "91,6%",
  acaiMax: "92,8%",
  aceroladiferenca: "10,0%",
  totalDiferenca: "1,6%",
  custoKg: "5,80",
} as const;
