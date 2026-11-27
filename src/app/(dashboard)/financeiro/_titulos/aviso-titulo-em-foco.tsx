// Espelhado na ajuda (src/ajuda/fiscal-gerencial/roteiros.ts, passo "Clique no documento"): mudou o texto? Ajuste lá.
import Link from "next/link";

/**
 * Faixa da lista aberta num título só (link das Pendências fiscais, `?titulo=<id>`). "Ver todos" volta à lista
 * sem nenhum filtro, para o título não ficar preso na tela.
 */
export function AvisoTituloEmFoco({ documento, hrefTodos }: { documento: string | null; hrefTodos: string }) {
  return (
    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="note">
      {documento ? (
        <>
          Mostrando só o título <span className="font-medium text-foreground">{documento}</span>.{" "}
        </>
      ) : (
        <>Título não encontrado nesta filial. </>
      )}
      <Link href={hrefTodos} className="font-medium text-primary underline-offset-4 hover:underline">
        Ver todos
      </Link>
    </p>
  );
}
