// src/app/(dashboard)/financeiro/conciliacao/filtro-status.tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LINHA_EXTRATO, SEM_VALOR } from "@/lib/schemas/enums";
import { STATUS_LABEL } from "./status-label";

export function FiltroStatus() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusAtual = searchParams.get("status") ?? SEM_VALOR;

  function aoMudar(valor: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!valor || valor === SEM_VALOR) {
      params.delete("status");
    } else {
      params.set("status", valor);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Select value={statusAtual} onValueChange={aoMudar}>
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_VALOR}>Todos os status</SelectItem>
        {STATUS_LINHA_EXTRATO.map((status) => (
          <SelectItem key={status} value={status}>
            {STATUS_LABEL[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
