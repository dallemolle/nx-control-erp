"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import {
  adicionarConsumoAction,
  adicionarInsumoAction,
  adicionarProducaoAction,
  removerLinhaAction,
  type FormState,
} from "../actions";

const ESTADO_INICIAL: FormState = {};
const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

/**
 * `useActionState` que troca a `chave` a cada sucesso: o formulário filho é
 * remontado e os campos (inclusive os Selects controlados) voltam a vazio.
 */
function useAcaoQueLimpa(action: (anterior: FormState, dados: FormData) => Promise<FormState>) {
  const [chave, setChave] = useState(0);
  const [state, formAction, pendente] = useActionState<FormState, FormData>(async (anterior, dados) => {
    const resultado = await action(anterior, dados);
    if (resultado.sucesso) setChave((c) => c + 1);
    return resultado;
  }, ESTADO_INICIAL);
  return { chave, state, formAction, pendente };
}

function Rodape({ state, pendente, rotulo }: { state: FormState; pendente: boolean; rotulo: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 sm:col-span-full">
      <Button type="submit" disabled={pendente}>
        {pendente ? "Lançando..." : rotulo}
      </Button>
      {state.erro ? <span className="text-sm text-destructive">{state.erro}</span> : null}
    </div>
  );
}

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  );
}

export type LoteConsumoOpcao = {
  id: string;
  codigo: string;
  saldoKg: number;
  validade: string;
  vencido: boolean;
};

export function FormConsumo({
  opId,
  lotes,
  podeLiberarVencido,
}: {
  opId: string;
  lotes: LoteConsumoOpcao[];
  podeLiberarVencido: boolean;
}) {
  const { chave, state, formAction, pendente } = useAcaoQueLimpa(adicionarConsumoAction);
  return (
    <form action={formAction} className="rounded-lg border p-3">
      <input type="hidden" name="opId" value={opId} />
      <CamposConsumo key={chave} lotes={lotes} podeLiberarVencido={podeLiberarVencido} />
      <Rodape state={state} pendente={pendente} rotulo="Lançar consumo" />
    </form>
  );
}

