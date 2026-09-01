"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TipoTitulo } from "@prisma/client";
import { cancelarParcelaAction } from "./actions";
import { AnexosPanel } from "./anexos-panel";

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
  fornecedor: { nome: string } | null;
  cliente: { nome: string } | null;
  categoriaFinanceira: { nome: string };
  parcelas: ParcelaLinha[];
};

const VARIANTE_STATUS: Record<string, "default" | "secondary" | "destructive"> = {
  PAGO: "default",
  VENCIDO: "destructive",
  CANCELADO: "secondary",
  RENEGOCIADO: "secondary",
};

export function TituloTable({
  tipo,
  titulos,
  podeEscrever,
  podeBaixar,
  onAbrirBaixa,
  onAbrirRenegociacao,
}: {
  tipo: TipoTitulo;
  titulos: TituloLinha[];
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
            </TableRow>
            {expandidoId === titulo.id &&
              titulo.parcelas.map((parcela) => (
                <TableRow key={parcela.id} className="bg-muted/30">
                  <TableCell colSpan={2} className="pl-8">
                    Parcela {parcela.numero} — venc. {new Date(parcela.dataVencimento).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE_STATUS[parcela.status] ?? "secondary"}>{parcela.status}</Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    {podeBaixar && parcela.status !== "PAGO" && parcela.status !== "CANCELADO" && (
                      <Button type="button" size="sm" onClick={() => onAbrirBaixa(parcela.id)}>
                        Baixar
                      </Button>
                    )}
                    {podeEscrever && parcela.status === "VENCIDO" && (
                      <Button type="button" variant="outline" size="sm" onClick={() => onAbrirRenegociacao(parcela.id)}>
                        Renegociar
                      </Button>
                    )}
                    {podeEscrever && parcela.status !== "CANCELADO" && parcela.status !== "PAGO" && (
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
                <TableCell colSpan={4}>
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
