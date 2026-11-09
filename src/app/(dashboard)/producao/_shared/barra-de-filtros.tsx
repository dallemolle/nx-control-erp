"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEM_VALOR } from "@/lib/schemas/enums";
import { construirUrlComFiltro } from "../../auditoria/barra-de-filtros";

export type CampoFiltro =
  | { tipo: "data"; campo: string; rotulo: string }
  | { tipo: "select"; campo: string; rotulo: string; rotuloTodos: string; opcoes: { valor: string; rotulo: string }[] }
  | { tipo: "checkbox"; campo: string; rotulo: string };

/**
 * Filtros das telas de produção, gravados na URL. `valores` traz o valor em
 * vigor de cada campo (inclusive padrões calculados no servidor, como o
 * período do mês atual).
 */
export function BarraDeFiltros({ campos, valores }: { campos: CampoFiltro[]; valores: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function ir(campo: string, valor: string) {
    router.push(construirUrlComFiltro(searchParams, pathname, campo, valor));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {campos.map((filtro) => {
        if (filtro.tipo === "data") {
          return (
            <label key={filtro.campo} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{filtro.rotulo}</span>
              <Input
                type="date"
                className="w-40"
                value={valores[filtro.campo] ?? ""}
                onChange={(evento) => ir(filtro.campo, evento.target.value)}
              />
            </label>
          );
        }
        if (filtro.tipo === "checkbox") {
          return (
            <label key={filtro.campo} className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={valores[filtro.campo] === "1"}
                onChange={(evento) => ir(filtro.campo, evento.target.checked ? "1" : "")}
              />
              {filtro.rotulo}
            </label>
          );
        }
        return (
          <div key={filtro.campo} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{filtro.rotulo}</span>
            <Select
              value={valores[filtro.campo] || SEM_VALOR}
              onValueChange={(valor) => valor !== null && ir(filtro.campo, valor)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>{filtro.rotuloTodos}</SelectItem>
                {filtro.opcoes.map((opcao) => (
                  <SelectItem key={opcao.valor} value={opcao.valor}>
                    {opcao.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
      <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
        Limpar filtros
      </Button>
    </div>
  );
}
