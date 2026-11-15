"use client";

import { useSyncExternalStore } from "react";
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

const assinarNada = () => () => {};

const PALETAS = [
  { id: "theme-a", label: "A — Sidebar navy" },
  { id: "theme-b", label: "B — Tons claros" },
  { id: "theme-c", label: "C — Header navy" },
] as const;

/**
 * `livre`: as 3 paletas × claro/escuro. Empresa com tema: `claro-escuro` mostra
 * só Claro/Escuro (o tema da empresa define as cores); `so-claro` esconde o botão.
 */
export function ThemeToggle({ modo = "livre" }: { modo?: "livre" | "claro-escuro" | "so-claro" }) {
  const { theme, setTheme } = useTheme();
  // false no SSR e na hidratação, true depois: o tema salvo só existe no navegador.
  const montado = useSyncExternalStore(
    assinarNada,
    () => true,
    () => false,
  );

  const temaAtivo = montado ? theme : undefined;
  const escuro = temaAtivo?.endsWith("-dark") ?? false;
  // Com tema da empresa a paleta pessoal não aparece: claro/escuro usa a variação A.
  const paletaAtiva = modo !== "livre" ? "theme-a" : temaAtivo ? temaAtivo.replace("-dark", "") : "theme-a";

  if (modo === "so-claro") return null;

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
        {modo === "livre" ? (
          <>
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
          </>
        ) : null}
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
