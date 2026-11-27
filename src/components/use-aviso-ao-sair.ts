"use client";

import { useEffect } from "react";
import { cliqueQueSaiDaTela } from "@/lib/cliqueQueSaiDaTela";

/**
 * Enquanto `sujo`, pede confirmação antes de perder o que foi digitado: ao fechar ou
 * recarregar a aba do navegador (`beforeunload`) e ao clicar num link do sistema que
 * troca de tela ou de aba (o `beforeunload` não vê a navegação do Next). O voltar do
 * navegador não é coberto.
 */
export function useAvisoAoSair(sujo: boolean, mensagem: string) {
  useEffect(() => {
    if (!sujo) return;
    const aoDescarregar = (evento: BeforeUnloadEvent) => evento.preventDefault();
    const aoClicar = (evento: MouseEvent) => {
      const link = evento.target instanceof Element ? evento.target.closest("a") : null;
      if (!link || evento.defaultPrevented) return;
      const sai = cliqueQueSaiDaTela(
        {
          href: link.getAttribute("href"),
          target: link.getAttribute("target"),
          download: link.hasAttribute("download"),
          botao: evento.button,
          modificador: evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey,
        },
        window.location.href,
      );
      if (sai && !window.confirm(mensagem)) {
        evento.preventDefault();
        evento.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", aoDescarregar);
    // Captura: roda antes do onClick do <Link>, que faria a navegação.
    document.addEventListener("click", aoClicar, true);
    return () => {
      window.removeEventListener("beforeunload", aoDescarregar);
      document.removeEventListener("click", aoClicar, true);
    };
  }, [sujo, mensagem]);
}
