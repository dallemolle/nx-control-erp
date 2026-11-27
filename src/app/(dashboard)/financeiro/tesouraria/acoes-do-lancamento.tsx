"use client";
// Espelhado na ajuda (src/ajuda/tesouraria/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Editavel, ExtrasDoLancamento } from "@/lib/lancamentoEditavel";
import { LancamentoDialogForm } from "./lancamento-dialog-form";
import { TransferenciaDialogForm } from "./transferencia-dialog-form";
import { ExcluirLancamentoDialog } from "./excluir-lancamento-dialog";
import { useOpcoesDoLancamento } from "./opcoes-do-lancamento";

/** `extras`: só os cadastros inativos que a linha usa; as listas ativas vêm do provider da página. */
export function AcoesDoLancamento({ editavel, extras }: { editavel: Editavel; extras: ExtrasDoLancamento }) {
  const opcoes = useOpcoesDoLancamento(extras);
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
