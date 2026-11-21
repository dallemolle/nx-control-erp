"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado } from "@/components/ajuda/campos-simulados";
import { AvisosDaBaixa, DetalheDoValor } from "@/app/(dashboard)/financeiro/aprovacoes/partes-da-linha";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatacao";
import type { PropsCena } from "@/ajuda/tipos";
import { BAIXAS, VOCE, avisosDoExemplo } from "./exemplo";

// Espelho de src/app/(dashboard)/financeiro/aprovacoes/*. Mudou um rótulo ou campo lá? Ajuste aqui também.

export function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Aprovações pendentes</p>
        <p className="text-sm text-muted-foreground">Baixas registradas aguardando aprovação de tesouraria.</p>
      </div>
      <Alvo nome="lista.tabela">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Baixa</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Registrado por</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {BAIXAS.map((baixa, i) => {
              const l = `lista.l${i + 1}`;
              const bloqueada = baixa.registradoPor === VOCE;
              const avisos = avisosDoExemplo(baixa);
              return (
                <TableRow key={baixa.documento} className="align-top">
                  <TableCell>
                    <Alvo nome={`${l}.documento`} className="inline-block p-1">
                      <p className="font-medium">{baixa.documento}</p>
                      <p className="text-primary">{baixa.contraparte}</p>
                      <p className="text-xs text-muted-foreground">
                        {baixa.tipoTitulo === "PAGAR" ? "Pagamento" : "Recebimento"} · parcela {baixa.parcela}/
                        {baixa.totalParcelas}
                      </p>
                    </Alvo>
                    {avisos.length > 0 && (
                      <Alvo nome={`${l}.avisos`} className="w-fit p-1">
                        <AvisosDaBaixa avisos={avisos} />
                      </Alvo>
                    )}
                  </TableCell>
                  <TableCell>
                    <Alvo nome={`${l}.baixa`} className="inline-block p-1">
                      <p>{formatarData(baixa.data)}</p>
                      <p className="text-xs text-muted-foreground">{baixa.conta}</p>
                    </Alvo>
                  </TableCell>
                  <TableCell>
                    <Alvo nome={`${l}.valor`} className="inline-block p-1">
                      <p className="font-medium">{formatarMoeda(baixa.valorPago)}</p>
                      <DetalheDoValor
                        valorParcela={baixa.valorParcela}
                        valorJuros={baixa.valorJuros}
                        valorMulta={baixa.valorMulta}
                        valorDesconto={baixa.valorDesconto}
                      />
                    </Alvo>
                  </TableCell>
                  <TableCell>
                    <Alvo nome={`${l}.registradoPor`} className="inline-block p-1">
                      {baixa.registradoPor}
                      <p className="text-xs text-muted-foreground">{formatarDataHora(baixa.criadoEm)}</p>
                      {bloqueada && (
                        <p className="max-w-48 whitespace-normal text-xs text-muted-foreground">
                          Registrada por você: outra pessoa precisa aprovar
                        </p>
                      )}
                    </Alvo>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start justify-end gap-2">
                      <BotaoSimulado alvo={`${l}.aprovar`} size="sm" className={bloqueada ? "opacity-50" : undefined}>
                        Aprovar
                      </BotaoSimulado>
                      <div className="flex gap-2">
                        <CampoSimulado
                          alvo={`${l}.motivo`}
                          valor={valores[`${l}.motivo`]}
                          placeholder="Motivo da rejeição"
                          className="w-40"
                        />
                        <BotaoSimulado alvo={`${l}.rejeitar`} variant="outline" size="sm">
                          Rejeitar
                        </BotaoSimulado>
                      </div>
                    </div>
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
