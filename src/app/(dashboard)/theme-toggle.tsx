"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PALETAS = [
  { id: "theme-a", label: "A — Sidebar navy" },
  { id: "theme-b", label: "B — Tons claros" },
  { id: "theme-c", label: "C — Header navy" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  const temaAtivo = montado ? theme : undefined;
  const escuro = temaAtivo?.endsWith("-dark") ?? false;
  const paletaAtiva = temaAtivo ? temaAtivo.replace("-dark", "") : "theme-a";

  function selecionarPaleta(paletaId: string) {
    setTheme(escuro ? `${paletaId}-dark` : paletaId);
  }

  function selecionarModo(modo: "claro" | "escuro") {
    setTheme(modo === "escuro" ? `${paletaAtiva}-dark` : paletaAtiva);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Aparência"
            className="text-app-header-foreground hover:bg-app-header-foreground/10 hover:text-app-header-foreground"
          />
        }
      >
        <Palette className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Paleta</DropdownMenuLabel>
          {PALETAS.map((paleta) => (
            <DropdownMenuItem
              key={paleta.id}
              onClick={() => selecionarPaleta(paleta.id)}
            >
              {paleta.label}
              {montado && paletaAtiva === paleta.id && (
                <Check className="ml-auto" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Aparência</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => selecionarModo("claro")}>
            Claro
            {montado && !escuro && <Check className="ml-auto" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => selecionarModo("escuro")}>
            Escuro
            {montado && escuro && <Check className="ml-auto" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
