/**
 * Se o clique num link troca a tela atual por outra dentro do sistema (navegação do Next,
 * que não dispara `beforeunload`). Nova aba, download, botão do meio, Ctrl/Shift/Alt e a
 * mesma URL (com ou sem âncora) não contam; link para outro site fica com o `beforeunload`.
 */
export function cliqueQueSaiDaTela(
  clique: { href: string | null; target: string | null; download: boolean; botao: number; modificador: boolean },
  urlAtual: string,
): boolean {
  if (clique.href === null || clique.download || clique.botao !== 0 || clique.modificador) return false;
  if (clique.target && clique.target !== "_self") return false;
  const atual = new URL(urlAtual);
  const destino = new URL(clique.href, atual);
  if (destino.origin !== atual.origin) return false;
  return destino.pathname !== atual.pathname || destino.search !== atual.search;
}
