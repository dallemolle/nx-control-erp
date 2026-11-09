"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CATEGORIA_PRODUTO,
  CONSERVACAO,
  ROTULOS_CATEGORIA_PRODUTO,
  ROTULOS_CONSERVACAO,
} from "@/lib/schemas/enums";
import { criarProdutoAction, atualizarProdutoAction, type FormState } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

type Produto = {
  id: string;
  codigo: string;
  descricao: string;
  categoria: (typeof CATEGORIA_PRODUTO)[number];
  frutaId: string;
  conservacao: (typeof CONSERVACAO)[number];
  validadeDias: number;
  precoReferenciaKg: number | null;
  armazenamento: string | null;
  unidadeComercial: string | null;
  fatorUnidadeKg: number | null;
};

type FrutaOpcao = { id: string; nome: string };

const ESTADO_INICIAL: FormState = {};

export function ProdutoDialogForm({ produto, frutas }: { produto?: Produto; frutas: FrutaOpcao[] }) {
  const action = produto ? atualizarProdutoAction : criarProdutoAction;
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(action, ESTADO_INICIAL);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={<Button variant={produto ? "outline" : "default"} size={produto ? "sm" : "default"} />}
      >
        {produto ? "Editar" : "Novo produto"}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{produto ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {produto ? <input type="hidden" name="id" value={produto.id} /> : null}
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <div className="space-y-2">
              <Label htmlFor="codigo">Código</Label>
              <Input
                id="codigo"
                name="codigo"
                maxLength={6}
                className="uppercase"
                defaultValue={produto?.codigo}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Input id="descricao" name="descricao" defaultValue={produto?.descricao} required />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Ex.: FA, AGC. O código vira o início do número de lote (FA-260927-01).
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria</Label>
              <Select name="categoria" defaultValue={produto?.categoria ?? "FRUTO"}>
                <SelectTrigger id="categoria" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIA_PRODUTO.map((opcao) => (
                    <SelectItem key={opcao} value={opcao}>
                      {ROTULOS_CATEGORIA_PRODUTO[opcao]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="frutaId">Fruta</Label>
              <Select name="frutaId" defaultValue={produto?.frutaId}>
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
            <div className="space-y-2">
              <Label htmlFor="conservacao">Conservação</Label>
              <Select name="conservacao" defaultValue={produto?.conservacao ?? "IN_NATURA"}>
                <SelectTrigger id="conservacao" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSERVACAO.map((opcao) => (
                    <SelectItem key={opcao} value={opcao}>
                      {ROTULOS_CONSERVACAO[opcao]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="validadeDias">Validade (dias)</Label>
              <Input
                id="validadeDias"
                name="validadeDias"
                type="number"
                min="1"
                step="1"
                defaultValue={produto?.validadeDias}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="precoReferenciaKg">Preço de referência (R$/kg)</Label>
              <Input
                id="precoReferenciaKg"
                name="precoReferenciaKg"
                type="number"
                min="0"
                step="0.0001"
                defaultValue={produto?.precoReferenciaKg ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="armazenamento">Armazenamento (etiqueta)</Label>
              <Input
                id="armazenamento"
                name="armazenamento"
                placeholder="-18 °C"
                defaultValue={produto?.armazenamento ?? ""}
              />
            </div>
          </div>

          <Separator />
          <p className="text-sm font-medium">Unidade comercial (opcional)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="unidadeComercial">Unidade</Label>
              <Input
                id="unidadeComercial"
                name="unidadeComercial"
                placeholder="rasa"
                defaultValue={produto?.unidadeComercial ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fatorUnidadeKg">kg por unidade</Label>
              <Input
                id="fatorUnidadeKg"
                name="fatorUnidadeKg"
                type="number"
                min="0"
                step="0.001"
                placeholder="14"
                defaultValue={produto?.fatorUnidadeKg ?? ""}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Ex.: rasa = 14 kg. Permite lançar quantidade e preço por rasa.
          </p>

          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
