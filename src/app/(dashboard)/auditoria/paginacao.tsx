"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function construirUrlComPagina(searchParamsAtual: URLSearchParams, pathname: string, pagina: number): string {
  const params = new URLSearchParams(searchParamsAtual.toString());
  if (pagina <= 1) {
    params.delete("pagina");
  } else {
    params.set("pagina", String(pagina));
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function Paginacao({ pagina, totalPaginas }: { pagina: number; totalPaginas: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navegar(novaPagina: number) {
    router.push(construirUrlComPagina(searchParams, pathname, novaPagina));
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">
        Página {pagina} de {totalPaginas}
      </span>
      <Button type="button" variant="outline" size="sm" disabled={pagina <= 1} onClick={() => navegar(pagina - 1)}>
        Anterior
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pagina >= totalPaginas}
        onClick={() => navegar(pagina + 1)}
      >
        Próximo
      </Button>
    </div>
  );
}
