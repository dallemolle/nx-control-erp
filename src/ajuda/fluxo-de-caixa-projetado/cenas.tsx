"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, SelectSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { AGUARDANDO, ANO_CIVIL, FUTURA, MOVEL, MOVEL_FISCAL, SALDO_CONCILIADO, type Linha } from "./exemplo";

// Espelho de src/app/(dashboard)/financeiro/fluxo-de-caixa-projetado/*. Mudou um rótulo lá? Ajuste aqui também.

const moeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

function encadear(linhas: readonly Linha[], saldoInicial: number, comAlerta: boolean) {
  let saldo = saldoInicial;
  return linhas.map((l) => {
    const inicial = saldo;
    const geracao = l.entradas - l.saidas;
    saldo = inicial + geracao;
    return { ...l, inicial, geracao, final: saldo, alerta: comAlerta && saldo < 0 };
  });
}

function Cabecalho({ alvo, children }: { alvo?: string; children: string }) {
  return (
    <TableHead>
      {alvo ? (
        <Alvo nome={alvo} className="inline-block px-1">
          {children}
        </Alvo>
      ) : (
        children
      )}
    </TableHead>
  );
}

export function CenaPainel({ valores }: PropsCena) {
  const modo = valores["painel.modo"] ?? "Móvel (12 meses)";
  const futura = valores["painel.proximo"] === "clicado";
  const filtro = valores["painel.classificacao"];
  const rotuloSaldo = filtro ? "Acumulado" : "Saldo";
  const visao = modo === "Ano civil" ? ANO_CIVIL : futura ? FUTURA : MOVEL;
  const linhas = filtro ? encadear(MOVEL_FISCAL, 0, false) : encadear([AGUARDANDO, ...visao], SALDO_CONCILIADO, true);
  const primeiroNegativo = linhas.findIndex((l) => l.alerta);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Fluxo de caixa projetado</p>
        <p className="text-sm text-muted-foreground">
          Projeção calculada a partir do saldo em caixa conciliado de hoje e dos títulos a pagar/receber em aberto. A
          linha &quot;Aguardando conciliação&quot; soma o que já foi lançado (baixas aprovadas, lançamentos manuais,
          transferências) e o extrato ainda não confirmou, e termina no saldo contábil da Tesouraria. Parcelas em
          aberto vencidas antes do período (ou antes de hoje, num período futuro) entram na linha &quot;Em
          atraso&quot;; num período futuro, o que vence de hoje até o início dele entra na linha &quot;A vencer
          até&quot;. O saldo dos meses parte da última dessas linhas. Não considera contratos recorrentes,
          financiamentos nem orçamento (ainda não existem no sistema).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <SelectSimulado alvo="painel.modo" valor={modo} className="w-48" />
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
              <TableHead>Mês</TableHead>
              <Cabecalho alvo="col.saldoInicial">{`${rotuloSaldo} inicial`}</Cabecalho>
              <Cabecalho alvo="col.entradas">Entradas projetadas</Cabecalho>
              <Cabecalho>Saídas projetadas</Cabecalho>
              <Cabecalho>Geração líquida</Cabecalho>
              <Cabecalho alvo="col.saldoFinal">{`${rotuloSaldo} final`}</Cabecalho>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l, indice) => {
              const rotulo = <span className={l.tipo ? "text-muted-foreground" : undefined}>{l.rotulo}</span>;
              const alvoLinha =
                l.tipo === "aguardando"
                  ? "linha.aguardando"
                  : l.tipo === "atraso"
                    ? "linha.atraso"
                    : l.tipo === "aVencer"
                      ? "linha.aVencer"
                      : null;
              const alvoNegativo = indice === primeiroNegativo;
              const saldoFinal = (
                <div className="flex items-center gap-2">
                  {moeda(l.final)}
                  {l.alerta && <Badge variant="destructive">Saldo negativo</Badge>}
                </div>
              );
              return (
                <TableRow key={l.rotulo} className={l.alerta ? "bg-destructive/10" : undefined}>
                  <TableCell>
                    {alvoLinha ? (
                      <Alvo nome={alvoLinha} className="inline-block p-1">
                        {rotulo}
                      </Alvo>
                    ) : (
                      rotulo
                    )}
                  </TableCell>
                  <TableCell>{moeda(l.inicial)}</TableCell>
                  <TableCell>{moeda(l.entradas)}</TableCell>
                  <TableCell>{moeda(l.saidas)}</TableCell>
                  <TableCell>{moeda(l.geracao)}</TableCell>
                  <TableCell className={l.alerta ? "font-medium text-destructive" : undefined}>
                    {alvoNegativo ? (
                      <Alvo nome="linha.negativo" className="inline-block p-1">
                        {saldoFinal}
                      </Alvo>
                    ) : (
                      saldoFinal
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Alvo>
    </div>
  );
}
