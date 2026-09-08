"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ModoJanelaProjetado } from "@/server/services/fluxoDeCaixaProjetado";

const MODOS: ModoJanelaProjetado[] = ["MOVEL", "ANO_CIVIL"];
const LABEL: Record<ModoJanelaProjetado, string> = { MOVEL: "Móvel (12 meses)", ANO_CIVIL: "Ano civil" };

export function deslocarDataProjetado(data: Date, modo: ModoJanelaProjetado, direcao: 1 | -1): Date {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth();
  if (modo === "ANO_CIVIL") {
    return new Date(Date.UTC(ano + direcao, 0, 1));
  }
  return new Date(Date.UTC(ano, mes + direcao, 1));
}

export function SeletorModoProjetado({
  modo,
  dataReferencia,
}: {
  modo: ModoJanelaProjetado;
  dataReferencia: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function atualizar(novoModo: ModoJanelaProjetado, novaData: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("modo", novoModo);
    params.set("data", novaData);
    router.push(`${pathname}?${params.toString()}`);
  }

  function navegar(direcao: 1 | -1) {
    const nova = deslocarDataProjetado(new Date(dataReferencia), modo, direcao);
    atualizar(modo, nova.toISOString().slice(0, 10));
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={modo} onValueChange={(valor) => valor && atualizar(valor as ModoJanelaProjetado, dataReferencia)}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODOS.map((m) => (
            <SelectItem key={m} value={m}>
              {LABEL[m]}
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
