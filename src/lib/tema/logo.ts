import { corDeTextoContrastante } from "@/lib/corContraste";
import type { Tema } from "./schema";

/**
 * Logo da sidebar: sobre uma sidebar escura (texto claro), o logo para fundo
 * escuro, se houver; senão o logo normal. Sem tema nem cor da empresa, o normal.
 */
export function logoDaSidebar(empresa: {
  tema: Tema | null;
  corPrimaria: string | null;
  logoUrl: string | null;
  logoEscuroUrl: string | null;
}): string | null {
  const corSidebar = empresa.tema?.cores.claro.sidebar ?? empresa.corPrimaria;
  if (corSidebar && corDeTextoContrastante(corSidebar) === "#ffffff") {
    return empresa.logoEscuroUrl ?? empresa.logoUrl;
  }
  return empresa.logoUrl;
}
