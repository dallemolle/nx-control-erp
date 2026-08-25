"use client";

import { useActionState, useEffect, useState } from "react";
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
import { PERFIS } from "@/lib/schemas/usuario";
import { criarUsuarioAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function NovoUsuarioDialog() {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pendente] = useActionState(criarUsuarioAction, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button />}>Novo usuário</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" name="senha" type="password" required minLength={8} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="perfil">Perfil</Label>
            <Select name="perfil" defaultValue="CONSULTA">
              <SelectTrigger id="perfil" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERFIS.map((perfil) => (
                  <SelectItem key={perfil} value={perfil}>
                    {perfil}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
