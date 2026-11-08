"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Estado do menu lateral no celular (gaveta). O botão fica no cabeçalho e a
 * gaveta na sidebar — os dois leem o mesmo "aberto" daqui. No desktop
 * (md e acima) a sidebar é fixa e este estado não é usado.
 */
type MenuLateral = { aberto: boolean; setAberto: (aberto: boolean) => void };

const MenuLateralContext = createContext<MenuLateral | null>(null);

export function MenuLateralProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return <MenuLateralContext.Provider value={{ aberto, setAberto }}>{children}</MenuLateralContext.Provider>;
}

export function useMenuLateral(): MenuLateral {
  const contexto = useContext(MenuLateralContext);
  if (!contexto) throw new Error("useMenuLateral precisa estar dentro de MenuLateralProvider");
  return contexto;
}

export function BotaoMenuLateral({ className }: { className?: string }) {
  const { aberto, setAberto } = useMenuLateral();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label="Abrir menu"
      aria-expanded={aberto}
      aria-controls="menu-lateral-movel"
      onClick={() => setAberto(true)}
    >
      <Menu />
    </Button>
  );
}
