"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MODALIDADE_CARTAO, ROTULOS_MODALIDADE_CARTAO } from "@/lib/schemas/enums";
import type { CondicaoCartao, ModalidadeCartaoValor } from "@/lib/producao/cartao";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";
import { salvarOperadoraAction, type FormState } from "./actions";

type Opcao = { id: string; rotulo: string };

export type OperadoraForm = {
  id: string;
  nome: string;
  cnpjCpf: string;
  contaBancariaId: string;
  categoriaTaxaId: string;
  condicoes: CondicaoCartao[];
};

/** Condição como está nos campos (texto), até virar JSON no envio. */
type Linha = {
  chave: number;
  modalidade: ModalidadeCartaoValor;
  parcelasDe: string;
  parcelasAte: string;
  taxa: string;
  prazo: string;
  antecipado: boolean;
};

const ESTADO_INICIAL: FormState = {};

const linhaDe = (c: CondicaoCartao, chave: number): Linha => ({
  chave,
  modalidade: c.modalidade,
  parcelasDe: String(c.parcelasDe),
  parcelasAte: String(c.parcelasAte),
  taxa: String(c.taxaPercentual),
  prazo: String(c.prazoDias),
  antecipado: c.antecipado,
});

const linhaVazia = (chave: number): Linha => ({
  chave,
  modalidade: "DEBITO",
  parcelasDe: "2",
  parcelasAte: "12",
  taxa: "",
  prazo: "1",
  antecipado: false,
});

const numeroOuNulo = (texto: string) => (texto.trim() === "" ? null : Number(texto));

export function OperadoraDialogForm({
  operadora,
  contas,
  categorias,
}: {
  operadora?: OperadoraForm;
  contas: Opcao[];
  categorias: Opcao[];
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(salvarOperadoraAction, ESTADO_INICIAL);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    operadora ? operadora.condicoes.map(linhaDe) : [linhaVazia(0)],
  );
  const proximaChave = useRef(linhas.length);

  function mudar(chave: number, mudanca: Partial<Linha>) {
    setLinhas((atuais) => atuais.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));
  }

  const condicoesJson = JSON.stringify(
    linhas.map((l) => {
      const parcelado = l.modalidade === "CREDITO_PARCELADO";
      return {
        modalidade: l.modalidade,
        parcelasDe: parcelado ? Number(l.parcelasDe) : 1,
        parcelasAte: parcelado ? Number(l.parcelasAte) : 1,
        taxaPercentual: numeroOuNulo(l.taxa),
        prazoDias: numeroOuNulo(l.prazo),
        antecipado: parcelado && l.antecipado,
      };
    }),
  );

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={operadora ? "outline" : "default"} size={operadora ? "sm" : "default"} />}
      >
        {operadora ? "Editar" : "Nova operadora"}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{operadora ? "Editar operadora" : "Nova operadora"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {operadora ? <input type="hidden" name="id" value={operadora.id} /> : null}
          <input type="hidden" name="condicoes" value={condicoesJson} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" name="nome" defaultValue={operadora?.nome} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpjCpf">CNPJ</Label>
              <Input id="cnpjCpf" name="cnpjCpf" defaultValue={operadora?.cnpjCpf} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contaBancariaId">Conta de depósito</Label>
              <Select name="contaBancariaId" defaultValue={operadora?.contaBancariaId}>
                <SelectTrigger id="contaBancariaId" className="w-full">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoriaTaxaId">Categoria da taxa</Label>
              <Select name="categoriaTaxaId" defaultValue={operadora?.categoriaTaxaId}>
                <SelectTrigger id="categoriaTaxaId" className="w-full">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            O sistema usa (ou cria) o fornecedor e o cliente com este CNPJ: a taxa sai em nome do fornecedor e os
            repasses em nome do cliente.
          </p>

          <div className="space-y-2">
            <p className="text-sm font-medium">Condições</p>
            {linhas.map((l) => {
              const parcelado = l.modalidade === "CREDITO_PARCELADO";
              return (
                <div key={l.chave} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-6">
                  <div className="sm:col-span-2">
                    <Select
                      value={l.modalidade}
                      onValueChange={(v) => v && mudar(l.chave, { modalidade: v as ModalidadeCartaoValor })}
                    >
                      <SelectTrigger aria-label="Modalidade" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODALIDADE_CARTAO.map((m) => (
                          <SelectItem key={m} value={m}>
                            {ROTULOS_MODALIDADE_CARTAO[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {parcelado ? (
                    <>
                      <Input
                        aria-label="Parcelas de"
                        title="Parcelas de"
                        type="number"
                        min="2"
                        max="12"
                        value={l.parcelasDe}
                        onChange={(e) => mudar(l.chave, { parcelasDe: e.target.value })}
                      />
                      <Input
                        aria-label="Parcelas até"
                        title="Parcelas até"
                        type="number"
                        min="2"
                        max="12"
                        value={l.parcelasAte}
                        onChange={(e) => mudar(l.chave, { parcelasAte: e.target.value })}
                      />
                    </>
                  ) : (
                    <span className="self-center text-xs text-muted-foreground sm:col-span-2">1 parcela</span>
                  )}
                  <Input
                    aria-label="Taxa (%)"
                    placeholder="Taxa %"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.0001"
                    value={l.taxa}
                    onChange={(e) => mudar(l.chave, { taxa: e.target.value })}
                  />
                  <Input
                    aria-label="Prazo (dias)"
                    placeholder="Dias"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={l.prazo}
                    onChange={(e) => mudar(l.chave, { prazo: e.target.value })}
                  />
                  <div className="flex items-center justify-between gap-2 sm:col-span-6">
                    {parcelado ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={l.antecipado}
                          onChange={(e) => mudar(l.chave, { antecipado: e.target.checked })}
                        />
                        Antecipado (um repasse só, no prazo)
                      </label>
                    ) : (
                      <span />
                    )}
                    {linhas.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setLinhas((atuais) => atuais.filter((x) => x.chave !== l.chave))}
                      >
                        Remover
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLinhas((atuais) => [...atuais, linhaVazia(proximaChave.current++)])}
            >
              Adicionar condição
            </Button>
            <p className="text-xs text-muted-foreground">
              Taxa sobre o valor bruto. Prazo em dias corridos até o 1º repasse; no parcelado sem antecipação, os
              repasses seguintes vêm de 30 em 30 dias.
            </p>
          </div>

          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
