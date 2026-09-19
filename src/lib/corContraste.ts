/** Devolve preto ou branco — o que for mais legível sobre `corFundoHex`. Fórmula YIQ (percepção de brilho), limiar 128/255. */
export function corDeTextoContrastante(corFundoHex: string): "#000000" | "#ffffff" {
  const hex = corFundoHex.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000000" : "#ffffff";
}

/** Valida o formato #RRGGBB (hex de 6 dígitos, com #). */
export function corHexValida(valor: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(valor);
}
