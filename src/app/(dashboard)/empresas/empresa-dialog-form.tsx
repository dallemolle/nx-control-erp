"use client";

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
import { criarEmpresaAction, atualizarEmpresaAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../_shared/use-acao-do-dialogo";

type Empresa = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpjCpf: string;
  moedaPadrao: string;
  exigirAprovacaoPorOutro: boolean;
};

const ESTADO_INICIAL: FormState = {};

/** Cor e logo não ficam aqui: são do Tema e marca, o botão ao lado na lista. */
export function EmpresaDialogForm({ empresa }: { empresa?: Empresa }) {
  const action = empresa ? atualizarEmpresaAction : criarEmpresaAction;
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(action, ESTADO_INICIAL);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={empresa ? "outline" : "default"} size={empresa ? "sm" : "default"} />}
      >
        {empresa ? "Editar" : "Nova empresa"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{empresa ? "Editar empresa" : "Nova empresa"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={formAction} className="space-y-4">
          {empresa ? <input type="hidden" name="id" value={empresa.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="razaoSocial">Razão social</Label>
            <Input
              id="razaoSocial"
              name="razaoSocial"
              defaultValue={empresa?.razaoSocial}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nomeFantasia">Nome fantasia</Label>
            <Input
              id="nomeFantasia"
              name="nomeFantasia"
              defaultValue={empresa?.nomeFantasia}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnpjCpf">CNPJ/CPF</Label>
            <Input id="cnpjCpf" name="cnpjCpf" defaultValue={empresa?.cnpjCpf} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="moedaPadrao">Moeda padrão</Label>
            <Input
              id="moedaPadrao"
              name="moedaPadrao"
              defaultValue={empresa?.moedaPadrao ?? "BRL"}
              maxLength={3}
              required
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="exigirAprovacaoPorOutro"
                name="exigirAprovacaoPorOutro"
                value="true"
                defaultChecked={empresa?.exigirAprovacaoPorOutro ?? true}
                className="size-4"
              />
              <Label htmlFor="exigirAprovacaoPorOutro">Exigir que a baixa seja aprovada por outra pessoa</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Quem registra uma baixa não pode aprová-la. Desmarque se a empresa tem uma pessoa só no financeiro.
            </p>
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
