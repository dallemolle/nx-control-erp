"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, SelectSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import {
  POR_MES,
  POR_MES_FISCAL,
  POR_SEMANA,
  SALDO_ANTES_DAS_SEMANAS,
  SALDO_INICIAL_DO_ANO,
  type Movimento,
} from "./exemplo";

// Espelho de src/app/(dashboard)/financeiro/fluxo-de-caixa/* e _fluxo-de-caixa/*. Mudou um rótulo lá? Ajuste aqui.

const moeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

function comSaldos(movimentos: readonly Movimento[], saldoInicial: number) {
  let saldo = saldoInicial;
  return movimentos.map((m) => {
    const inicial = saldo;
    const geracao = m.entradas - m.saidas;
    saldo = inicial + geracao;
    return { ...m, inicial, geracao, final: saldo };
  });
}

function Cabecalho({ alvo, children }: { alvo: string; children: string }) {
  return (
    <TableHead>
      <Alvo nome={alvo} className="inline-block px-1">
        {children}
      </Alvo>
    </TableHead>
  );
}

export function CenaPainel({ valores }: PropsCena) {
  const semanal = valores["painel.granularidade"] === "Semana";
  const filtro = valores["painel.classificacao"];
  const rotuloSaldo = filtro ? "Acumulado" : "Saldo";
  const linhas = semanal
    ? comSaldos(POR_SEMANA, SALDO_ANTES_DAS_SEMANAS)
    : filtro
      ? comSaldos(POR_MES_FISCAL, 0)
      : comSaldos(POR_MES, SALDO_INICIAL_DO_ANO);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Fluxo de caixa</p>
        <p className="text-sm text-muted-foreground">Movimentações bancárias já conciliadas, por período.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <SelectSimulado alvo="painel.granularidade" valor={valores["painel.granularidade"] ?? "Mês"} className="w-40" />
          <BotaoSimulado alvo="painel.anterior" variant="outline" size="sm">
            Anterior
          </BotaoSimulado>
          <BotaoSimulado alvo="painel.proximo" variant="outline" size="sm">
            Próximo
          </BotaoSimulado>
        </div>
        <SelectSimulado alvo="painel.classificacao" valor={filtro || "Todos"} className="w-40" />
      </div>

      {filtro && (
        <Alvo nome="painel.aviso">
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Visão filtrada: mostra apenas o movimento classificado como{" "}
            <span className="font-medium text-foreground">{filtro}</span>, acumulado a partir de zero. O saldo
            bancário é único e aparece só na visão &quot;Todos&quot;; transferências entre contas também ficam de
            fora.
          </p>
        </Alvo>
      )}

      <Alvo nome="painel.exportar" className="flex w-fit flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
        <span>Exportar CSV</span>
        <span>Exportar Excel</span>
        <span>Exportar PDF</span>
      </Alvo>

      <Alvo nome="painel.tabela">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <Cabecalho alvo="col.saldoInicial">{`${rotuloSaldo} inicial`}</Cabecalho>
              <Cabecalho alvo="col.entradas">Entradas</Cabecalho>
              <TableHead>Saídas</TableHead>
              <Cabecalho alvo="col.geracao">Geração líquida</Cabecalho>
              <Cabecalho alvo="col.saldoFinal">{`${rotuloSaldo} final`}</Cabecalho>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.periodo}>
                <TableCell>{l.periodo}</TableCell>
                <TableCell>{moeda(l.inicial)}</TableCell>
                <TableCell>{moeda(l.entradas)}</TableCell>
                <TableCell>{moeda(l.saidas)}</TableCell>
                <TableCell>{moeda(l.geracao)}</TableCell>
                <TableCell>{moeda(l.final)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Alvo>
    </div>
  );
}
