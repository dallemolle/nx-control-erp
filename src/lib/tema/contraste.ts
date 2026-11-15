/** Luminância relativa de uma cor `#rrggbb` (WCAG 2.x, sRGB). */
function luminancia(corHex: string): number {
  const canal = (inicio: number) => {
    const c = parseInt(corHex.slice(inicio, inicio + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Razão de contraste WCAG entre duas cores `#rrggbb` (1 a 21), com 2 casas. */
export function contraste(corA: string, corB: string): number {
  const [clara, escura] = [luminancia(corA), luminancia(corB)].sort((a, b) => b - a);
  return Math.round(((clara + 0.05) / (escura + 0.05)) * 100) / 100;
}

export const CONTRASTE_MINIMO = 4.5;
