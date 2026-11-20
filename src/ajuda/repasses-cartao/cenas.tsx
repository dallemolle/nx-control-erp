"use client";

import { CheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, SelectSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { cn } from "@/lib/utils";
import { HOJE, REPASSES, type Repasse } from "./exemplo";

// Espelho de src/app/(dashboard)/financeiro/repasses-cartao/*. Mudou um rótulo ou campo lá? Ajuste aqui também.

const ROTULO = { A_RECEBER: "A receber", ATRASADO: "Atrasado", RECEBIDO: "Recebido" } as const;
const VARIANTE = { A_RECEBER: "secondary", ATRASADO: "destructive", RECEBIDO: "default" } as const;

/** Mesmo filtro da tela: sem situação escolhida, só o que falta receber. */
function filtrar(repasses: readonly Repasse[], operadora: string | undefined, situacao: string | undefined) {
  return repasses.filter((r) => {
    if (operadora && r.operadora !== operadora) return false;
    if (situacao === "Atrasados") return r.situacao === "ATRASADO";
    if (situacao === "A receber") return r.situacao === "A_RECEBER";
    if (situacao === "Recebidos") return r.situacao === "RECEBIDO";
    return r.situacao !== "RECEBIDO";
  });
}

const paraIso = (data: string) => data.split("/").reverse().join("-");
const moeda = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

function CaixaDeMarcar({ alvo, marcada }: { alvo?: string; marcada: boolean }) {
  const caixa = (
    <span
      className={cn(
        "flex size-4 items-center justify-center rounded-sm border border-input",
        marcada && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {marcada && <CheckIcon className="size-3" />}
    </span>
  );
  return alvo ? (
    <Alvo nome={alvo} className="inline-flex p-1">
      {caixa}
    </Alvo>
  ) : (
    caixa
  );
}

export function CenaLista({ valores }: PropsCena) {
  const linhas = filtrar(REPASSES, valores["filtro.operadora"], valores["filtro.situacao"]);
  const marcados = linhas.filter((l) => valores[`${l.id}.marcar`] === "marcado");
  const liquido = marcados.reduce((total, l) => total + l.liquidoCentavos, 0);
  // Padrão da tela: a data prevista do primeiro marcado, se já passou; senão hoje.
  const primeira = marcados[0]?.previsto;
  const dataPadrao = primeira && paraIso(primeira) <= paraIso(HOJE) ? primeira : HOJE;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Repasses de cartão</p>
        <p className="text-sm text-muted-foreground">
          Marque os repasses que caíram na conta, confira o líquido com o extrato e confirme. Depois concilie o
          depósito em grupo na Conciliação.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SelectSimulado
          alvo="filtro.operadora"
          compacto
          rotulo="Operadora"
          valor={valores["filtro.operadora"] || "Todas"}
          className="w-48"
        />
        <CampoSimulado
          alvo="filtro.inicio"
          compacto
          rotulo="Previsto de"
          valor={valores["filtro.inicio"]}
          placeholder="dd/mm/aaaa"
          className="w-40"
        />
        <CampoSimulado
          alvo="filtro.fim"
          compacto
          rotulo="Até"
          valor={valores["filtro.fim"]}
          placeholder="dd/mm/aaaa"
          className="w-40"
        />
        <SelectSimulado
          alvo="filtro.situacao"
          compacto
          rotulo="Situação"
          valor={valores["filtro.situacao"] || "A receber e atrasados"}
          className="w-48"
        />
        <BotaoSimulado alvo="filtro.limpar" variant="ghost" size="sm">
          Limpar filtros
        </BotaoSimulado>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/40 p-3">
          <Alvo nome="barra.liquido" className="p-1 text-sm">
            <p className="text-muted-foreground">{marcados.length} repasse(s) marcado(s)</p>
            <p className="text-base font-semibold tabular-nums">Líquido {moeda(liquido)}</p>
          </Alvo>
          <CampoSimulado
            alvo="barra.data"
            compacto
            rotulo="Recebido em"
            valor={valores["barra.data"] ?? dataPadrao}
            className="w-40"
          />
          <BotaoSimulado alvo="barra.confirmar" className={marcados.length === 0 ? "opacity-50" : undefined}>
            Confirmar recebimento
          </BotaoSimulado>
        </div>

        <Alvo nome="tabela">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Previsto</TableHead>
                <TableHead>Operadora</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    {l.situacao !== "RECEBIDO" ? (
                      <CaixaDeMarcar
                        alvo={l.id === "l1" || l.id === "l2" ? `${l.id}.marcar` : undefined}
                        marcada={valores[`${l.id}.marcar`] === "marcado"}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{l.previsto}</TableCell>
                  <TableCell>{l.operadora}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {l.id === "l1" ? (
                      <Alvo nome="l1.pedido" className="inline-block p-1 underline underline-offset-4">
                        {l.pedido}
                      </Alvo>
                    ) : (
                      l.pedido
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.bruto}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.taxa}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.liquido}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant={VARIANTE[l.situacao]}>{ROTULO[l.situacao]}</Badge>
                    {l.recebidoEm ? (
                      <span className="ml-2 text-xs text-muted-foreground">em {l.recebidoEm}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.situacao === "RECEBIDO" ? (
                      <BotaoSimulado alvo={l.id === "rec" ? "rec.desfazer" : undefined} variant="ghost" size="sm">
                        Desfazer
                      </BotaoSimulado>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum repasse com estes filtros.</p>
          ) : null}
        </Alvo>
      </div>
    </div>
  );
}
