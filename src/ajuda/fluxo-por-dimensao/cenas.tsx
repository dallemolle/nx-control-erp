"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, SelectSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import { linhasDoExemplo, saldoDaLinha } from "./exemplo";

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
                <CabecalhoComAlvo alvo="cab.saldo">Saldo</CabecalhoComAlvo>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => {
              const saldo = saldoDaLinha(linha);
              return (
                <TableRow key={linha.chave}>
                  <TableCell className="font-medium">
                    {LINHAS_COM_ALVO.has(linha.chave) ? (
                      <Alvo nome={`linha.${linha.chave}`} className="inline-block px-1">
                        {linha.nome}
                      </Alvo>
                    ) : (
                      linha.nome
                    )}
                  </TableCell>
                  <TableCell>{formatarMoeda(linha.entradasRealizadas)}</TableCell>
                  <TableCell>{formatarMoeda(linha.saidasRealizadas)}</TableCell>
                  <TableCell>{formatarMoeda(linha.entradasProjetadas)}</TableCell>
                  <TableCell>{formatarMoeda(linha.saidasProjetadas)}</TableCell>
                  <TableCell className={saldo < 0 ? "font-medium text-destructive" : undefined}>
                    {formatarMoeda(saldo)}
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
