"use client";

import { useActionState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelarPedidoAction, editarObservacaoAction, type FormState } from "../actions";
import { useAcaoDoDialogo } from "../../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

/** Cancelar com motivo; quando não pode, o botão fica desabilitado e a explicação aparece ao lado. */
export function CancelarPedido({
  pedidoId,
  numero,
  situacao,
}: {
  pedidoId: string;
  numero: number;
  situacao: { pode: true } | { pode: false; motivo: string };
}) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(cancelarPedidoAction, ESTADO_INICIAL);
  if (!situacao.pode) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled title={situacao.motivo}>
          Cancelar pedido
        </Button>
        <span className="text-xs text-muted-foreground">{situacao.motivo}</span>
      </div>
    );
  }
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" />}>Cancelar pedido</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar pedido {numero}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={pedidoId} />
          <p className="text-sm text-muted-foreground">
            O estoque volta para os lotes, a conta a receber é cancelada e, se a venda foi à vista, o recebimento é
            desfeito. Para corrigir um pedido, cancele e lance de novo.
          </p>
          <div className="space-y-2">
            <Label htmlFor="motivo-cancelamento">Motivo</Label>
            <Input id="motivo-cancelamento" name="motivo" required minLength={3} />
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" variant="destructive" className="w-full" disabled={pendente}>
            {pendente ? "Cancelando..." : "Cancelar pedido"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ObservacaoPedido({
  pedidoId,
  observacao,
  podeEditar,
}: {
  pedidoId: string;
  observacao: string | null;
  podeEditar: boolean;
}) {
  const [state, formAction, pendente] = useActionState(editarObservacaoAction, ESTADO_INICIAL);
  if (!podeEditar) {
    return <p className="text-sm">{observacao ?? <span className="text-muted-foreground">Sem observação.</span>}</p>;
  }
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={pedidoId} />
      <Label htmlFor="observacao-pedido" className="sr-only">
        Observação
      </Label>
      <textarea
        id="observacao-pedido"
        name="observacao"
        rows={3}
        defaultValue={observacao ?? ""}
        className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar observação"}
        </Button>
        {state.erro ? <span className="text-sm text-destructive">{state.erro}</span> : null}
        {state.sucesso && !pendente ? <span className="text-sm text-muted-foreground">Salvo.</span> : null}
      </div>
    </form>
  );
}
