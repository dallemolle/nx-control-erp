"use client";

import { useState } from "react";
import type { TipoTitulo } from "@prisma/client";
import { TituloTable, type OpcoesTitulo } from "./titulo-table";
import { BaixaDialog } from "./baixa-dialog";
import { RenegociarDialog } from "./renegociar-dialog";
import { ImportarCsvDialog } from "./importar-csv-dialog";

export function ContasClientePanel({
  tipo,
  titulos,
  opcoes,
  podeEscrever,
  podeBaixar,
}: {
  tipo: TipoTitulo;
  titulos: Parameters<typeof TituloTable>[0]["titulos"];
  /** Listas de seleção do cabeçalho — usadas pelo dialog de edição de cada título. */
  opcoes: OpcoesTitulo;
  podeEscrever: boolean;
  podeBaixar: boolean;
}) {
  const [parcelaBaixaId, setParcelaBaixaId] = useState<string | null>(null);
  const [parcelaRenegociacaoId, setParcelaRenegociacaoId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {podeEscrever && (
        <div className="flex justify-end">
          <ImportarCsvDialog tipo={tipo} />
        </div>
      )}
      <TituloTable
        tipo={tipo}
        titulos={titulos}
        opcoes={opcoes}
        podeEscrever={podeEscrever}
        podeBaixar={podeBaixar}
        onAbrirBaixa={setParcelaBaixaId}
        onAbrirRenegociacao={setParcelaRenegociacaoId}
      />
      <BaixaDialog
        tipo={tipo}
        parcelaId={parcelaBaixaId}
        contasBancarias={opcoes.contasBancarias}
        aberto={parcelaBaixaId !== null}
        onOpenChange={(aberto) => !aberto && setParcelaBaixaId(null)}
      />
      <RenegociarDialog
        tipo={tipo}
        parcelaId={parcelaRenegociacaoId}
        aberto={parcelaRenegociacaoId !== null}
        onOpenChange={(aberto) => !aberto && setParcelaRenegociacaoId(null)}
      />
    </div>
  );
}
