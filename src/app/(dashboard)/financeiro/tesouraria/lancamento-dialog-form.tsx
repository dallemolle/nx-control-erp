"use client";
// Espelhado na ajuda (src/ajuda/tesouraria/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

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
import { SEM_VALOR } from "@/lib/schemas/enums";
import type { LancamentoEditavel } from "@/lib/lancamentoEditavel";
import { criarLancamentoManualAction, editarLancamentoManualAction, type FormState } from "./actions";
import { CamposClassificacaoLancamento } from "../../_shared/campos-classificacao-lancamento";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

const ESTADO_INICIAL: FormState = {};

export function LancamentoDialogForm({
  contasBancarias,
  categorias,
  centrosCusto,
  centrosLucro,
  safras,
  projetos,
  lancamento,
}: {
  contasBancarias: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  centrosCusto: { id: string; nome: string }[];
  centrosLucro: { id: string; nome: string }[];
  safras: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
  /** Presente na edição; ausente, o formulário cria um lançamento novo. */
  lancamento?: LancamentoEditavel;
}) {
  const editando = lancamento !== undefined;
  const travado = lancamento?.ligadoAoExtrato ?? false;
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(
    editando ? editarLancamentoManualAction : criarLancamentoManualAction,
    ESTADO_INICIAL,
  );

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {editando ? (
        <DialogTrigger render={<Button variant="ghost" size="sm" />}>Editar</DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>Novo lançamento</DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
        </DialogHeader>
        {travado ? (
          <p className="text-sm text-muted-foreground">
            Ligado ao extrato: para mudar conta, tipo, data ou valor, desconcilie na Conciliação.
          </p>
        ) : null}
        <form onSubmit={formAction} className="space-y-4">
          {editando ? <input type="hidden" name="id" value={lancamento.id} /> : null}
          {lancamento && travado ? <input type="hidden" name="contaBancariaId" value={lancamento.contaBancariaId} /> : null}
          {lancamento && travado ? <input type="hidden" name="tipo" value={lancamento.tipoLancamento} /> : null}
          {lancamento && travado ? <input type="hidden" name="valor" value={lancamento.valor} /> : null}
          {lancamento && travado ? <input type="hidden" name="data" value={lancamento.data} /> : null}
          <div className="space-y-2">
            <Label htmlFor="contaBancariaId">Conta bancária</Label>
            <Select
              name={travado ? undefined : "contaBancariaId"}
              defaultValue={lancamento?.contaBancariaId}
              disabled={travado}
            >
              <SelectTrigger id="contaBancariaId" className="w-full">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {contasBancarias.map((conta) => (
                  <SelectItem key={conta.id} value={conta.id}>
                    {conta.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo</Label>
              <Select
                name={travado ? undefined : "tipo"}
                defaultValue={lancamento?.tipoLancamento ?? "ENTRADA"}
                disabled={travado}
              >
                <SelectTrigger id="tipo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENTRADA">Entrada</SelectItem>
                  <SelectItem value="SAIDA">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="valor">Valor</Label>
              <Input
                id="valor"
                name={travado ? undefined : "valor"}
                type="number"
                step="0.01"
                required
                defaultValue={lancamento?.valor}
                disabled={travado}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="data">Data</Label>
            <Input
              id="data"
              name={travado ? undefined : "data"}
              type="date"
              required
              defaultValue={lancamento?.data}
              disabled={travado}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Input id="descricao" name="descricao" required defaultValue={lancamento?.descricao} />
          </div>
          <CamposClassificacaoLancamento
            comNumero
            inicial={
              lancamento
                ? {
                    classificacaoFiscal: lancamento.classificacaoFiscal,
                    tipoComprovante: lancamento.tipoComprovante,
                    numeroComprovante: lancamento.numeroComprovante,
                  }
                : undefined
            }
          />
          <div className="space-y-2">
            <Label htmlFor="categoriaFinanceiraId">Categoria financeira</Label>
            <Select name="categoriaFinanceiraId" defaultValue={lancamento?.categoriaFinanceiraId ?? SEM_VALOR}>
              <SelectTrigger id="categoriaFinanceiraId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhuma</SelectItem>
                {categorias.map((categoria) => (
                  <SelectItem key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="centroCustoId">Centro de custo</Label>
            <Select name="centroCustoId" defaultValue={lancamento?.centroCustoId ?? SEM_VALOR}>
              <SelectTrigger id="centroCustoId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                {centrosCusto.map((centro) => (
                  <SelectItem key={centro.id} value={centro.id}>
                    {centro.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="centroLucroId">Centro de lucro</Label>
            <Select name="centroLucroId" defaultValue={lancamento?.centroLucroId ?? SEM_VALOR}>
              <SelectTrigger id="centroLucroId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                {centrosLucro.map((centro) => (
                  <SelectItem key={centro.id} value={centro.id}>
                    {centro.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="safraId">Safra</Label>
            <Select name="safraId" defaultValue={lancamento?.safraId ?? SEM_VALOR}>
              <SelectTrigger id="safraId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhuma</SelectItem>
                {safras.map((safra) => (
                  <SelectItem key={safra.id} value={safra.id}>
                    {safra.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="projetoId">Projeto</Label>
            <Select name="projetoId" defaultValue={lancamento?.projetoId ?? SEM_VALOR}>
              <SelectTrigger id="projetoId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                {projetos.map((projeto) => (
                  <SelectItem key={projeto.id} value={projeto.id}>
                    {projeto.nome}
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
