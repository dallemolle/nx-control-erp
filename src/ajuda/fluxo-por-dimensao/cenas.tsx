"use client";

import { ChevronDown } from "lucide-react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, SelectSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import { fluxoEmArvore } from "@/lib/fluxoPorDimensao";
import { recuoDoNivel } from "@/lib/recuoDoNivel";
import { linhasDoExemplo, resultadoDoMes, totalDoFluxo } from "./exemplo";

// Espelho de src/app/(dashboard)/controladoria/fluxo-por-dimensao/*. Mudou um rótulo ou coluna lá? Ajuste aqui também.

/** Só estas linhas têm alvo nos roteiros; as demais desenham sem destaque. */
const LINHAS_COM_ALVO = new Set(["lavoura", "nao-classificado", "safra-2025"]);

function CabecalhoComAlvo({ alvo, children }: { alvo: string; children: string }) {
  return (
    <Alvo nome={alvo} className="inline-block px-1">
      {children}
    </Alvo>
  );
}

export function CenaPainel({ valores }: PropsCena) {
  const dimensao = valores["painel.dimensao"] || "Centro de custo";
  const filtro = valores["painel.classificacao"];
  const linhas = linhasDoExemplo(dimensao, filtro);
  const total = totalDoFluxo(linhas);
  // Como a tela: o pai mostra o próprio valor mais o dos filhos, e ganha a linha "Direto em ...".
  const itens = fluxoEmArvore(
    linhas.map((l) => ({
      ...l,
      dimensaoId: l.chave === "nao-classificado" ? null : l.chave,
      dimensaoNome: l.nome,
      parentId: l.pai ?? null,
    })),
  );

  return (
    <div className="space-y-8">
      <div>
        <p className="text-lg font-semibold">Fluxo de caixa por dimensão</p>
        <p className="text-sm text-muted-foreground">
          Realizado (movimentações conciliadas) e projetado (títulos em aberto) do mês, agrupados por centro de
          custo, centro de lucro, safra ou projeto. &quot;Não classificado&quot; reúne o que não tem essa dimensão
          preenchida.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SelectSimulado alvo="painel.dimensao" valor={dimensao} className="w-56" />
        <Alvo nome="painel.periodo" className="flex flex-wrap items-center gap-2 p-1">
          <BotaoSimulado variant="outline" size="sm">
            Ano anterior
          </BotaoSimulado>
          <span className="text-sm font-medium">2026</span>
          <BotaoSimulado variant="outline" size="sm">
            Próximo ano
          </BotaoSimulado>
          <SelectSimulado valor="Novembro" className="w-40" />
        </Alvo>
        <SelectSimulado alvo="painel.classificacao" valor={filtro || "Todos"} className="w-40" />
        <Alvo nome="painel.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Exportar CSV</span>
          <span>Exportar Excel</span>
          <span>Exportar PDF</span>
        </Alvo>
      </div>

      {filtro ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="note">
          Visão filtrada: mostra apenas o movimento classificado como{" "}
          <span className="font-medium text-foreground">{filtro}</span>. O que tem a outra classificação fica de
          fora, então o total não bate com o Fluxo de caixa na visão &quot;Todos&quot;.
        </p>
      ) : null}

      <Alvo nome="painel.tabela">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dimensão</TableHead>
              <TableHead>
                <CabecalhoComAlvo alvo="cab.realizadas">Entradas realizadas</CabecalhoComAlvo>
              </TableHead>
              <TableHead>Saídas realizadas</TableHead>
              <TableHead>
                <CabecalhoComAlvo alvo="cab.projetadas">Entradas projetadas</CabecalhoComAlvo>
              </TableHead>
              <TableHead>Saídas projetadas</TableHead>
              <TableHead>
                <CabecalhoComAlvo alvo="cab.saldo">Resultado do mês</CabecalhoComAlvo>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((item) => {
              const saldo = resultadoDoMes(item.valores);
              const nome =
                LINHAS_COM_ALVO.has(item.chave) && !item.direto ? (
                  <Alvo nome={`linha.${item.chave}`} className="inline-block px-1">
                    {item.nome}
                  </Alvo>
                ) : (
                  item.nome
                );
              return (
                <TableRow key={item.chave}>
                  <TableCell
                    className={item.direto ? "text-muted-foreground" : item.temFilhos ? "font-semibold" : "font-medium"}
                  >
                    <div className="flex items-center gap-1" style={recuoDoNivel(item.nivel)}>
                      {item.temFilhos ? (
                        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
                      ) : (
                        <span className="inline-block w-5" aria-hidden />
                      )}
                      {nome}
                    </div>
                  </TableCell>
                  <TableCell>{formatarMoeda(item.valores.entradasRealizadas)}</TableCell>
                  <TableCell>{formatarMoeda(item.valores.saidasRealizadas)}</TableCell>
                  <TableCell>{formatarMoeda(item.valores.entradasProjetadas)}</TableCell>
                  <TableCell>{formatarMoeda(item.valores.saidasProjetadas)}</TableCell>
                  <TableCell className={saldo < 0 ? "font-medium text-destructive" : undefined}>
                    {formatarMoeda(saldo)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell>Total</TableCell>
              <TableCell>{formatarMoeda(total.entradasRealizadas)}</TableCell>
              <TableCell>{formatarMoeda(total.saidasRealizadas)}</TableCell>
              <TableCell>{formatarMoeda(total.entradasProjetadas)}</TableCell>
              <TableCell>{formatarMoeda(total.saidasProjetadas)}</TableCell>
              <TableCell className={total.resultado < 0 ? "text-destructive" : undefined}>
                {formatarMoeda(total.resultado)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Alvo>
    </div>
  );
}
