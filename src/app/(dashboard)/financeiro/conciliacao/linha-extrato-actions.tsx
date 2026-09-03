// src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buscarCandidatosAction, confirmarConciliacaoAction, desconciliarAction } from "./actions";
import { CriarLancamentoDialogForm } from "./criar-lancamento-dialog-form";

type Candidato = { id: string; data: string; valor: string; descricao: string; conciliado: boolean };

const PRECISA_CANDIDATOS = ["SUGESTAO", "DIVERGENCIA_VALOR", "DIVERGENCIA_DATA", "DUPLICADO"];

export function LinhaExtratoActions({
  linhaExtratoId,
  status,
  lancamentoVinculadoDescricao,
  podeEscrever,
  categorias,
}: {
  linhaExtratoId: string;
  status: string;
  lancamentoVinculadoDescricao: string | null;
  podeEscrever: boolean;
  categorias: { id: string; nome: string }[];
}) {
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [selecionado, setSelecionado] = useState("");
  const [erro, setErro] = useState<string>();
  const [pendente, iniciarTransicao] = useTransition();

  useEffect(() => {
    if (PRECISA_CANDIDATOS.includes(status)) {
      buscarCandidatosAction(linhaExtratoId).then(setCandidatos);
    }
  }, [linhaExtratoId, status]);

  function confirmar() {
    if (!selecionado) return;
    iniciarTransicao(async () => {
      const resultado = await confirmarConciliacaoAction(linhaExtratoId, selecionado);
      if (resultado.erro) setErro(resultado.erro);
    });
  }

  function desconciliar() {
    iniciarTransicao(async () => {
      const resultado = await desconciliarAction(linhaExtratoId);
      if (resultado.erro) setErro(resultado.erro);
    });
  }

  if (status === "CONCILIADO") {
    return (
      <div className="flex flex-col items-end gap-1">
        {lancamentoVinculadoDescricao ? (
          <span className="text-sm text-muted-foreground">{lancamentoVinculadoDescricao}</span>
        ) : null}
        {podeEscrever && (
          <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={desconciliar}>
            Desconciliar
          </Button>
        )}
        {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
      </div>
    );
  }

  if (!podeEscrever) {
    return null;
  }

  const candidatosSelecionaveis = candidatos.filter((c) => !c.conciliado);

  return (
    <div className="flex flex-col items-end gap-2">
      {status === "DUPLICADO" && candidatos.some((c) => c.conciliado) ? (
        <p className="text-xs text-muted-foreground">
          Já existe um lançamento igual conciliado com outra linha — confira antes de criar um novo.
        </p>
      ) : null}
      {candidatosSelecionaveis.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={selecionado} onValueChange={(valor) => setSelecionado(valor ?? "")}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Selecione o lançamento" />
            </SelectTrigger>
            <SelectContent>
              {candidatosSelecionaveis.map((candidato) => (
                <SelectItem key={candidato.id} value={candidato.id}>
                  {candidato.descricao} — {candidato.valor} em {candidato.data}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" disabled={!selecionado || pendente} onClick={confirmar}>
            Confirmar
          </Button>
        </div>
      )}
      <CriarLancamentoDialogForm linhaExtratoId={linhaExtratoId} categorias={categorias} />
      {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
    </div>
  );
}
