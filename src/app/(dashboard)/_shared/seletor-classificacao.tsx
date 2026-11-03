"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEM_VALOR } from "@/lib/schemas/enums";

const OPCOES = [
  { valor: SEM_VALOR, rotulo: "Todos" },
  { valor: "FISCAL", rotulo: "Fiscal" },
  { valor: "GERENCIAL", rotulo: "Gerencial" },
] as const;

/**
 * Query string com `classificacao` trocado, preservando os demais parâmetros.
 * "Todos" (sentinela ou vazio) remove o parâmetro — a URL fica igual à de antes do filtro existir.
 */
export function queryComClassificacao(atual: string, valor: string | null): string {
  const params = new URLSearchParams(atual);
  if (valor === "FISCAL" || valor === "GERENCIAL") params.set("classificacao", valor);
  else params.delete("classificacao");
  return params.toString();
}

export function SeletorClassificacao({ classificacao }: { classificacao?: "FISCAL" | "GERENCIAL" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function aoMudar(valor: string | null) {
    const query = queryComClassificacao(searchParams.toString(), valor);
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Select value={classificacao ?? SEM_VALOR} onValueChange={aoMudar}>
      <SelectTrigger className="w-40" aria-label="Classificação">
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
