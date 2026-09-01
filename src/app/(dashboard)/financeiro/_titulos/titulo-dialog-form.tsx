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
import type { TipoTitulo } from "@prisma/client";
import { SEM_VALOR } from "@/lib/schemas/enums";
import { criarTituloAction, atualizarTituloAction, type FormState } from "./actions";

type Opcao = { id: string; nome: string };

type ParcelaLinha = { numero: number; dataVencimento: string; valorOriginal: string };

/** Cabeçalho do título já achatado para o formulário (ver `tituloParaFormulario`). */
export type TituloEditavel = {
  id: string;
  contraparteId: string;
  documento: string;
  dataEmissao: string;
  dataCompetencia: string;
  categoriaFinanceiraId: string;
  centroCustoId: string | null;
  centroLucroId: string | null;
  safraId: string | null;
  projetoId: string | null;
  contaBancariaId: string | null;
  formaPagamento: string | null;
};

const ESTADO_INICIAL: FormState = {};

/** `<input type="date">` só aceita `yyyy-MM-dd`. */
export function paraInputDate(data: Date | string): string {
  return new Date(data).toISOString().slice(0, 10);
}

function opcional(valor: string | null | undefined): string {
  return valor && valor.length > 0 ? valor : SEM_VALOR;
}

export function TituloDialogForm({
  tipo,
  titulo,
  contrapartes,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
  contasBancarias,
}: {
  tipo: TipoTitulo;
  titulo?: TituloEditavel;
  contrapartes: Opcao[];
  categorias: Opcao[];
  centrosCusto: Opcao[];
  centrosLucro: Opcao[];
  safras: Opcao[];
  projetos: Opcao[];
  contasBancarias: Opcao[];
}) {
  const [aberto, setAberto] = useState(false);
  const action = titulo
    ? atualizarTituloAction.bind(null, tipo)
    : criarTituloAction.bind(null, tipo);
  const [state, formAction, pendente] = useActionState(action, ESTADO_INICIAL);
  const [parcelas, setParcelas] = useState<ParcelaLinha[]>([
    { numero: 1, dataVencimento: "", valorOriginal: "" },
  ]);

  useEffect(() => {
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  function adicionarParcela() {
    setParcelas((atual) => [...atual, { numero: atual.length + 1, dataVencimento: "", valorOriginal: "" }]);
  }

  function removerParcela(indice: number) {
    setParcelas((atual) => atual.filter((_, i) => i !== indice).map((parcela, i) => ({ ...parcela, numero: i + 1 })));
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant={titulo ? "outline" : "default"} size={titulo ? "sm" : "default"} />}>
        {titulo ? "Editar" : `Novo título ${tipo === "PAGAR" ? "a pagar" : "a receber"}`}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo ? "Editar título" : "Novo título"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {titulo ? <input type="hidden" name="id" value={titulo.id} /> : null}
          <input type="hidden" name="parcelas" value={JSON.stringify(parcelas)} />

          <div className="space-y-2">
            <Label htmlFor="contraparteId">{tipo === "PAGAR" ? "Fornecedor" : "Cliente"}</Label>
            <Select name="contraparteId" defaultValue={titulo?.contraparteId}>
              <SelectTrigger id="contraparteId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contrapartes.map((opcao) => (
                  <SelectItem key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="documento">Documento</Label>
            <Input id="documento" name="documento" defaultValue={titulo?.documento} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dataEmissao">Emissão</Label>
              <Input
                id="dataEmissao"
                name="dataEmissao"
                type="date"
                defaultValue={titulo?.dataEmissao}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataCompetencia">Competência</Label>
              <Input
                id="dataCompetencia"
                name="dataCompetencia"
                type="date"
                defaultValue={titulo?.dataCompetencia}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="categoriaFinanceiraId">Categoria financeira</Label>
            <Select name="categoriaFinanceiraId" defaultValue={titulo?.categoriaFinanceiraId}>
              <SelectTrigger id="categoriaFinanceiraId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((opcao) => (
                  <SelectItem key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              {
                nome: "centroCustoId",
                label: "Centro de custo",
                opcoes: centrosCusto,
                atual: titulo?.centroCustoId,
              },
              {
                nome: "centroLucroId",
                label: "Centro de lucro",
                opcoes: centrosLucro,
                atual: titulo?.centroLucroId,
              },
              { nome: "safraId", label: "Safra", opcoes: safras, atual: titulo?.safraId },
              { nome: "projetoId", label: "Projeto", opcoes: projetos, atual: titulo?.projetoId },
            ].map((campo) => (
              <div key={campo.nome} className="space-y-2">
                <Label htmlFor={campo.nome}>{campo.label}</Label>
                <Select name={campo.nome} defaultValue={opcional(campo.atual)}>
                  <SelectTrigger id={campo.nome} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                    {campo.opcoes.map((opcao) => (
                      <SelectItem key={opcao.id} value={opcao.id}>
                        {opcao.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contaBancariaId">Conta bancária prevista</Label>
            <Select name="contaBancariaId" defaultValue={opcional(titulo?.contaBancariaId)}>
              <SelectTrigger id="contaBancariaId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhuma</SelectItem>
                {contasBancarias.map((opcao) => (
                  <SelectItem key={opcao.id} value={opcao.id}>
                    {opcao.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="formaPagamento">Forma de pagamento</Label>
            <Input
              id="formaPagamento"
              name="formaPagamento"
              defaultValue={titulo?.formaPagamento ?? ""}
              placeholder="Opcional (ex.: Boleto, PIX)"
            />
          </div>

          {!titulo && (
            <div className="space-y-2">
              <Label>Parcelas</Label>
              {parcelas.map((parcela, indice) => (
                <div key={indice} className="flex gap-2 items-end">
                  <Input
                    type="date"
                    value={parcela.dataVencimento}
                    onChange={(e) =>
                      setParcelas((atual) =>
                        atual.map((p, i) => (i === indice ? { ...p, dataVencimento: e.target.value } : p)),
                      )
                    }
                    required
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Valor"
                    value={parcela.valorOriginal}
                    onChange={(e) =>
                      setParcelas((atual) =>
                        atual.map((p, i) => (i === indice ? { ...p, valorOriginal: e.target.value } : p)),
                      )
                    }
                    required
                  />
                  {parcelas.length > 1 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => removerParcela(indice)}>
                      Remover
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={adicionarParcela}>
                Adicionar parcela
              </Button>
            </div>
          )}

          {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