function CamposConsumo({ lotes, podeLiberarVencido }: { lotes: LoteConsumoOpcao[]; podeLiberarVencido: boolean }) {
  const [loteId, setLoteId] = useState("");
  const [kg, setKg] = useState("");
  const lote = lotes.find((l) => l.id === loteId);
  const acimaDoSaldo = lote !== undefined && Number(kg) > lote.saldoKg;

  return (
    <div className="mb-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
      <Campo id="consumo-lote" rotulo="Lote de fruto">
        <Select name="loteId" value={loteId || null} onValueChange={(v) => setLoteId(v ?? "")}>
          <SelectTrigger id="consumo-lote" className="w-full">
            <SelectValue placeholder={lotes.length ? "Selecione o lote" : "Nenhum lote de fruto disponível"} />
          </SelectTrigger>
          <SelectContent>
            {lotes.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {`${l.codigo} · ${KG.format(l.saldoKg)} kg · vence ${formatarData(l.validade)}${l.vencido ? " · VENCIDO" : ""}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <Campo id="consumo-kg" rotulo="Quantidade (kg)">
        <Input
          id="consumo-kg"
          name="quantidadeKg"
          type="number"
          inputMode="decimal"
          min="0.001"
          step="0.001"
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          required
        />
        {acimaDoSaldo ? (
          <p className="text-xs text-destructive">Acima do saldo do lote ({KG.format(lote.saldoKg)} kg).</p>
        ) : null}
      </Campo>
      {lote?.vencido ? (
        podeLiberarVencido ? (
          <div className="sm:col-span-full">
            <Campo id="consumo-motivo" rotulo="Motivo da liberação do lote vencido">
              <Input id="consumo-motivo" name="motivoLiberacaoVencido" required minLength={3} />
            </Campo>
          </div>
        ) : (
          <p className="text-sm text-destructive sm:col-span-full">
            Lote vencido: só gestor ou administrador libera.
          </p>
        )
      ) : null}
    </div>
  );
}

export function FormProducao({
  opId,
  produtos,
  locais,
}: {
  opId: string;
  produtos: { id: string; rotulo: string }[];
  locais: { id: string; nome: string }[];
}) {
  const { chave, state, formAction, pendente } = useAcaoQueLimpa(adicionarProducaoAction);
  return (
    <form action={formAction} className="rounded-lg border p-3">
      <input type="hidden" name="opId" value={opId} />
      <CamposProducao key={chave} produtos={produtos} locais={locais} />
      <Rodape state={state} pendente={pendente} rotulo="Lançar polpa" />
    </form>
  );
}

function CamposProducao({
  produtos,
  locais,
}: {
  produtos: { id: string; rotulo: string }[];
  locais: { id: string; nome: string }[];
}) {
  const [produtoId, setProdutoId] = useState(produtos.length === 1 ? produtos[0].id : "");
  const [localId, setLocalId] = useState(locais.length === 1 ? locais[0].id : "");
  return (
    <div className="mb-3 grid gap-3 sm:grid-cols-2">
      <Campo id="producao-produto" rotulo="Polpa">
        <Select name="produtoId" value={produtoId || null} onValueChange={(v) => setProdutoId(v ?? "")}>
          <SelectTrigger id="producao-produto" className="w-full">
            <SelectValue placeholder={produtos.length ? "Selecione a polpa" : "Nenhuma polpa desta fruta"} />
          </SelectTrigger>
          <SelectContent>
            {produtos.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <Campo id="producao-local" rotulo="Local">
        <Select name="localId" value={localId || null} onValueChange={(v) => setLocalId(v ?? "")}>
          <SelectTrigger id="producao-local" className="w-full">
            <SelectValue placeholder="Selecione o local" />
          </SelectTrigger>
          <SelectContent>
            {locais.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <Campo id="producao-kg" rotulo="Quantidade (kg)">
        <Input
          id="producao-kg"
          name="quantidadeKg"
          type="number"
          inputMode="decimal"
          min="0.001"
          step="0.001"
          required
        />
      </Campo>
      <Campo id="producao-embalagens" rotulo="Embalagens (opcional)">
        <Input id="producao-embalagens" name="embalagens" type="number" inputMode="numeric" min="1" step="1" />
      </Campo>
    </div>
  );
}

export function FormInsumo({
  opId,
  insumos,
}: {
  opId: string;
  insumos: { id: string; nome: string; unidade: string; custoUnitario: number }[];
}) {
  const { chave, state, formAction, pendente } = useAcaoQueLimpa(adicionarInsumoAction);
  return (
    <form action={formAction} className="rounded-lg border p-3">
      <input type="hidden" name="opId" value={opId} />
      <CamposInsumo key={chave} insumos={insumos} />
      <Rodape state={state} pendente={pendente} rotulo="Lançar insumo" />
    </form>
  );
}

function CamposInsumo({ insumos }: { insumos: { id: string; nome: string; unidade: string; custoUnitario: number }[] }) {
  const [insumoId, setInsumoId] = useState("");
  const insumo = insumos.find((i) => i.id === insumoId);
  return (
    <div className="mb-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
      <Campo id="insumo-id" rotulo="Insumo">
        <Select name="insumoId" value={insumoId || null} onValueChange={(v) => setInsumoId(v ?? "")}>
          <SelectTrigger id="insumo-id" className="w-full">
            <SelectValue placeholder={insumos.length ? "Selecione o insumo" : "Nenhum insumo cadastrado"} />
          </SelectTrigger>
          <SelectContent>
            {insumos.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {`${i.nome} · ${i.unidade} · ${formatarMoeda(i.custoUnitario)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <Campo id="insumo-quantidade" rotulo={`Quantidade${insumo ? ` (${insumo.unidade})` : ""}`}>
        <Input
          id="insumo-quantidade"
          name="quantidade"
          type="number"
          inputMode="decimal"
          min="0.001"
          step="0.001"
          required
        />
      </Campo>
    </div>
  );
}

/** Remove a linha (estorno no estoque) depois de confirmar. */
export function RemoverLinha({
  tipo,
  linhaId,
  descricao,
}: {
  tipo: "consumo" | "producao" | "insumo";
  linhaId: string;
  descricao: string;
}) {
  const [state, formAction, pendente] = useActionState(removerLinhaAction, ESTADO_INICIAL);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Remover ${descricao}?`)) e.preventDefault();
      }}
      className="flex items-center justify-end gap-2"
    >
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="linhaId" value={linhaId} />
      {state.erro ? <span className="text-xs text-destructive">{state.erro}</span> : null}
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? "Removendo..." : "Remover"}
      </Button>
    </form>
  );
}
