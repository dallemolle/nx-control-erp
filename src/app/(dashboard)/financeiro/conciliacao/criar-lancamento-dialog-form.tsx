// src/app/(dashboard)/financeiro/conciliacao/criar-lancamento-dialog-form.tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { criarLancamentoDaLinhaAction, type FormState } from "./actions";
import { CamposLancamentoAvulso } from "./campos-lancamento-avulso";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

export function CriarLancamentoDialogForm({
  linhaExtratoId,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
}: {
  linhaExtratoId: string;
  categorias: { id: string; nome: string }[];
  centrosCusto: { id: string; nome: string }[];
  centrosLucro: { id: string; nome: string }[];
  safras: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(criarLancamentoDaLinhaAction, ESTADO_INICIAL);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Criar lançamento
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar lançamento a partir desta linha</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="linhaExtratoId" value={linhaExtratoId} />
          <CamposLancamentoAvulso
            sufixoId={linhaExtratoId}
            categorias={categorias}
            centrosCusto={centrosCusto}
            centrosLucro={centrosLucro}
            safras={safras}
            projetos={projetos}
          />
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
