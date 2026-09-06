"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Granularidade } from "@/server/services/fluxoDeCaixa";

const GRANULARIDADES: Granularidade[] = ["DIA", "SEMANA", "MES", "ANO"];
const LABEL: Record<Granularidade, string> = { DIA: "Dia", SEMANA: "Semana", MES: "Mês", ANO: "Ano" };

export function deslocarData(data: Date, granularidade: Granularidade, direcao: 1 | -1): Date {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth();
  if (granularidade === "MES") {
    return new Date(Date.UTC(ano + direcao, 0, 1));
  }
  if (granularidade === "ANO") {
    return new Date(Date.UTC(ano + direcao * 5, 0, 1));
  }
  return new Date(Date.UTC(ano, mes + direcao, 1));
}

export function SeletorPeriodo({
  granularidade,
  dataReferencia,
}: {
  granularidade: Granularidade;
  dataReferencia: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function atualizar(novaGranularidade: Granularidade, novaData: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("granularidade", novaGranularidade);
    params.set("data", novaData);
    router.push(`${pathname}?${params.toString()}`);
  }

  function navegar(direcao: 1 | -1) {
    const nova = deslocarData(new Date(dataReferencia), granularidade, direcao);
    atualizar(granularidade, nova.toISOString().slice(0, 10));
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={granularidade} onValueChange={(valor) => valor && atualizar(valor as Granularidade, dataReferencia)}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GRANULARIDADES.map((g) => (
            <SelectItem key={g} value={g}>
              {LABEL[g]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" size="sm" onClick={() => navegar(-1)}>
        Anterior
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => navegar(1)}>
        Próximo
      </Button>
    </div>
  );
}
