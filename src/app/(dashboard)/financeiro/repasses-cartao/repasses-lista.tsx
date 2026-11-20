"use client";
// Espelhado na ajuda (src/ajuda/repasses-cartao/cenas.tsx): mudou rótulo, coluna ou botão? Ajuste a ajuda junto.

import Link from "next/link";
import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { confirmarRepassesAction, desfazerRepasseAction, type FormState } from "./actions";

/** Repasse como chega do servidor, com as datas em `AAAA-MM-DD`. */
export type LinhaRepasse = {
  parcelaId: string;
  operadora: string;
  pedidoNumero: number;
  numero: number;
  totalRepasses: number;
  dataPrevista: string;
  bruto: number;
  taxa: number;
  liquido: number;
  situacao: "A_RECEBER" | "ATRASADO" | "RECEBIDO";
  recebidoEm: string | null;
};

const ROTULO = { A_RECEBER: "A receber", ATRASADO: "Atrasado", RECEBIDO: "Recebido" } as const;
const VARIANTE = { A_RECEBER: "secondary", ATRASADO: "destructive", RECEBIDO: "default" } as const;
const ESTADO_INICIAL: FormState = {};

function Desfazer({ parcelaId }: { parcelaId: string }) {
  const [state, action, pendente] = useActionState(desfazerRepasseAction, ESTADO_INICIAL);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="parcelaId" value={parcelaId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        Desfazer
      </Button>
      {state.erro ? <span className="max-w-56 text-right text-xs text-destructive">{state.erro}</span> : null}
    </form>
  );
}

export function RepassesLista({
  linhas,
  hoje,
  podeConfirmar,
}: {
  linhas: LinhaRepasse[];
  hoje: string;
  podeConfirmar: boolean;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [state, action, pendente] = useActionState(async (anterior: FormState, dados: FormData) => {
    const resultado = await confirmarRepassesAction(anterior, dados);
    if (resultado.sucesso) setMarcados(new Set());
    return resultado;
  }, ESTADO_INICIAL);

  const selecionadas = linhas.filter((l) => marcados.has(l.parcelaId));
  const liquido = selecionadas.reduce((total, l) => total + Math.round(l.liquido * 100), 0) / 100;
  // Padrão: a data prevista do primeiro marcado, se já passou; senão hoje.
  const primeira = selecionadas[0]?.dataPrevista;
  const dataPadrao = primeira && primeira <= hoje ? primeira : hoje;

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <div className="space-y-4">
      {podeConfirmar ? (
        <form action={action} className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/40 p-3">
          <input type="hidden" name="parcelaIds" value={JSON.stringify([...marcados])} />
          <div className="text-sm">
            <p className="text-muted-foreground">{selecionadas.length} repasse(s) marcado(s)</p>
            <p className="text-base font-semibold tabular-nums">Líquido {formatarMoeda(liquido)}</p>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Recebido em
            <Input key={dataPadrao} type="date" name="data" defaultValue={dataPadrao} max={hoje} className="w-40" />
          </label>
          <Button type="submit" disabled={pendente || selecionadas.length === 0}>
            {pendente ? "Confirmando..." : "Confirmar recebimento"}
          </Button>
          {state.erro ? <p className="w-full text-sm text-destructive">{state.erro}</p> : null}
        </form>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {podeConfirmar ? <TableHead className="w-8" /> : null}
              <TableHead>Previsto</TableHead>
              <TableHead>Operadora</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Taxa</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead>Situação</TableHead>
              {podeConfirmar ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.parcelaId}>
                {podeConfirmar ? (
                  <TableCell>
                    {l.situacao !== "RECEBIDO" ? (
                      <input
                        type="checkbox"
                        className="size-4"
                        aria-label={`Marcar repasse ${l.numero} do pedido ${l.pedidoNumero}`}
                        checked={marcados.has(l.parcelaId)}
                        onChange={() => alternar(l.parcelaId)}
                      />
                    ) : null}
                  </TableCell>
                ) : null}
                <TableCell className="tabular-nums">{formatarData(l.dataPrevista)}</TableCell>
                <TableCell>{l.operadora}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Link href={`/vendas/pedidos/${l.pedidoNumero}`} className="underline-offset-4 hover:underline">
                    PV-{l.pedidoNumero}
                  </Link>
                  {l.totalRepasses > 1 ? ` · ${l.numero}/${l.totalRepasses}` : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(l.bruto)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(l.taxa)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(l.liquido)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant={VARIANTE[l.situacao]}>{ROTULO[l.situacao]}</Badge>
                  {l.recebidoEm ? (
                    <span className="ml-2 text-xs text-muted-foreground">em {formatarData(l.recebidoEm)}</span>
                  ) : null}
                </TableCell>
                {podeConfirmar ? (
                  <TableCell className="text-right">
                    {l.situacao === "RECEBIDO" ? <Desfazer parcelaId={l.parcelaId} /> : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {linhas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum repasse com estes filtros.</p> : null}
    </div>
  );
}
