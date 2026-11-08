"use client";

import { useState } from "react";
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
import {
  CANAL_VENDA,
  MEIO_PAGAMENTO,
  ROTULOS_CANAL_VENDA,
  TIPO_CHAVE_PIX,
  TIPO_CONTA_TERCEIRO,
  SEM_VALOR,
} from "@/lib/schemas/enums";
import { criarClienteAction, atualizarClienteAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

type Banco = {
  id: string;
  codigo: string;
  nome: string;
};

type Cliente = {
  id: string;
  nome: string;
  cnpjCpf: string | null;
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
  classificacaoFiscalPadrao: "FISCAL" | "GERENCIAL" | null;
  canalVenda: (typeof CANAL_VENDA)[number] | null;
  municipio: string | null;
  enderecoEntrega: string | null;
  retiraNaPropriedade: boolean;
};

const ESTADO_INICIAL: FormState = {};

export function ClienteDialogForm({ cliente, bancos }: { cliente?: Cliente; bancos: Banco[] }) {
  const [meioPagamento, setMeioPagamento] = useState(cliente?.meioPagamento ?? SEM_VALOR);
  const action = cliente ? atualizarClienteAction : criarClienteAction;
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(action, ESTADO_INICIAL);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={cliente ? "outline" : "default"} size={cliente ? "sm" : "default"} />}
      >
        {cliente ? "Editar" : "Novo cliente"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cliente ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {cliente ? <input type="hidden" name="id" value={cliente.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={cliente?.nome} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnpjCpf">CNPJ/CPF (opcional)</Label>
            <Input id="cnpjCpf" name="cnpjCpf" defaultValue={cliente?.cnpjCpf ?? ""} />
            <p className="text-xs text-muted-foreground">
              Deixe em branco para consumidor final ou clientes diversos.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contato">Contato</Label>
            <Input id="contato" name="contato" defaultValue={cliente?.contato ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={cliente?.email ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone</Label>
            <Input id="telefone" name="telefone" defaultValue={cliente?.telefone ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="classificacaoFiscalPadrao">Classificação padrão dos títulos</Label>
            <Select name="classificacaoFiscalPadrao" defaultValue={cliente?.classificacaoFiscalPadrao ?? SEM_VALOR}>
              <SelectTrigger id="classificacaoFiscalPadrao" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhuma</SelectItem>
                <SelectItem value="FISCAL">Fiscal (com documento)</SelectItem>
                <SelectItem value="GERENCIAL">Gerencial (sem nota)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Use Gerencial para parceiros que não emitem nota. Novos títulos deste parceiro já virão com essa
              classificação.
            </p>
          </div>

          <Separator />
          <p className="text-sm font-medium">Vendas</p>

          <div className="space-y-2">
            <Label htmlFor="canalVenda">Canal de venda</Label>
            <Select name="canalVenda" defaultValue={cliente?.canalVenda ?? SEM_VALOR}>
              <SelectTrigger id="canalVenda" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                {CANAL_VENDA.map((canal) => (
                  <SelectItem key={canal} value={canal}>
                    {ROTULOS_CANAL_VENDA[canal]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="municipio">Município</Label>
            <Input id="municipio" name="municipio" defaultValue={cliente?.municipio ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="enderecoEntrega">Endereço de entrega</Label>
            <Input id="enderecoEntrega" name="enderecoEntrega" defaultValue={cliente?.enderecoEntrega ?? ""} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="retiraNaPropriedade"
              defaultChecked={cliente?.retiraNaPropriedade ?? false}
              className="size-4"
            />
            Retira na propriedade (o pedido não gera entrega)
          </label>

          <Separator />
          <p className="text-sm font-medium">Dados bancários</p>

          <div className="space-y-2">
            <Label htmlFor="meioPagamento">Tipo</Label>
            <Select
              name="meioPagamento"
              defaultValue={cliente?.meioPagamento ?? SEM_VALOR}
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
                <Select name="tipoChavePix" defaultValue={cliente?.tipoChavePix ?? SEM_VALOR}>
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
                <Input id="chavePix" name="chavePix" defaultValue={cliente?.chavePix ?? ""} />
              </div>
            </>
          ) : null}

          {meioPagamento === "DEPOSITO_BANCARIO" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="bancoId">Banco</Label>
                <Select name="bancoId" defaultValue={cliente?.bancoId ?? SEM_VALOR}>
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
                  <Input id="agencia" name="agencia" defaultValue={cliente?.agencia ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conta">Conta</Label>
                  <Input id="conta" name="conta" defaultValue={cliente?.conta ?? ""} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipoContaTerceiro">Tipo de conta</Label>
                <Select
                  name="tipoContaTerceiro"
                  defaultValue={cliente?.tipoContaTerceiro ?? SEM_VALOR}
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
                <Input id="titularConta" name="titularConta" defaultValue={cliente?.titularConta ?? ""} />
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
