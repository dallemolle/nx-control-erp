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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERFIS } from "@/lib/schemas/usuario";
import { criarUsuarioAction, verificarEmailAction, type FormState } from "./actions";

const ESTADO_INICIAL: FormState = {};

export function NovoUsuarioDialog() {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pendente] = useActionState(criarUsuarioAction, ESTADO_INICIAL);

  const [email, setEmail] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [usuarioEncontrado, setUsuarioEncontrado] = useState<string | null>(null);
  const [concederAcesso, setConcederAcesso] = useState(true);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  function reiniciar() {
    setEmail("");
    setVerificando(false);
    setUsuarioEncontrado(null);
    setConcederAcesso(true);
  }

  async function verificarEmail() {
    if (!email) return;
    setVerificando(true);
    try {
      const resultado = await verificarEmailAction(email);
      setUsuarioEncontrado(resultado.existe ? resultado.nome : null);
    } finally {
      setVerificando(false);
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(novoAberto) => {
        setAberto(novoAberto);
        if (!novoAberto) reiniciar();
      }}
    >
      <DialogTrigger render={<Button />}>Novo usuário</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="flex gap-2">
              <Input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(evento) => {
                  setEmail(evento.target.value);
                  setUsuarioEncontrado(null);
                }}
              />
              <Button type="button" variant="outline" onClick={verificarEmail} disabled={!email || verificando}>
                {verificando ? "Verificando..." : "Verificar"}
              </Button>
            </div>
            {usuarioEncontrado ? (
              <p className="text-sm text-muted-foreground">
                Encontramos: <span className="font-medium">{usuarioEncontrado}</span>. Esta pessoa já
                está cadastrada no sistema — só vamos conceder acesso a esta empresa.
              </p>
            ) : null}
          </div>
          {!usuarioEncontrado && (
            <>
              <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" name="nome" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <Input id="senha" name="senha" type="password" required minLength={8} />
              </div>
            </>
          )}
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
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="concederAcessoFilialAtiva"
                name="concederAcessoFilialAtiva"
                value="true"
                checked={concederAcesso}
                onCheckedChange={(checked) => setConcederAcesso(checked === true)}
              />
              <Label htmlFor="concederAcessoFilialAtiva" className="font-normal">
                Conceder acesso a esta filial (ativa)
              </Label>
            </div>
            <div className="flex items-center gap-2 pl-6">
              <Checkbox
                id="podeAlterarFilialAtiva"
                name="podeAlterarFilialAtiva"
                value="true"
                disabled={!concederAcesso}
                aria-label="Permitir alteração"
              />
              <Label htmlFor="podeAlterarFilialAtiva" className="font-normal">
                Permitir alteração (não só leitura)
              </Label>
            </div>
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
