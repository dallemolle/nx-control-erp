/**
 * Monta a árvore de um relatório a partir de linhas planas com `parentId` (categorias no Orçamento, centros de
 * custo no Fluxo por dimensão). O pai mostra o próprio valor mais o dos descendentes; quando tem valor próprio,
 * ganha uma primeira filha "Direto em <pai>" para a soma das filhas fechar com ele. Pai fora da lista, de outro
 * grupo (ex.: Receita dentro de Despesa) ou fechando um ciclo: a linha vira topo. A ordem entre irmãos é a de
 * entrada.
 */
export type LinhaDaArvore = { id: string; parentId: string | null; grupo: string; nome: string };

export type ItemDaArvore<L, V> = {
  chave: string;
  origem: L;
  nome: string;
  nivel: number;
  paiChave: string | null;
  temFilhos: boolean;
  direto: boolean;
  valores: V;
};

const centavos = (valor: number) => Math.round(valor * 100);

export function montarArvore<L extends LinhaDaArvore, V extends Record<string, number>>(
  linhas: readonly L[],
  valoresDe: (linha: L) => V,
): ItemDaArvore<L, V>[] {
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));
  const paiEfetivo = (linha: L) => {
    const pai = linha.parentId ? porId.get(linha.parentId) : undefined;
    return pai && pai.grupo === linha.grupo && pai.id !== linha.id ? pai.id : null;
  };
  const filhos = new Map<string, L[]>();
  for (const linha of linhas) {
    const pai = paiEfetivo(linha);
    if (pai) filhos.set(pai, [...(filhos.get(pai) ?? []), linha]);
  }

  const visitados = new Set<string>();
  const saida: ItemDaArvore<L, V>[] = [];

  /** Empilha a linha e os descendentes; devolve o total em centavos de cada coluna. */
  function visitar(linha: L, nivel: number, paiChave: string | null): Record<string, number> {
    visitados.add(linha.id);
    const proprio = valoresDe(linha);
    const total: Record<string, number> = {};
    for (const [coluna, valor] of Object.entries(proprio)) total[coluna] = centavos(valor);

    const item: ItemDaArvore<L, V> = {
      chave: linha.id,
      origem: linha,
      nome: linha.nome,
      nivel,
      paiChave,
      temFilhos: false,
      direto: false,
      valores: proprio,
    };
    saida.push(item);

    const meusFilhos = (filhos.get(linha.id) ?? []).filter((filho) => !visitados.has(filho.id));
    if (meusFilhos.length === 0) return total;

    item.temFilhos = true;
    if (Object.values(proprio).some((valor) => centavos(valor) !== 0)) {
      saida.push({
        chave: `${linha.id}:direto`,
        origem: linha,
        nome: `Direto em ${linha.nome}`,
        nivel: nivel + 1,
        paiChave: linha.id,
        temFilhos: false,
        direto: true,
        valores: proprio,
      });
    }
    for (const filho of meusFilhos) {
      if (visitados.has(filho.id)) continue;
      const doFilho = visitar(filho, nivel + 1, linha.id);
      for (const [coluna, valor] of Object.entries(doFilho)) total[coluna] = (total[coluna] ?? 0) + valor;
    }
    const emReais: Record<string, number> = {};
    for (const [coluna, valor] of Object.entries(total)) emReais[coluna] = valor / 100;
    item.valores = emReais as V;
    return total;
  }

  for (const linha of linhas) {
    if (paiEfetivo(linha) === null && !visitados.has(linha.id)) visitar(linha, 1, null);
  }
  // Sobra só quem está num ciclo (o cadastro impede, mas o relatório não pode travar nem perder valor).
  for (const linha of linhas) {
    if (!visitados.has(linha.id)) visitar(linha, 1, null);
  }
  return saida;
}
