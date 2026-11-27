"use client";

// Espelhado na ajuda (src/ajuda/orcamento/cenas.tsx): mudou campo, botão ou mensagem? Ajuste a ajuda junto.

import { useFormularioDaAcao } from "@/components/use-formulario-da-acao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recuoDoNivel } from "@/lib/recuoDoNivel";
import { MESES_ABREVIADOS, NOMES_DOS_MESES } from "@/lib/meses";
import { valorParaCampo } from "@/lib/valorEmReais";
import { salvarLinhaOrcamentoAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

/** A coluna do nome fica parada ao rolar a grade para o lado (no celular, a grade rola sozinha). */
const COLUNA_DO_NOME = "sticky left-0 z-10 w-40 shrink-0 bg-background";

/** Título do bloco (Despesas, Receitas) e os meses alinhados aos campos. */
export function CabecalhoDaGrade({ titulo }: { titulo: string }) {
  return (
    <div className="flex items-end gap-2 border-b pt-4 pb-1 text-xs text-muted-foreground">
      <span className={`${COLUNA_DO_NOME} text-sm font-semibold text-foreground`}>{titulo}</span>
      {MESES_ABREVIADOS.map((mes) => (
        <span key={mes} className="w-24 px-1">
          {mes}
        </span>
      ))}
    </div>
  );
}

export function LinhaOrcamentoForm({
  categoriaFinanceiraId,
  categoriaNome,
  ano,
  valoresPorMes,
  somenteLeitura,
  nivel = 1,
}: {
  nivel?: number;
  categoriaFinanceiraId: string;
  categoriaNome: string;
  ano: number;
  valoresPorMes: number[]; // índice 0 = mês 1 (janeiro) .. índice 11 = mês 12
  somenteLeitura: boolean;
}) {
  const [state, formAction, pendente] = useFormularioDaAcao(salvarLinhaOrcamentoAction, ESTADO_INICIAL);

  return (
    <form onSubmit={formAction} className="flex items-center gap-2 border-b py-2">
      <input type="hidden" name="categoriaFinanceiraId" value={categoriaFinanceiraId} />
      <input type="hidden" name="ano" value={ano} />
      <span
        className={`${COLUNA_DO_NOME} truncate text-sm font-medium`}
        style={recuoDoNivel(nivel)}
        title={categoriaNome}
      >
        {categoriaNome}
      </span>
      {valoresPorMes.map((valor, indice) => (
        <Input
          // Com o valor na key, o campo é recriado quando o salvo volta do servidor e mostra o valor normalizado
          // ("1.500" → "1.500,00"); só trocar o defaultValue de um campo não controlado não muda nada na tela.
          key={`${indice}-${valor}`}
          name={`mes-${indice + 1}`}
          type="text"
          inputMode="decimal"
          aria-label={`${categoriaNome}, ${NOMES_DOS_MESES[indice]}`}
          defaultValue={valorParaCampo(valor)}
          disabled={somenteLeitura}
          className="w-24 text-right"
        />
      ))}
      {!somenteLeitura && (
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar"}
        </Button>
      )}
      {state.erro ? <span className="text-xs text-destructive">{state.erro}</span> : null}
      {state.sucesso && !pendente ? (
        <span className="text-xs text-muted-foreground" role="status">
          Salvo
        </span>
      ) : null}
    </form>
  );
}
