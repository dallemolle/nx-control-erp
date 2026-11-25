// Espelhado na ajuda (src/ajuda/_titulos/cenas.tsx): mudou o texto? Ajuste a ajuda junto.
import Link from "next/link";

export function textoDoAvisoRejeitadas(quantidade: number): string {
  return quantidade === 1
    ? "1 baixa rejeitada aguardando novo registro."
    : `${quantidade} baixas rejeitadas aguardando novo registro.`;
}

/** Aviso no topo de Contas a pagar/receber: baixas rejeitadas que ninguém relançou nem dispensou. */
export function AvisoRejeitadas({
  quantidade,
  href,
  filtroAtivo,
  hrefSemFiltro,
}: {
  quantidade: number;
  href: string;
  filtroAtivo: boolean;
  hrefSemFiltro: string;
}) {
  if (quantidade === 0) {
    if (!filtroAtivo) return null;
    return (
      <div role="status" className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
        Nenhuma baixa rejeitada aguardando novo registro.{" "}
        <Link href={hrefSemFiltro} className="font-medium text-primary underline-offset-4 hover:underline">
          Mostrar todos os títulos
        </Link>
      </div>
    );
  }
  return (
    <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <span className="font-medium">{textoDoAvisoRejeitadas(quantidade)}</span>{" "}
      Confira o motivo na parcela e lance de novo, ou dispense se não houver o que relançar.
      {!filtroAtivo && (
        <>
          {" "}
          <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
            Ver
          </Link>
        </>
      )}
    </div>
  );
}
