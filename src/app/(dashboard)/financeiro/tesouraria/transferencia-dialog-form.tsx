"use client";
// Espelhado na ajuda (src/ajuda/tesouraria/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TransferenciaEditavel } from "@/lib/lancamentoEditavel";
import { criarTransferenciaAction, editarTransferenciaAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

export function TransferenciaDialogForm({
  contasBancarias,
  transferencia,
}: {
  contasBancarias: { id: string; nome: string }[];
  /** Presente na edição; ausente, o formulário cria uma transferência nova. */
  transferencia?: TransferenciaEditavel;
}) {
  const editando = transferencia !== undefined;
  const travado = transferencia?.ladoConciliado != null;
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(
    editando ? editarTransferenciaAction : criarTransferenciaAction,
    ESTADO_INICIAL,
  );

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {editando ? (
        <DialogTrigger render={<Button variant="ghost" size="sm" />}>Editar</DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          Transferência entre contas
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar transferência" : "Transferência entre contas"}</DialogTitle>
        </DialogHeader>
        {transferencia && travado ? (
          <p className="text-sm text-muted-foreground">
            Ligado ao extrato (lado de {transferencia.ladoConciliado}): para mudar contas, data ou valor, desconcilie
            na Conciliação.
          </p>
        ) : null}
        <form action={formAction} className="space-y-4">
          {editando ? <input type="hidden" name="transferenciaId" value={transferencia.transferenciaId} /> : null}
          {transferencia && travado ? <input type="hidden" name="contaOrigemId" value={transferencia.contaOrigemId} /> : null}
          {transferencia && travado ? <input type="hidden" name="contaDestinoId" value={transferencia.contaDestinoId} /> : null}
          {transferencia && travado ? <input type="hidden" name="data" value={transferencia.data} /> : null}
          {transferencia && travado ? <input type="hidden" name="valor" value={transferencia.valor} /> : null}
          <div className="space-y-2">
            <Label htmlFor="contaOrigemId">Conta de origem</Label>
            <Select
              name={travado ? undefined : "contaOrigemId"}
              defaultValue={transferencia?.contaOrigemId}
              disabled={travado}
            >
              <SelectTrigger id="contaOrigemId" className="w-full">
                <SelectValue placeholder="Selecione a conta de origem" />
              </SelectTrigger>
              <SelectContent>
                {contasBancarias.map((conta) => (
                  <SelectItem key={conta.id} value={conta.id}>
                    {conta.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contaDestinoId">Conta de destino</Label>
            <Select
              name={travado ? undefined : "contaDestinoId"}
              defaultValue={transferencia?.contaDestinoId}
              disabled={travado}
            >
              <SelectTrigger id="contaDestinoId" className="w-full">
                <SelectValue placeholder="Selecione a conta de destino" />
              </SelectTrigger>
              <SelectContent>
                {contasBancarias.map((conta) => (
                  <SelectItem key={conta.id} value={conta.id}>
                    {conta.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                name={travado ? undefined : "data"}
                type="date"
                required
                defaultValue={transferencia?.data}
                disabled={travado}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valor">Valor</Label>
              <Input
                id="valor"
                name={travado ? undefined : "valor"}
                type="number"
                step="0.01"
                required
                defaultValue={transferencia?.valor}
                disabled={travado}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Input id="descricao" name="descricao" required defaultValue={transferencia?.descricao} />
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
