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
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MEIO_PAGAMENTO, TIPO_CHAVE_PIX, TIPO_CONTA_TERCEIRO, SEM_VALOR } from "@/lib/schemas/enums";
import { criarFornecedorAction, atualizarFornecedorAction, type FormState } from "./actions";

type Banco = {
  id: string;
  codigo: string;
  nome: string;
};

type Fornecedor = {
  id: string;
  nome: string;
  cnpjCpf: string;
  contato: string | null;
  email: string | null;
  telefone: string | null;
  meioPagamento: (typeof MEIO_PAGAMENTO)[number] | null;
  tipoChavePix: (typeof TIPO_CHAVE_PIX)[number] | null;
  chavePix: string | null;
  bancoId: string | null;
  agencia: string | null;
  conta: string | null;
  tipoContaTerceiro: (typeof TIPO_CONTA_TERCEIRO)[number] | null;
  titularConta: string | null;
};

const ESTADO_INICIAL: FormState = {};

export function FornecedorDialogForm({
  fornecedor,
  bancos,
}: {
  fornecedor?: Fornecedor;
  bancos: Banco[];
}) {
  const [aberto, setAberto] = useState(false);
  const [meioPagamento, setMeioPagamento] = useState(fornecedor?.meioPagamento ?? SEM_VALOR);
  const action = fornecedor ? atualizarFornecedorAction : criarFornecedorAction;
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button variant={fornecedor ? "outline" : "default"} size={fornecedor ? "sm" : "default"} />
        }
      >
        {fornecedor ? "Editar" : "Novo fornecedor"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fornecedor ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {fornecedor ? <input type="hidden" name="id" value={fornecedor.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={fornecedor?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnpjCpf">CNPJ/CPF</Label>
            <Input id="cnpjCpf" name="cnpjCpf" defaultValue={fornecedor?.cnpjCpf} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contato">Contato</Label>
            <Input id="contato" name="contato" defaultValue={fornecedor?.contato ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={fornecedor?.email ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone</Label>
            <Input id="telefone" name="telefone" defaultValue={fornecedor?.telefone ?? ""} />
          </div>

          <Separator />
          <p className="text-sm font-medium">Dados bancários</p>

          <div className="space-y-2">
            <Label htmlFor="meioPagamento">Tipo</Label>
            <Select
              name="meioPagamento"
              defaultValue={fornecedor?.meioPagamento ?? SEM_VALOR}
              onValueChange={(valor) => setMeioPagamento(valor ?? SEM_VALOR)}
            >
              <SelectTrigger id="meioPagamento" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                <SelectItem value="PIX">PIX</SelectItem>
                <SelectItem value="DEPOSITO_BANCARIO">Depósito bancário</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {meioPagamento === "PIX" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="tipoChavePix">Tipo de chave</Label>
                <Select name="tipoChavePix" defaultValue={fornecedor?.tipoChavePix ?? SEM_VALOR}>
                  <SelectTrigger id="tipoChavePix" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VALOR}>Selecione</SelectItem>
                    <SelectItem value="CPF_CNPJ">CPF/CNPJ</SelectItem>
                    <SelectItem value="CELULAR">Celular</SelectItem>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="ALEATORIA">Chave aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chavePix">Chave PIX</Label>
                <Input id="chavePix" name="chavePix" defaultValue={fornecedor?.chavePix ?? ""} />
              </div>
            </>
          ) : null}

          {meioPagamento === "DEPOSITO_BANCARIO" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="bancoId">Banco</Label>
                <Select name="bancoId" defaultValue={fornecedor?.bancoId ?? SEM_VALOR}>
                  <SelectTrigger id="bancoId" className="w-full">
                    <SelectValue placeholder="Selecione o banco" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VALOR}>Selecione</SelectItem>
                    {bancos.map((banco) => (
                      <SelectItem key={banco.id} value={banco.id}>
                        {banco.codigo} · {banco.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="agencia">Agência</Label>
                  <Input id="agencia" name="agencia" defaultValue={fornecedor?.agencia ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conta">Conta</Label>
                  <Input id="conta" name="conta" defaultValue={fornecedor?.conta ?? ""} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipoContaTerceiro">Tipo de conta</Label>
                <Select
                  name="tipoContaTerceiro"
                  defaultValue={fornecedor?.tipoContaTerceiro ?? SEM_VALOR}
                >
                  <SelectTrigger id="tipoContaTerceiro" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VALOR}>Selecione</SelectItem>
                    <SelectItem value="CORRENTE">Corrente</SelectItem>
                    <SelectItem value="POUPANCA">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="titularConta">Titular da conta</Label>
                <Input
                  id="titularConta"
                  name="titularConta"
                  defaultValue={fornecedor?.titularConta ?? ""}
                />
              </div>
            </>
          ) : null}

          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
