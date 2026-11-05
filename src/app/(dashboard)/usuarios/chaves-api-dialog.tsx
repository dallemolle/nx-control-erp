"use client";

import { useActionState, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listarChavesAction,
  gerarChaveAction,
  revogarChaveAction,
  type GerarChaveState,
} from "./actions";

type Chave = {
  id: string;
  nome: string;
  prefixo: string;
  ultimoUsoEm: Date | null;
  revogadaEm: Date | null;
  criadoEm: Date;
};

const ESTADO_INICIAL: GerarChaveState = {};

function formatarData(data: Date | null): string {
  return data ? new Date(data).toLocaleString("pt-BR") : "Nunca";
}

export function ChavesApiDialog({ usuarioId }: { usuarioId: string }) {
  const [aberto, setAberto] = useState(false);
  const [chaves, setChaves] = useState<Chave[]>([]);
  // useActionState não expõe um jeito de resetar seu estado: o Dialog só esconde o
  // conteúdo (não desmonta), então state.chaveCompleta continuaria "vivo" de uma
  // geração anterior se fosse renderizado direto. Guardamos a chave recém-gerada
  // aqui, e limpamos explicitamente ao fechar o diálogo — reabrir nunca reexibe
  // uma chave antiga.
  const [chaveRecemGerada, setChaveRecemGerada] = useState<string | null>(null);
  const [state, formAction, pendente] = useActionState(async (anterior: GerarChaveState, dados: FormData) => {
    const resultado = await gerarChaveAction(anterior, dados);
    if (resultado.chaveCompleta) setChaveRecemGerada(resultado.chaveCompleta);
    if (resultado.sucesso) await recarregar();
    return resultado;
  }, ESTADO_INICIAL);

  async function recarregar() {
    setChaves(await listarChavesAction(usuarioId));
  }

  function aoAlternarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (novoAberto) recarregar();
    else setChaveRecemGerada(null);
  }

  async function revogar(chaveId: string) {
    const formData = new FormData();
    formData.set("chaveId", chaveId);
    await revogarChaveAction(formData);
    await recarregar();
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAlternarAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Chaves de API</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chaves de API</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {chaveRecemGerada ? (
            <div className="space-y-2 rounded-md border border-amber-500 bg-amber-50 p-3 text-sm">
              <p className="font-medium">Copie a chave agora — ela não será mostrada novamente:</p>
              <Input readOnly value={chaveRecemGerada} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
            </div>
          ) : null}

          <div className="space-y-2">
            {chaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma chave gerada.</p>
            ) : (
              chaves.map((chave) => (
                <div key={chave.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div>
                    <div className="font-medium">
                      {chave.nome} <span className="font-mono text-xs text-muted-foreground">{chave.prefixo}...</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Criada em {formatarData(chave.criadoEm)} — Último uso: {formatarData(chave.ultimoUsoEm)}
                      {chave.revogadaEm ? " — Revogada" : ""}
                    </div>
                  </div>
                  {!chave.revogadaEm && (
                    <Button type="button" variant="outline" size="sm" onClick={() => revogar(chave.id)}>
                      Revogar
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <form action={formAction} className="flex items-end gap-2 border-t pt-4">
            <input type="hidden" name="usuarioId" value={usuarioId} />
            <div className="flex-1 space-y-2">
              <Label htmlFor="nome">Nova chave</Label>
              <Input id="nome" name="nome" placeholder="Ex.: Agente IA - lançamentos" required />
            </div>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Gerando..." : "Gerar"}
            </Button>
          </form>
          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
