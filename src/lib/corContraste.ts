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

/** Converte #RRGGBB para HSL (h em graus 0-360, s/l em % 0-100). */
export function hexParaHsl(corHex: string): { h: number; s: number; l: number } {
  const hex = corHex.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / delta) % 6;
  } else if (max === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }
  h *= 60;
  if (h < 0) h += 360;

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Converte HSL (h em graus 0-360, s/l em % 0-100) para #RRGGBB. */
export function hslParaHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let rP = 0;
  let gP = 0;
  let bP = 0;
  if (h < 60) [rP, gP, bP] = [c, x, 0];
  else if (h < 120) [rP, gP, bP] = [x, c, 0];
  else if (h < 180) [rP, gP, bP] = [0, c, x];
  else if (h < 240) [rP, gP, bP] = [0, x, c];
  else if (h < 300) [rP, gP, bP] = [x, 0, c];
  else [rP, gP, bP] = [c, 0, x];

  const paraHex = (valor: number) =>
    Math.round((valor + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${paraHex(rP)}${paraHex(gP)}${paraHex(bP)}`;
}

/**
 * Devolve um tom mais claro (fundo escuro) ou mais escuro (fundo claro) da MESMA cor
 * (mesmo H/S, só desloca L) — usado pra derivar hover/item-ativo a partir da cor da
 * empresa sem cair numa cor genérica do tema pessoal.
 */
export function tomDestaque(corFundoHex: string, intensidade: number): string {
  const { h, s, l } = hexParaHsl(corFundoHex);
  const clarear = corDeTextoContrastante(corFundoHex) === "#ffffff";
  const novoL = clarear ? Math.min(100, l + intensidade) : Math.max(0, l - intensidade);
  return hslParaHex(h, s, novoL);
}
