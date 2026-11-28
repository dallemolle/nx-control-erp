// src/app/(dashboard)/financeiro/conciliacao/conciliar-grupo-dialog.tsx
"use client";
// Espelhado na ajuda (src/ajuda/conciliacao/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { diferencaDoGrupo, somaEmCentavos } from "@/lib/conciliacaoGrupo";
import { formatarMoeda } from "@/lib/formatacao";
import {
  buscarCandidatosParaGrupoAction,
  conciliarEmGrupoAction,
  type CandidatosDoGrupo,
  type FormState,
  type ItemDoGrupo,
} from "./actions";
import { CamposLancamentoAvulso } from "./campos-lancamento-avulso";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

type Opcao = { id: string; nome: string };

function valorComSinal(centavos: number): string {
  const sinal = centavos > 0 ? "+ " : centavos < 0 ? "− " : "";
  return `${sinal}${formatarMoeda(Math.abs(centavos) / 100)}`;
}

function ItemMarcavel({
  item,
  marcado,
  fixo = false,
  onTrocar,
}: {
  item: ItemDoGrupo;
  marcado: boolean;
  fixo?: boolean;
  onTrocar?: () => void;
}) {
  return (
    <label className="flex items-center gap-3 py-1 text-sm">
      <Checkbox checked={marcado} disabled={fixo} onCheckedChange={() => onTrocar?.()} />
      <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{item.data}</span>
      <span className="min-w-0 flex-1 truncate">{item.descricao}</span>
      <span className="shrink-0 tabular-nums">
        {valorComSinal(somaEmCentavos([{ valor: item.valor, tipo: item.tipo }]))}
      </span>
    </label>
  );
}

function trocar(conjunto: Set<string>, id: string): Set<string> {
  const novo = new Set(conjunto);
  if (novo.has(id)) novo.delete(id);
  else novo.add(id);
  return novo;
}

export function ConciliarGrupoDialog({
  linhaExtratoId,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
}: {
  linhaExtratoId: string;
  categorias: Opcao[];
  centrosCusto: Opcao[];
  centrosLucro: Opcao[];
  safras: Opcao[];
  projetos: Opcao[];
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(conciliarEmGrupoAction, ESTADO_INICIAL);
  const [candidatos, setCandidatos] = useState<CandidatosDoGrupo | null>(null);
  const [erroCarga, setErroCarga] = useState<string>();
  const [linhasMarcadas, setLinhasMarcadas] = useState<Set<string>>(new Set());
  const [lancamentosMarcados, setLancamentosMarcados] = useState<Set<string>>(new Set());
  const [lancarDiferenca, setLancarDiferenca] = useState(false);

  function mudarAberto(novo: boolean) {
    setAberto(novo);
    if (!novo) return;
    setCandidatos(null);
    setErroCarga(undefined);
    setLinhasMarcadas(new Set());
    setLancamentosMarcados(new Set());
    setLancarDiferenca(false);
    buscarCandidatosParaGrupoAction(linhaExtratoId)
      .then((resultado) => {
        if (resultado.erro) setErroCarga(resultado.erro);
        else setCandidatos(resultado.candidatos ?? null);
      })
      .catch(() => setErroCarga("Não foi possível carregar os itens"));
  }

  const linhasDoGrupo = candidatos
    ? [candidatos.linhaPartida, ...candidatos.linhas.filter((l) => linhasMarcadas.has(l.id))]
    : [];
  const lancamentosDoGrupo = candidatos ? candidatos.lancamentos.filter((l) => lancamentosMarcados.has(l.id)) : [];
  const diferenca = diferencaDoGrupo(linhasDoGrupo, lancamentosDoGrupo);
  const lancandoDiferenca = lancarDiferenca && diferenca !== 0;
  const podeConciliar =
    candidatos !== null &&
    (diferenca === 0 || lancandoDiferenca) &&
    (lancamentosDoGrupo.length > 0 || lancandoDiferenca);

  return (
    <Dialog open={aberto} onOpenChange={mudarAberto}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>Conciliar em grupo</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conciliar em grupo</DialogTitle>
        </DialogHeader>
        {erroCarga ? <p className="text-sm text-destructive">{erroCarga}</p> : null}
        {!candidatos && !erroCarga ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
        {candidatos ? (
          <form onSubmit={formAction} className="space-y-4">
            {linhasDoGrupo.map((l) => (
              <input key={l.id} type="hidden" name="linhaIds" value={l.id} />
            ))}
            {lancamentosDoGrupo.map((l) => (
              <input key={l.id} type="hidden" name="lancamentoIds" value={l.id} />
            ))}
            {lancandoDiferenca ? <input type="hidden" name="lancarDiferenca" value="on" /> : null}

            <section className="space-y-1">
              <h3 className="text-sm font-medium">Linhas do extrato</h3>
              <ItemMarcavel item={candidatos.linhaPartida} marcado fixo />
              {candidatos.linhas.map((linha) => (
                <ItemMarcavel
                  key={linha.id}
                  item={linha}
                  marcado={linhasMarcadas.has(linha.id)}
                  onTrocar={() => setLinhasMarcadas((atual) => trocar(atual, linha.id))}
                />
              ))}
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-medium">Lançamentos</h3>
              {candidatos.lancamentos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lançamento pendente nesta conta perto dessa data.</p>
              ) : null}
              {candidatos.lancamentos.map((lancamento) => (
                <ItemMarcavel
                  key={lancamento.id}
                  item={lancamento}
                  marcado={lancamentosMarcados.has(lancamento.id)}
                  onTrocar={() => setLancamentosMarcados((atual) => trocar(atual, lancamento.id))}
                />
              ))}
            </section>

            <div className="space-y-1 rounded-md border p-3 text-sm tabular-nums">
              <p>
                Linhas: {valorComSinal(somaEmCentavos(linhasDoGrupo))} · Lançamentos:{" "}
                {valorComSinal(somaEmCentavos(lancamentosDoGrupo))}
              </p>
              <p className={diferenca === 0 ? "text-muted-foreground" : "font-medium"}>
                Diferença: {valorComSinal(diferenca)}
              </p>
              {diferenca !== 0 ? (
                <label className="flex items-center gap-2 pt-1">
                  <Checkbox checked={lancarDiferenca} onCheckedChange={(marcado) => setLancarDiferenca(marcado)} />
                  Lançar a diferença ({diferenca > 0 ? "entrada" : "saída"} de{" "}
                  {formatarMoeda(Math.abs(diferenca) / 100)})
                </label>
              ) : null}
            </div>

            {lancandoDiferenca ? (
              <CamposLancamentoAvulso
                sufixoId={`grupo-${linhaExtratoId}`}
                categorias={categorias}
                centrosCusto={centrosCusto}
                centrosLucro={centrosLucro}
                safras={safras}
                projetos={projetos}
              />
            ) : null}

            {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!podeConciliar || pendente}>
                {pendente ? "Conciliando..." : "Conciliar"}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
