"use client";

import { useFormularioDaAcao } from "@/components/use-formulario-da-acao";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StatusEntrega } from "@prisma/client";
import { formatarData } from "@/lib/formatacao";
import { atualizarEntregaAction, type FormState } from "../entregas/actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

export type EntregaParaAcoes = {
  pedidoId: string;
  numero: number;
  status: StatusEntrega;
  /** `AAAA-MM-DD`. */
  dataPrevista: string;
  endereco: string | null;
  responsavel: string | null;
  observacao: string | null;
  recebidoPor: string | null;
  /** `AAAA-MM-DD`, só na entregue. */
  dataRealizada: string | null;
};

/** Botões da entrega: em rota, entregue (com data e quem recebeu), desfazer a entrega e editar. */
export function EntregaAcoes({
  entrega,
  podeEscrever,
  hoje,
}: {
  entrega: EntregaParaAcoes;
  podeEscrever: boolean;
  hoje: string;
}) {
  if (!podeEscrever || entrega.status === "CANCELADA") return null;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {entrega.status === "PENDENTE" ? <MarcarEmRota pedidoId={entrega.pedidoId} /> : null}
      {entrega.status !== "ENTREGUE" ? <MarcarEntregue entrega={entrega} hoje={hoje} /> : null}
      {entrega.status === "ENTREGUE" ? <DesfazerEntrega entrega={entrega} /> : null}
      <EditarEntrega entrega={entrega} />
    </div>
  );
}

function MarcarEmRota({ pedidoId }: { pedidoId: string }) {
  const [state, formAction, pendente] = useFormularioDaAcao(atualizarEntregaAction, ESTADO_INICIAL);
  return (
    <form onSubmit={formAction} className="flex items-center gap-2">
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <input type="hidden" name="status" value="EM_ROTA" />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        Em rota
      </Button>
      {state.erro ? <span className="text-xs text-destructive">{state.erro}</span> : null}
    </form>
  );
}

function MarcarEntregue({ entrega, hoje }: { entrega: EntregaParaAcoes; hoje: string }) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(atualizarEntregaAction, ESTADO_INICIAL);
  const id = `entregue-${entrega.pedidoId}`;
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Entregue</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entrega do pedido {entrega.numero}</DialogTitle>
        </DialogHeader>
        <form onSubmit={formAction} className="space-y-4">
          <input type="hidden" name="pedidoId" value={entrega.pedidoId} />
          <input type="hidden" name="status" value="ENTREGUE" />
          <div className="space-y-2">
            <Label htmlFor={`${id}-data`}>Entregue em</Label>
            <Input id={`${id}-data`} name="dataRealizada" type="date" defaultValue={hoje} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-recebido`}>Recebido por</Label>
            <Input id={`${id}-recebido`} name="recebidoPor" defaultValue={entrega.recebidoPor ?? ""} />
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Confirmar entrega"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Entregue por engano (pedido errado): volta para Em rota e apaga a data e quem recebeu. */
function DesfazerEntrega({ entrega }: { entrega: EntregaParaAcoes }) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(atualizarEntregaAction, ESTADO_INICIAL);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Desfazer entrega</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desfazer a entrega do pedido {entrega.numero}</DialogTitle>
        </DialogHeader>
        <form onSubmit={formAction} className="space-y-4">
          <input type="hidden" name="pedidoId" value={entrega.pedidoId} />
          <input type="hidden" name="status" value="EM_ROTA" />
          <p className="text-sm text-muted-foreground">
            A entrega volta para Em rota e a data
            {entrega.dataRealizada ? ` (${formatarData(entrega.dataRealizada)})` : ""} e quem recebeu
            {entrega.recebidoPor ? ` (${entrega.recebidoPor})` : ""} são apagados. Use quando marcou o pedido errado;
            para corrigir só a data ou o nome, use “Editar”. Fica registrado na auditoria.
          </p>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" variant="destructive" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Desfazer entrega"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditarEntrega({ entrega }: { entrega: EntregaParaAcoes }) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(atualizarEntregaAction, ESTADO_INICIAL);
  const id = `editar-entrega-${entrega.pedidoId}`;
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Editar</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entrega do pedido {entrega.numero}</DialogTitle>
        </DialogHeader>
        <form onSubmit={formAction} className="space-y-4">
          <input type="hidden" name="pedidoId" value={entrega.pedidoId} />
          {entrega.status === "ENTREGUE" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${id}-realizada`}>Entregue em</Label>
                <Input
                  id={`${id}-realizada`}
                  name="dataRealizada"
                  type="date"
                  defaultValue={entrega.dataRealizada ?? ""}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-recebido`}>Recebido por</Label>
                <Input id={`${id}-recebido`} name="recebidoPor" defaultValue={entrega.recebidoPor ?? ""} />
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={`${id}-data`}>Data prevista</Label>
            <Input id={`${id}-data`} name="dataPrevista" type="date" defaultValue={entrega.dataPrevista} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-endereco`}>Endereço</Label>
            <Input id={`${id}-endereco`} name="endereco" defaultValue={entrega.endereco ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-responsavel`}>Responsável</Label>
            <Input id={`${id}-responsavel`} name="responsavel" defaultValue={entrega.responsavel ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-observacao`}>Observação</Label>
            <Input id={`${id}-observacao`} name="observacao" defaultValue={entrega.observacao ?? ""} />
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
