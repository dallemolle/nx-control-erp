export type DestinoAjuda = { tela: string; roteiro?: string };

const PREFIXO = "#ajuda/";
const SEGMENTO = /^[a-z0-9-]+$/;

/**
 * Lê um link do manual no formato `#ajuda/<tela>` ou `#ajuda/<tela>/<roteiro>`.
 * Usa âncora porque o react-markdown limpa URLs com protocolo desconhecido.
 */
export function lerLinkAjuda(href: string | undefined): DestinoAjuda | null {
  if (!href?.startsWith(PREFIXO)) return null;
  const partes = href.slice(PREFIXO.length).split("/");
  if (partes.length > 2 || !partes.every((parte) => SEGMENTO.test(parte))) return null;
  const [tela, roteiro] = partes;
  return roteiro ? { tela, roteiro } : { tela };
}
