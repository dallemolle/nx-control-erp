"use client";

import { useState } from "react";
import type { TipoTitulo } from "@prisma/client";
import { TituloTable, type OpcoesTitulo } from "./titulo-table";
import { BaixaDialog, type ParcelaParaBaixa } from "./baixa-dialog";
import { RenegociarDialog } from "./renegociar-dialog";
import { ImportarCsvDialog } from "./importar-csv-dialog";
import { EstornarDialog } from "./estornar-dialog";
import { DispensarDialog } from "./dispensar-dialog";
import type { BaixaDaParcela } from "./titulos-para-cliente";

export function ContasClientePanel({
  tipo,
  titulos,
  opcoes,
  podeEscrever,
  podeBaixar,
  podeAprovar,
  filtroAtivo,
  tituloEmFocoId,
}: {
  tituloEmFocoId?: string;
  tipo: TipoTitulo;
  titulos: Parameters<typeof TituloTable>[0]["titulos"];
  /** Listas de seleção do cabeçalho — usadas pelo dialog de edição de cada título. */
  opcoes: OpcoesTitulo;
  podeEscrever: boolean;
  podeBaixar: boolean;
  podeAprovar: boolean;
  filtroAtivo: boolean;
}) {
  const [parcelaBaixa, setParcelaBaixa] = useState<ParcelaParaBaixa | null>(null);
  const [parcelaRenegociacaoId, setParcelaRenegociacaoId] = useState<string | null>(null);
  const [baixaEstorno, setBaixaEstorno] = useState<BaixaDaParcela | null>(null);
  const [baixaDispensa, setBaixaDispensa] = useState<BaixaDaParcela | null>(null);

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
        podeAprovar={podeAprovar}
        filtroAtivo={filtroAtivo}
        onAbrirBaixa={setParcelaBaixa}
        onAbrirRenegociacao={setParcelaRenegociacaoId}
        onAbrirEstorno={setBaixaEstorno}
        onAbrirDispensa={setBaixaDispensa}
        tituloEmFocoId={tituloEmFocoId}
      />
      <BaixaDialog
        tipo={tipo}
        parcela={parcelaBaixa}
        contasBancarias={opcoes.contasBancarias}
        aberto={parcelaBaixa !== null}
        onOpenChange={(aberto) => !aberto && setParcelaBaixa(null)}
      />
      <RenegociarDialog
        tipo={tipo}
        parcelaId={parcelaRenegociacaoId}
        aberto={parcelaRenegociacaoId !== null}
        onOpenChange={(aberto) => !aberto && setParcelaRenegociacaoId(null)}
      />
      <EstornarDialog
        tipo={tipo}
        baixa={baixaEstorno}
        onOpenChange={(aberto) => !aberto && setBaixaEstorno(null)}
      />
      <DispensarDialog
        tipo={tipo}
        baixa={baixaDispensa}
        onOpenChange={(aberto) => !aberto && setBaixaDispensa(null)}
      />
    </div>
  );
}
