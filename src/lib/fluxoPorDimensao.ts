import { montarArvore } from "@/lib/arvoreDeLinhas";

/** As quatro colunas de valor de uma linha do Fluxo de caixa por dimensão. */
export type ValoresDoFluxo = {
  entradasRealizadas: number;
  saidasRealizadas: number;
  entradasProjetadas: number;
  saidasProjetadas: number;
};

export type TotalDoFluxo = ValoresDoFluxo & { resultado: number };

const centavos = (valor: number) => Math.round(valor * 100);

/** Resultado do mês: entradas − saídas, realizado e projetado. Não é saldo bancário da área. */
export function resultadoDoMes(l: ValoresDoFluxo): number {
  return (
    (centavos(l.entradasRealizadas) +
      centavos(l.entradasProjetadas) -
      centavos(l.saidasRealizadas) -
      centavos(l.saidasProjetadas)) /
    100
  );
}

/** A linha Total da tela e da exportação (somada em centavos, sem resíduo de ponto flutuante). */
export function totalDoFluxo(linhas: readonly ValoresDoFluxo[]): TotalDoFluxo {
  const somar = (coluna: keyof ValoresDoFluxo) => linhas.reduce((soma, l) => soma + centavos(l[coluna]), 0) / 100;
  const total = {
    entradasRealizadas: somar("entradasRealizadas"),
    saidasRealizadas: somar("saidasRealizadas"),
    entradasProjetadas: somar("entradasProjetadas"),
    saidasProjetadas: somar("saidasProjetadas"),
  };
  return { ...total, resultado: resultadoDoMes(total) };
}

/** As linhas do fluxo em árvore (tela e exportação). Só o Centro de custo tem pai; nas outras dimensões tudo é nível 1. */
export function fluxoEmArvore<
  L extends ValoresDoFluxo & { dimensaoId: string | null; dimensaoNome: string; parentId: string | null },
>(linhas: readonly L[]) {
  return montarArvore(
    linhas.map((linha) => ({
      ...linha,
      id: linha.dimensaoId ?? "nao-classificado",
      grupo: "dimensao",
      nome: linha.dimensaoNome,
    })),
    (linha): ValoresDoFluxo => ({
      entradasRealizadas: linha.entradasRealizadas,
      saidasRealizadas: linha.saidasRealizadas,
      entradasProjetadas: linha.entradasProjetadas,
      saidasProjetadas: linha.saidasProjetadas,
    }),
  );
}
