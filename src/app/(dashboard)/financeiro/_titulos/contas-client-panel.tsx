"use client";

import { useState } from "react";
import type { TipoTitulo } from "@prisma/client";
import { TituloTable } from "./titulo-table";
import { BaixaDialog } from "./baixa-dialog";
import { RenegociarDialog } from "./renegociar-dialog";
import { ImportarCsvDialog } from "./importar-csv-dialog";

export function ContasClientePanel({
  tipo,
  titulos,
  podeEscrever,
  podeBaixar,
  contasBancarias,
}: {
  tipo: TipoTitulo;
  titulos: Parameters<typeof TituloTable>[0]["titulos"];
  podeEscrever: boolean;
  podeBaixar: boolean;
  contasBancarias: { id: string; nome: string }[];
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
        podeEscrever={podeEscrever}
        podeBaixar={podeBaixar}
        onAbrirBaixa={setParcelaBaixaId}
        onAbrirRenegociacao={setParcelaRenegociacaoId}
      />
      <BaixaDialog
        tipo={tipo}
        parcelaId={parcelaBaixaId}
        contasBancarias={contasBancarias}
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
