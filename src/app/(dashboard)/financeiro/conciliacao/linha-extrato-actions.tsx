// src/app/(dashboard)/financeiro/conciliacao/linha-extrato-actions.tsx
"use client";
// Espelhado na ajuda (src/ajuda/conciliacao/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buscarCandidatosAction, confirmarConciliacaoAction, desconciliarAction } from "./actions";
import { ConciliarGrupoDialog } from "./conciliar-grupo-dialog";
import { CriarLancamentoDialogForm } from "./criar-lancamento-dialog-form";

type Candidato = { id: string; data: string; valor: string; descricao: string; conciliado: boolean; valorIgual: boolean; diasDeDiferenca: number; dentroDaTolerancia: boolean; origem: string };

const PRECISA_CANDIDATOS = ["NAO_CONCILIADO", "SUGESTAO", "DIVERGENCIA_VALOR", "DIVERGENCIA_DATA", "DUPLICADO"];

export function LinhaExtratoActions({
  linhaExtratoId,
  status,
  grupo,
  podeEscrever,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
}: {
  linhaExtratoId: string;
  status: string;
  grupo: { linhas: number; lancamentos: string[] } | null;
  podeEscrever: boolean;
  categorias: { id: string; nome: string }[];
  centrosCusto: { id: string; nome: string }[];
  centrosLucro: { id: string; nome: string }[];
  safras: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
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

  const grupoMaior = grupo !== null && (grupo.linhas > 1 || grupo.lancamentos.length > 1);

  function desconciliar() {
    if (
      grupo &&
      grupoMaior &&
      !window.confirm(
        `Desfaz o grupo inteiro: ${grupo.linhas} ${grupo.linhas === 1 ? "linha" : "linhas"} e ` +
          `${grupo.lancamentos.length} ${grupo.lancamentos.length === 1 ? "lançamento" : "lançamentos"} ` +
          "voltam a pendentes.",
      )
    ) {
      return;
    }
    iniciarTransicao(async () => {
      const resultado = await desconciliarAction(linhaExtratoId);
      if (resultado.erro) setErro(resultado.erro);
    });
  }

  if (status === "CONCILIADO") {
    return (
      <div className="flex flex-col items-end gap-1">
        {grupo && grupoMaior ? (
          <div className="text-right text-sm text-muted-foreground">
            <p>
              Grupo: {grupo.linhas} {grupo.linhas === 1 ? "linha" : "linhas"} · {grupo.lancamentos.length}{" "}
              {grupo.lancamentos.length === 1 ? "lançamento" : "lançamentos"}
            </p>
            <ul>
              {grupo.lancamentos.map((descricao, indice) => (
                <li key={indice}>{descricao}</li>
              ))}
            </ul>
          </div>
        ) : grupo?.lancamentos[0] ? (
          <span className="text-sm text-muted-foreground">{grupo.lancamentos[0]}</span>
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

  // O Confirmar (1:1) só aceita lançamento de valor igual ao da linha.
  const candidatosSelecionaveis = candidatos.filter((c) => !c.conciliado && c.valorIgual);
  const valorDiferente = candidatos
    .filter((c) => !c.conciliado && !c.valorIgual && c.dentroDaTolerancia)
    .sort((a, b) => a.diasDeDiferenca - b.diasDeDiferenca);
  const maisProximo = valorDiferente[0];

  return (
    <div className="flex flex-col items-end gap-2">
      {status === "DUPLICADO" && candidatos.some((c) => c.conciliado) ? (
        <p className="text-xs text-muted-foreground">
          Já existe um lançamento igual conciliado com outra linha — confira antes de criar um novo.
        </p>
      ) : null}
      {candidatosSelecionaveis.length === 0 && maisProximo ? (
        <p className="max-w-xs text-right text-xs text-muted-foreground">
          {`Há lançamento com valor diferente: ${maisProximo.descricao} — ${maisProximo.valor} em ${maisProximo.data}` +
            (valorDiferente.length > 1 ? ` e mais ${valorDiferente.length - 1}` : "") +
            (maisProximo.origem === "BAIXA"
              ? ". Se a baixa foi registrada com o valor errado, estorne a baixa em Contas a pagar ou a receber; "
              : ". Se foi digitado errado, corrija na Tesouraria; ") +
            "se a diferença é real (tarifa, juros), use Conciliar em grupo com “Lançar a diferença”."}
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
      <ConciliarGrupoDialog
        linhaExtratoId={linhaExtratoId}
        categorias={categorias}
        centrosCusto={centrosCusto}
        centrosLucro={centrosLucro}
        safras={safras}
        projetos={projetos}
      />
      <CriarLancamentoDialogForm
        linhaExtratoId={linhaExtratoId}
        categorias={categorias}
        centrosCusto={centrosCusto}
        centrosLucro={centrosLucro}
        safras={safras}
        projetos={projetos}
      />
      {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
    </div>
  );
}
