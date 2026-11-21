"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, SelectSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULOS_STATUS_SAFRA_PROJETO } from "@/lib/schemas/enums";
import { SAFRAS, variacao, type SafraExemplo } from "./exemplo";

// Espelho de src/app/(dashboard)/controladoria/comparacao-safras/*. Mudou um rótulo ou coluna lá? Ajuste aqui também.

function CabecalhoComAlvo({ alvo, children }: { alvo: string; children: string }) {
  return (
    <TableHead>
      <Alvo nome={alvo} className="inline-block px-1">
        {children}
      </Alvo>
    </TableHead>
  );
}

/** Orçado da safra, com o que o roteiro digitou por cima. */
function orcadoDe(safra: SafraExemplo, valores: PropsCena["valores"]): number {
  const digitado = valores[`orcado.${safra.chave}`];
  return digitado !== undefined ? Number(digitado) : safra.orcado;
}

export function CenaPainel({ valores }: PropsCena) {
  const filtro = valores["painel.classificacao"];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-lg font-semibold">Comparação entre safras</p>
        <p className="text-sm text-muted-foreground">
          Orçado, realizado e projetado por safra. Realizado e projetado somam tudo o que está marcado com a safra, em
          qualquer data (inclusive compras de pré-safra e vendas depois da colheita). Realizado usa apenas
          movimentações já conciliadas; projetado usa títulos em aberto.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SelectSimulado alvo="painel.classificacao" valor={filtro || "Todos"} className="w-40" />
        <Alvo nome="painel.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Exportar CSV</span>
          <span>Exportar Excel</span>
          <span>Exportar PDF</span>
        </Alvo>
        {filtro && (
          <Alvo nome="painel.aviso">
            <p className="text-sm text-muted-foreground">
              Realizado e projetado só do movimento {filtro.toLowerCase()}; o orçado da safra não é dividido.
            </p>
          </Alvo>
        )}
      </div>

      <Alvo nome="painel.tabela">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Safra</TableHead>
              <CabecalhoComAlvo alvo="cab.status">Status</CabecalhoComAlvo>
              <TableHead>Orçado</TableHead>
              <CabecalhoComAlvo alvo="cab.realizado">Realizado</CabecalhoComAlvo>
              <CabecalhoComAlvo alvo="cab.projetado">Projetado</CabecalhoComAlvo>
              <CabecalhoComAlvo alvo="cab.variacao">Variação</CabecalhoComAlvo>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SAFRAS.map((safra) => {
              const orcado = orcadoDe(safra, valores);
              const realizado = filtro ? safra.realizadoFiscal : safra.realizado;
              const projetado = filtro ? safra.projetadoFiscal : safra.projetado;
              const v = variacao(orcado, realizado);
              const editavel = safra.chave === "safra-2026";
              return (
                <TableRow key={safra.chave}>
                  <TableCell className="font-medium">
                    <Alvo nome={`linha.${safra.chave}`} className="inline-block px-1">
                      {safra.nome}
                    </Alvo>
                  </TableCell>
                  <TableCell>{ROTULOS_STATUS_SAFRA_PROJETO[safra.status]}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CampoSimulado
                        alvo={editavel ? `orcado.${safra.chave}` : undefined}
                        valor={String(orcado)}
                        className="w-32"
                      />
                      <BotaoSimulado alvo={editavel ? `salvar.${safra.chave}` : undefined} size="sm">
                        Salvar
                      </BotaoSimulado>
                    </div>
                  </TableCell>
                  <TableCell>{formatarMoeda(realizado)}</TableCell>
                  <TableCell>{formatarMoeda(projetado)}</TableCell>
                  <TableCell>
                    {formatarMoeda(v.variacaoAbsolutaRealizado)}
                    {v.variacaoPercentualRealizado !== null
                      ? ` (${(v.variacaoPercentualRealizado * 100).toFixed(1)}%)`
                      : null}
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
