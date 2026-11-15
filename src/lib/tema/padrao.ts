import type { Tema } from "./schema";

/**
 * Padrão do sistema (globals.css, `.theme-a` e `.theme-a-dark`) no formato `nx-tema`, ponto de partida do
 * editor. oklch acromático convertido: oklch(1 0 0) = #ffffff, oklch(0.145 0 0) = #0a0a0a,
 * oklch(0.97 0 0) = #f5f5f5. Borda, texto apagado e erro com oklch saturado ou transparência ficam de fora
 * (no editor: "Automático", que é o padrão do sistema).
 */
export const TEMA_PADRAO: Tema = {
  formato: "nx-tema",
  versao: 1,
  nome: "Padrão do sistema",
  cores: {
    claro: {
      fundo: "#ffffff",
      texto: "#0a0a0a",
      primaria: "#0b2545",
      textoSobrePrimaria: "#ffffff",
      sidebar: "#0b2545",
      textoSobreSidebar: "#ffffff",
      cartao: "#ffffff",
      apoio: "#f5f5f5",
      textoSobreApoio: "#0b2545",
      destaque: "#f5f5f5",
      textoSobreDestaque: "#0b2545",
      foco: "#6fa8dc",
      cabecalho: "#ffffff",
      textoCabecalho: "#0a0a0a",
      graficos: ["#bfd9ef", "#8fbee0", "#6fa8dc", "#3d5a78", "#0b2545"],
    },
    escuro: {
      fundo: "#10151d",
      texto: "#f2f5f8",
      primaria: "#6fa8dc",
      textoSobrePrimaria: "#0b2545",
      sidebar: "#060f1d",
      textoSobreSidebar: "#f2f5f8",
      cartao: "#161d27",
      apoio: "#1e2733",
      textoSobreApoio: "#f2f5f8",
      textoApagado: "#93a3b8",
      destaque: "#1e2733",
      textoSobreDestaque: "#f2f5f8",
      foco: "#6fa8dc",
      cabecalho: "#161d27",
      textoCabecalho: "#f2f5f8",
      graficos: ["#6fa8dc", "#8fbee0", "#bfd9ef", "#3d5a78", "#1b3a5c"],
    },
  },
};
