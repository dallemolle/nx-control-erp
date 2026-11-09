"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUALIDADE_FRUTO, SEM_VALOR } from "@/lib/schemas/enums";
import { cancelarRecepcaoAction, editarRecepcaoAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

type Props = {
  recepcao: {
    id: string;
    loteId: string;
    codigoLote: string;
    qualidade: "A" | "B" | "C" | null;
    documento: string | null;
    observacao: string | null;
  };
  podeEscrever: boolean;
  situacao: { podeCancelar: boolean; motivo?: string };
};

export function RecepcaoAcoes({ recepcao, podeEscrever, situacao }: Props) {
  return (
    <div className="flex justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<Link href={`/producao/lotes/${recepcao.loteId}/etiqueta`} target="_blank" />}
      >
        Etiqueta
      </Button>
      {podeEscrever ? (
        <>
          <EditarRecepcao recepcao={recepcao} />
          <ExcluirRecepcao recepcao={recepcao} situacao={situacao} />
        </>
      ) : null}
    </div>
  );
}

function EditarRecepcao({ recepcao }: { recepcao: Props["recepcao"] }) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(editarRecepcaoAction, ESTADO_INICIAL);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Editar</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar recepção {recepcao.codigoLote}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={recepcao.id} />
          <p className="text-sm text-muted-foreground">
            Peso, preço, produto e origem não mudam aqui. Para corrigi-los, exclua a recepção e lance de novo.
          </p>
          <div className="space-y-2">
            <Label htmlFor={`qualidade-${recepcao.id}`}>Qualidade</Label>
            <Select name="qualidade" defaultValue={recepcao.qualidade ?? SEM_VALOR}>
              <SelectTrigger id={`qualidade-${recepcao.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Não informada</SelectItem>
                {QUALIDADE_FRUTO.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`documento-${recepcao.id}`}>Romaneio / NF</Label>
            <Input id={`documento-${recepcao.id}`} name="documento" defaultValue={recepcao.documento ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`observacao-${recepcao.id}`}>Observação</Label>
            <Input id={`observacao-${recepcao.id}`} name="observacao" defaultValue={recepcao.observacao ?? ""} />
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

function ExcluirRecepcao({ recepcao, situacao }: { recepcao: Props["recepcao"]; situacao: Props["situacao"] }) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(cancelarRecepcaoAction, ESTADO_INICIAL);
  if (!situacao.podeCancelar) {
    return (
      <Button variant="outline" size="sm" disabled title={situacao.motivo}>
        Excluir
      </Button>
    );
  }
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Excluir</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir recepção {recepcao.codigoLote}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={recepcao.id} />
          <p className="text-sm text-muted-foreground">
            O lote fica zerado (o número não é reaproveitado) e a conta a pagar, se houver, é cancelada.
          </p>
          <div className="space-y-2">
            <Label htmlFor={`motivo-${recepcao.id}`}>Motivo</Label>
            <Input id={`motivo-${recepcao.id}`} name="motivo" required minLength={3} />
          </div>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" variant="destructive" className="w-full" disabled={pendente}>
            {pendente ? "Excluindo..." : "Excluir recepção"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
