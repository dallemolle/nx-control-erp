import type { CSSProperties } from "react";

/** Recuo do nome por nível da árvore (o nível 1 não recua). */
export function recuoDoNivel(nivel: number): CSSProperties {
  return { paddingLeft: `${(nivel - 1) * 1.25}rem` };
}
