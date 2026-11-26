"use client";
// Espelhado na ajuda (src/ajuda/tesouraria/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Editavel, Opcao } from "@/lib/lancamentoEditavel";
import { LancamentoDialogForm } from "./lancamento-dialog-form";
import { TransferenciaDialogForm } from "./transferencia-dialog-form";
import { ExcluirLancamentoDialog } from "./excluir-lancamento-dialog";

export type OpcoesDoLancamento = {
  contasBancarias: Opcao[];
  categorias: Opcao[];
  centrosCusto: Opcao[];
  centrosLucro: Opcao[];
  safras: Opcao[];
  projetos: Opcao[];
};

export function AcoesDoLancamento({ editavel, opcoes }: { editavel: Editavel; opcoes: OpcoesDoLancamento }) {
  const [excluindo, setExcluindo] = useState(false);
  const ligadoAoExtrato = editavel.tipo === "manual" ? editavel.ligadoAoExtrato : editavel.ladoConciliado !== null;

  return (
    <div className="flex justify-end gap-1">
      {editavel.tipo === "manual" ? (
        <LancamentoDialogForm lancamento={editavel} {...opcoes} />
      ) : (
        <TransferenciaDialogForm transferencia={editavel} contasBancarias={opcoes.contasBancarias} />
      )}
      {/* span: botão desabilitado não mostra o title em todos os navegadores */}
      <span title={ligadoAoExtrato ? "Desconcilie na Conciliação para excluir" : undefined}>
        <Button variant="ghost" size="sm" disabled={ligadoAoExtrato} onClick={() => setExcluindo(true)}>
          Excluir
        </Button>
      </span>
      <ExcluirLancamentoDialog editavel={editavel} aberto={excluindo} onOpenChange={setExcluindo} />
    </div>
  );
}
