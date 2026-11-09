"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { criarTalhaoAction, atualizarTalhaoAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

type Talhao = {
  id: string;
  nome: string;
  frutaId: string;
  areaHa: number;
  anoPlantio: number | null;
  espacamento: string | null;
  observacao: string | null;
};

type FrutaOpcao = { id: string; nome: string };

const ESTADO_INICIAL: FormState = {};

export function TalhaoDialogForm({ talhao, frutas }: { talhao?: Talhao; frutas: FrutaOpcao[] }) {
  const action = talhao ? atualizarTalhaoAction : criarTalhaoAction;
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(action, ESTADO_INICIAL);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant={talhao ? "outline" : "default"} size={talhao ? "sm" : "default"} />}>
        {talhao ? "Editar" : "Novo talhão"}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{talhao ? "Editar talhão" : "Novo talhão"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {talhao ? <input type="hidden" name="id" value={talhao.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={talhao?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="frutaId">Cultura</Label>
            <Select name="frutaId" defaultValue={talhao?.frutaId}>
              <SelectTrigger id="frutaId" className="w-full">
                <SelectValue placeholder="Selecione a fruta" />
              </SelectTrigger>
              <SelectContent>
                {frutas.map((fruta) => (
                  <SelectItem key={fruta.id} value={fruta.id}>
                    {fruta.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="areaHa">Área (ha)</Label>
              <Input
                id="areaHa"
                name="areaHa"
                type="number"
                min="0"
                step="0.01"
                defaultValue={talhao?.areaHa}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="anoPlantio">Ano de plantio</Label>
              <Input id="anoPlantio" name="anoPlantio" type="number" step="1" defaultValue={talhao?.anoPlantio ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="espacamento">Espaçamento</Label>
            <Input
              id="espacamento"
              name="espacamento"
              placeholder="5 x 5 m"
              defaultValue={talhao?.espacamento ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="observacao">Observação</Label>
            <Input id="observacao" name="observacao" defaultValue={talhao?.observacao ?? ""} />
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
