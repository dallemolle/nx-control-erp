import { formatarMoeda } from "@/lib/formatacao";
import { valorNoSentidoDaCategoria } from "./sentidoDaCategoria";

/**
 * Ano-base do Fluxo de caixa estratégico, por categoria (item 63 do backlog): receita = entradas − saídas nas
 * categorias de receita operacionais; custo = saídas − entradas nas de despesa operacionais. Categoria não
 * operacional (empréstimo, aporte, amortização) e lançamento sem categoria ficam fora e voltam à parte.
 * Pura (sem banco): o serviço resolve a categoria de cada lançamento antes.
 */
export type CategoriaDoAnoBase = { tipo: "RECEITA" | "DESPESA"; naoOperacional: boolean };
export type LancamentoDoAnoBase = { tipo: "ENTRADA" | "SAIDA"; valor: number; categoria: CategoriaDoAnoBase | null };
export type EntradasESaidas = { entradas: number; saidas: number };
export type ForaDaBase = { naoOperacional: EntradasESaidas; semCategoria: EntradasESaidas };
export type SomaDoAnoBase = { receitaBase: number; custoBase: number; foraDaBase: ForaDaBase };

const emCentavos = (valor: number) => Math.round(valor * 100);
const emReais = (centavos: number) => centavos / 100;

export function somarAnoBase(lancamentos: readonly LancamentoDoAnoBase[]): SomaDoAnoBase {
  let receita = 0;
  let custo = 0;
  const fora = { naoOperacional: { entradas: 0, saidas: 0 }, semCategoria: { entradas: 0, saidas: 0 } };

  for (const l of lancamentos) {
    const centavos = emCentavos(l.valor);
    const entrada = l.tipo === "ENTRADA";
    if (!l.categoria || l.categoria.naoOperacional) {
      const grupo = l.categoria ? fora.naoOperacional : fora.semCategoria;
      if (entrada) grupo.entradas += centavos;
      else grupo.saidas += centavos;
    } else if (l.categoria.tipo === "RECEITA") {
      receita += valorNoSentidoDaCategoria("RECEITA", l.tipo, centavos);
    } else {
      custo += valorNoSentidoDaCategoria("DESPESA", l.tipo, centavos);
    }
  }

  return {
    receitaBase: emReais(receita),
    custoBase: emReais(custo),
    foraDaBase: {
      naoOperacional: { entradas: emReais(fora.naoOperacional.entradas), saidas: emReais(fora.naoOperacional.saidas) },
      semCategoria: { entradas: emReais(fora.semCategoria.entradas), saidas: emReais(fora.semCategoria.saidas) },
    },
  };
}

function partes({ entradas, saidas }: EntradasESaidas): string | null {
  const itens = [
    entradas !== 0 ? `${formatarMoeda(entradas)} de entradas` : null,
    saidas !== 0 ? `${formatarMoeda(saidas)} de saídas` : null,
  ].filter((item): item is string => item !== null);
  return itens.length > 0 ? itens.join(" e ") : null;
}

/** O aviso da tela; `null` quando nada ficou fora. */
export function textoForaDaBase(fora: ForaDaBase): string | null {
  const naoOperacional = partes(fora.naoOperacional);
  const semCategoria = partes(fora.semCategoria);
  const frases = [
    naoOperacional ? `${naoOperacional} em categorias não operacionais` : null,
    semCategoria ? `${semCategoria} sem categoria` : null,
  ].filter((frase): frase is string => frase !== null);
  return frases.length > 0 ? `Ficaram fora do ano-base: ${frases.join("; ")}.` : null;
}
