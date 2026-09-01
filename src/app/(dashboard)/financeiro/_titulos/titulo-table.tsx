"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TipoTitulo } from "@prisma/client";
import { alterarVencimentoParcelaAction, cancelarParcelaAction } from "./actions";
import { AnexosPanel } from "./anexos-panel";
import { TituloDialogForm, paraInputDate, type TituloEditavel } from "./titulo-dialog-form";

type ParcelaLinha = {
  id: string;
  numero: number;
  dataVencimento: Date;
  valorAtualizado: unknown;
  status: string;
};

type TituloLinha = {
  id: string;
  documento: string;
  fornecedorId: string | null;
  clienteId: string | null;
  fornecedor: { nome: string } | null;
  cliente: { nome: string } | null;
  dataEmissao: Date;
  dataCompetencia: Date;
  categoriaFinanceiraId: string;
  categoriaFinanceira: { nome: string };
  centroCustoId: string | null;
  centroLucroId: string | null;
  safraId: string | null;
  projetoId: string | null;
  contaBancariaId: string | null;
  formaPagamento: string | null;
  parcelas: ParcelaLinha[];
};

export type OpcoesTitulo = {
  contrapartes: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  centrosCusto: { id: string; nome: string }[];
  centrosLucro: { id: string; nome: string }[];
  safras: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
  contasBancarias: { id: string; nome: string }[];
};

const VARIANTE_STATUS: Record<string, "default" | "secondary" | "destructive"> = {
  PAGO: "default",
  VENCIDO: "destructive",
  CANCELADO: "secondary",
  RENEGOCIADO: "secondary",
};

/** Estados finais de parcela: não aceitam baixa, cancelamento nem troca de vencimento. */
const STATUS_TERMINAIS = ["PAGO", "CANCELADO", "RENEGOCIADO"];

function tituloParaFormulario(titulo: TituloLinha): TituloEditavel {
  return {
    id: titulo.id,
    contraparteId: titulo.fornecedorId ?? titulo.clienteId ?? "",
    documento: titulo.documento,
    dataEmissao: paraInputDate(titulo.dataEmissao),
    dataCompetencia: paraInputDate(titulo.dataCompetencia),
    categoriaFinanceiraId: titulo.categoriaFinanceiraId,
    centroCustoId: titulo.centroCustoId,
    centroLucroId: titulo.centroLucroId,
    safraId: titulo.safraId,
    projetoId: titulo.projetoId,
    contaBancariaId: titulo.contaBancariaId,
    formaPagamento: titulo.formaPagamento,
  };
}

export function TituloTable({
  tipo,
  titulos,
  opcoes,
  podeEscrever,
  podeBaixar,
  onAbrirBaixa,
  onAbrirRenegociacao,
}: {
  tipo: TipoTitulo;
  titulos: TituloLinha[];
  opcoes: OpcoesTitulo;
  podeEscrever: boolean;
  podeBaixar: boolean;
  onAbrirBaixa: (parcelaId: string) => void;
  onAbrirRenegociacao: (parcelaId: string) => void;
}) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Documento</TableHead>
          <TableHead>{tipo === "PAGAR" ? "Fornecedor" : "Cliente"}</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead className="text-right">Parcelas</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {titulos.map((titulo) => (
          <Fragment key={titulo.id}>
            <TableRow className="cursor-pointer" onClick={() => setExpandidoId(expandidoId === titulo.id ? null : titulo.id)}>
              <TableCell className="font-medium">{titulo.documento}</TableCell>
              <TableCell>{(titulo.fornecedor ?? titulo.cliente)?.nome}</TableCell>
              <TableCell>{titulo.categoriaFinanceira.nome}</TableCell>
              <TableCell className="text-right">{titulo.parcelas.length}</TableCell>
              {/* stopPropagation: o clique na linha alterna a expansão e fecharia o dialog. */}
              <TableCell className="text-right" onClick={(evento) => evento.stopPropagation()}>
                {podeEscrever && (
                  <TituloDialogForm
                    tipo={tipo}
                    titulo={tituloParaFormulario(titulo)}
                    contrapartes={opcoes.contrapartes}
                    categorias={opcoes.categorias}
                    centrosCusto={opcoes.centrosCusto}
                    centrosLucro={opcoes.centrosLucro}
                    safras={opcoes.safras}
                    projetos={opcoes.projetos}
                    contasBancarias={opcoes.contasBancarias}
                  />
                )}
              </TableCell>
            </TableRow>
            {expandidoId === titulo.id &&
              titulo.parcelas.map((parcela) => (
                <TableRow key={parcela.id} className="bg-muted/30">
                  <TableCell colSpan={3} className="pl-8">
                    Parcela {parcela.numero} — venc. {new Date(parcela.dataVencimento).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE_STATUS[parcela.status] ?? "secondary"}>{parcela.status}</Badge>
                  </TableCell>
                  <TableCell className="flex flex-wrap items-center justify-end gap-2">
                    {podeEscrever && !STATUS_TERMINAIS.includes(parcela.status) && (
                      <form action={alterarVencimentoParcelaAction} className="flex items-center gap-1">
                        <input type="hidden" name="parcelaId" value={parcela.id} />
                        <input type="hidden" name="tipo" value={tipo} />
                        <Input
                          type="date"
                          name="dataVencimento"
                          aria-label={`Novo vencimento da parcela ${parcela.numero}`}
                          defaultValue={paraInputDate(parcela.dataVencimento)}
                          className="h-8 w-auto"
                          required
                        />
                        <Button type="submit" variant="outline" size="sm">
                          Alterar vencimento
                        </Button>
                      </form>
                    )}
                    {podeBaixar && !STATUS_TERMINAIS.includes(parcela.status) && (
                      <Button type="button" size="sm" onClick={() => onAbrirBaixa(parcela.id)}>
                        Baixar
                      </Button>
                    )}
                    {podeEscrever && parcela.status === "VENCIDO" && (
                      <Button type="button" variant="outline" size="sm" onClick={() => onAbrirRenegociacao(parcela.id)}>
                        Renegociar
                      </Button>
                    )}
                    {podeEscrever && !STATUS_TERMINAIS.includes(parcela.status) && (
                      <form action={cancelarParcelaAction}>
                        <input type="hidden" name="parcelaId" value={parcela.id} />
                        <input type="hidden" name="tipo" value={tipo} />
                        <Button type="submit" variant="outline" size="sm">
                          Cancelar
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            {expandidoId === titulo.id && (
              <TableRow className="bg-muted/30">
                <TableCell colSpan={5}>
                  <AnexosPanel tituloId={titulo.id} podeEscrever={podeEscrever} />
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
