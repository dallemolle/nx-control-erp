"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function deslocarAno(ano: number, direcao: 1 | -1): number {
  return ano + direcao;
}

export function SeletorAnoMes({ ano, mes }: { ano: number; mes: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function atualizar(novoAno: number, novoMes: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ano", String(novoAno));
    params.set("mes", String(novoMes));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => atualizar(deslocarAno(ano, -1), mes)}>
        Ano anterior
      </Button>
      <span className="text-sm font-medium">{ano}</span>
      <Button type="button" variant="outline" size="sm" onClick={() => atualizar(deslocarAno(ano, 1), mes)}>
        Próximo ano
      </Button>
      <Select value={String(mes)} onValueChange={(valor) => valor && atualizar(ano, Number(valor))}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MESES.map((nome, indice) => (
            <SelectItem key={nome} value={String(indice + 1)}>
              {nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
