"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TipoDimensao } from "@/server/services/fluxoDeCaixaPorDimensao";

const OPCOES: { valor: TipoDimensao; rotulo: string }[] = [
  { valor: "CENTRO_CUSTO", rotulo: "Centro de custo" },
  { valor: "CENTRO_LUCRO", rotulo: "Centro de lucro" },
  { valor: "SAFRA", rotulo: "Safra" },
];

export function SeletorDimensao({ dimensao, ano, mes }: { dimensao: TipoDimensao; ano: number; mes: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function atualizar(novaDimensao: TipoDimensao) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("dimensao", novaDimensao);
    params.set("ano", String(ano));
    params.set("mes", String(mes));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={dimensao} onValueChange={(valor) => valor && atualizar(valor as TipoDimensao)}>
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPCOES.map((opcao) => (
          <SelectItem key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
