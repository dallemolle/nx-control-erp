"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { BAIXAS, VOCE } from "./exemplo";

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
              <TableHead>Documento</TableHead>
              <TableHead>Contraparte</TableHead>
              <TableHead>Valor pago</TableHead>
              <TableHead>Registrado por</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {BAIXAS.map((baixa, i) => {
              const l = `lista.l${i + 1}`;
              const bloqueada = baixa.registradoPor === VOCE;
              return (
                <TableRow key={baixa.documento}>
                  <TableCell className="font-medium">
                    <Alvo nome={`${l}.documento`} className="inline-block p-1">
                      {baixa.documento}
                    </Alvo>
                  </TableCell>
                  <TableCell>{baixa.contraparte}</TableCell>
                  <TableCell>
                    <Alvo nome={`${l}.valor`} className="inline-block p-1">
                      {baixa.valor}
                    </Alvo>
                  </TableCell>
                  <TableCell>
                    <Alvo nome={`${l}.registradoPor`} className="inline-block p-1">
                      {baixa.registradoPor}
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
