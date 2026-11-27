import Link from "next/link";
import { textoForaDaBase, type ForaDaBase } from "@/lib/financeiro/anoBaseEstrategico";

/** O que ficou fora do ano-base (categorias não operacionais e lançamentos sem categoria). */
export function AvisoForaDaBase({ foraDaBase }: { foraDaBase: ForaDaBase }) {
  const texto = textoForaDaBase(foraDaBase);
  if (!texto) return null;
  const temSemCategoria = foraDaBase.semCategoria.entradas !== 0 || foraDaBase.semCategoria.saidas !== 0;
  return (
    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="note">
      {texto}
      {temSemCategoria && (
        <>
          {" "}
          Para incluir os lançamentos sem categoria, classifique-os na{" "}
          <Link href="/financeiro/tesouraria" className="underline">
            Tesouraria
          </Link>
          .
        </>
      )}
    </p>
  );
}
