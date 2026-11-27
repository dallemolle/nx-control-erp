"use client";
// Espelhado na ajuda (src/ajuda/_titulos/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ClassificacaoFiscal, TipoComprovante, TipoTitulo } from "@prisma/client";
import { TriangleAlert } from "lucide-react";
import { ROTULOS_TIPO_COMPROVANTE } from "@/lib/schemas/enums";
import { pendenciasFiscaisDoTitulo, ROTULOS_PENDENCIA_FISCAL } from "@/lib/classificacaoFiscal";
import { BadgeClassificacao } from "../../_shared/badge-classificacao";
import { alterarVencimentoParcelaAction, cancelarParcelaAction } from "./actions";
import { AnexosPanel } from "./anexos-panel";
import { BaixasDaParcela } from "./baixas-da-parcela";
import type { BaixaDaParcela } from "./titulos-para-cliente";
import { TituloDialogForm, paraInputDate, type TituloEditavel } from "./titulo-dialog-form";
import type { ParcelaParaBaixa } from "./baixa-dialog";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";

type ParcelaLinha = {
  id: string;
  numero: number;
  dataVencimento: Date;
  valorAtualizado: number;
  saldoEmAberto: number;
  status: string;
  baixas: BaixaDaParcela[];
  temBaixaPendente: boolean;
};

type TituloLinha = {
  id: string;
  documento: string;
  fornecedorId: string | null;
  clienteId: string | null;
  fornecedor: { nome: string } | null;
  cliente: { nome: string } | null;
  /** Pix ou depósito do cadastro da contraparte, já formatado; null se não houver. */
  dadosBancarios: string | null;
  dataEmissao: Date;
  dataCompetencia: Date;
  categoriaFinanceiraId: string;
  categoriaFinanceira: { nome: string };
  centroCustoId: string | null;
  centroCusto: { nome: string } | null;
  centroLucroId: string | null;
  centroLucro: { nome: string } | null;
  safraId: string | null;
  safra: { nome: string } | null;
  projetoId: string | null;
  projeto: { nome: string } | null;
  contaBancariaId: string | null;
  contaBancaria: { tipo: string; agencia: string; conta: string; banco: { nome: string } } | null;
  formaPagamento: string | null;
  classificacaoFiscal: ClassificacaoFiscal;
  tipoComprovante: TipoComprovante | null;
  numeroDocumentoFiscal: string | null;
  serieDocumentoFiscal: string | null;
  chaveAcesso: string | null;
  dataEmissaoDocumentoFiscal: Date | null;
  motivoSemDocumento: string | null;
  _count: { anexos: number };
  parcelas: ParcelaLinha[];
};

export type OpcoesTitulo = {
  contrapartes: { id: string; nome: string; classificacaoFiscalPadrao?: ClassificacaoFiscal | null; ativo?: boolean }[];
  categorias: { id: string; nome: string; ativo?: boolean }[];
  centrosCusto: { id: string; nome: string; ativo?: boolean }[];
  centrosLucro: { id: string; nome: string; ativo?: boolean }[];
  safras: { id: string; nome: string; ativo?: boolean }[];
  projetos: { id: string; nome: string; ativo?: boolean }[];
  contasBancarias: { id: string; nome: string; ativo?: boolean }[];
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
    classificacaoFiscal: titulo.classificacaoFiscal,
    tipoComprovante: titulo.tipoComprovante,
    numeroDocumentoFiscal: titulo.numeroDocumentoFiscal,
    serieDocumentoFiscal: titulo.serieDocumentoFiscal,
    chaveAcesso: titulo.chaveAcesso,
    dataEmissaoDocumentoFiscal: titulo.dataEmissaoDocumentoFiscal ? paraInputDate(titulo.dataEmissaoDocumentoFiscal) : null,
    motivoSemDocumento: titulo.motivoSemDocumento,
  };
}

export function TituloTable({
  tipo,
  titulos,
  opcoes,
  podeEscrever,
  podeBaixar,
  podeAprovar,
  filtroAtivo,
  onAbrirBaixa,
  onAbrirRenegociacao,
  onAbrirEstorno,
  onAbrirDispensa,
  tituloEmFocoId,
}: {
  tipo: TipoTitulo;
  titulos: TituloLinha[];
  opcoes: OpcoesTitulo;
  podeEscrever: boolean;
  podeBaixar: boolean;
  podeAprovar: boolean;
  filtroAtivo: boolean;
  onAbrirBaixa: (parcela: ParcelaParaBaixa) => void;
  onAbrirRenegociacao: (parcelaId: string) => void;
  onAbrirEstorno: (baixa: BaixaDaParcela) => void;
  onAbrirDispensa: (baixa: BaixaDaParcela) => void;
  /** Título aberto pelo link das Pendências fiscais: a linha já vem expandida, com parcelas e Anexos. */
  tituloEmFocoId?: string;
}) {
  const [expandidoId, setExpandidoId] = useState<string | null>(tituloEmFocoId ?? null);

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
        {titulos.map((titulo) => {
          const pendencias = pendenciasFiscaisDoTitulo(titulo, titulo._count.anexos);
          const rotuloPendencias = pendencias.map((pendencia) => ROTULOS_PENDENCIA_FISCAL[pendencia]).join(", ");
          return (
            <Fragment key={titulo.id}>
              <TableRow className="cursor-pointer" onClick={() => setExpandidoId(expandidoId === titulo.id ? null : titulo.id)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{titulo.documento}</span>
                    <BadgeClassificacao classificacao={titulo.classificacaoFiscal} />
                    {pendencias.length > 0 && (
                      <TriangleAlert
                        className="size-4 text-amber-600 dark:text-amber-500"
                        role="img"
                        aria-label={`Pendências fiscais: ${rotuloPendencias}`}
                      >
                        <title>{`Pendências fiscais: ${rotuloPendencias}`}</title>
                      </TriangleAlert>
                    )}
                  </div>
                  {titulo.numeroDocumentoFiscal && (
                    <div className="text-xs text-muted-foreground">
                      {titulo.tipoComprovante ? ROTULOS_TIPO_COMPROVANTE[titulo.tipoComprovante] : "Nota"} nº{" "}
                      {titulo.numeroDocumentoFiscal}
                      {titulo.serieDocumentoFiscal ? ` / série ${titulo.serieDocumentoFiscal}` : ""}
                    </div>
                  )}
                </TableCell>
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
              {expandidoId === titulo.id && (
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={5}>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                      <div className="flex gap-1">
                        <dt className="text-muted-foreground">Emissão:</dt>
                        <dd>{formatarData(titulo.dataEmissao)}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-muted-foreground">Competência:</dt>
                        <dd>{formatarData(titulo.dataCompetencia)}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-muted-foreground">Centro de custo:</dt>
                        <dd>{titulo.centroCusto?.nome ?? "—"}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-muted-foreground">Centro de lucro:</dt>
                        <dd>{titulo.centroLucro?.nome ?? "—"}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-muted-foreground">Safra:</dt>
                        <dd>{titulo.safra?.nome ?? "—"}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-muted-foreground">Projeto:</dt>
                        <dd>{titulo.projeto?.nome ?? "—"}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-muted-foreground">Conta bancária:</dt>
                        <dd>
                          {titulo.contaBancaria
                            ? nomeDaContaBancaria(titulo.contaBancaria)
                            : "—"}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-muted-foreground">Forma de pagamento:</dt>
                        <dd>{titulo.formaPagamento ?? "—"}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-muted-foreground">Classificação:</dt>
                        <dd>{titulo.classificacaoFiscal === "FISCAL" ? "Fiscal" : "Gerencial"}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-muted-foreground">Comprovante:</dt>
                        <dd>{titulo.tipoComprovante ? ROTULOS_TIPO_COMPROVANTE[titulo.tipoComprovante] : "—"}</dd>
                      </div>
                      <div className="flex gap-1 sm:col-span-3">
                        <dt className="text-muted-foreground">
                          Dados bancários do {tipo === "PAGAR" ? "fornecedor" : "cliente"}:
                        </dt>
                        <dd className="break-all">{titulo.dadosBancarios ?? "não cadastrados"}</dd>
                      </div>
                      {titulo.chaveAcesso && (
                        <div className="flex gap-1 sm:col-span-3">
                          <dt className="text-muted-foreground">Chave de acesso:</dt>
                          <dd className="font-mono text-xs break-all">{titulo.chaveAcesso}</dd>
                        </div>
                      )}
                      {titulo.motivoSemDocumento && (
                        <div className="flex gap-1 sm:col-span-3">
                          <dt className="text-muted-foreground">Motivo sem nota:</dt>
                          <dd>{titulo.motivoSemDocumento}</dd>
                        </div>
                      )}
                      {pendencias.length > 0 && (
                        <div className="flex gap-1 sm:col-span-3">
                          <dt className="text-muted-foreground">Pendências fiscais:</dt>
                          <dd className="text-amber-700 dark:text-amber-500">{rotuloPendencias}</dd>
                        </div>
                      )}
                    </dl>
                  </TableCell>
                </TableRow>
              )}
              {expandidoId === titulo.id &&
                titulo.parcelas.map((parcela) => (
                  <Fragment key={parcela.id}>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={3} className="pl-8">
                        Parcela {parcela.numero} — venc. {formatarData(parcela.dataVencimento)} — valor{" "}
                        {formatarMoeda(parcela.valorAtualizado)}
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
                        {podeBaixar &&
                          !STATUS_TERMINAIS.includes(parcela.status) &&
                          (parcela.temBaixaPendente ? (
                            <span className="text-xs text-muted-foreground">Baixa aguardando aprovação</span>
                          ) : (
                            <Button type="button" size="sm" onClick={() =>
                              onAbrirBaixa({
                                id: parcela.id,
                                saldoEmAberto: parcela.saldoEmAberto,
                                contraparte: (titulo.fornecedor ?? titulo.cliente)?.nome ?? "",
                                dadosBancarios: titulo.dadosBancarios,
                              })
                            }>
                              Baixar
                            </Button>
                          ))}
                        {podeEscrever && parcela.status === "VENCIDO" && !parcela.temBaixaPendente && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onAbrirRenegociacao(parcela.id)}
                          >
                            Renegociar
                          </Button>
                        )}
                        {podeEscrever && !STATUS_TERMINAIS.includes(parcela.status) && !parcela.temBaixaPendente && (
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
                    {parcela.baixas.length > 0 && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={5} className="pl-12">
                          <BaixasDaParcela
                            baixas={parcela.baixas}
                            podeEstornar={podeAprovar}
                            onEstornar={onAbrirEstorno}
                            podeDispensar={podeBaixar}
                            onDispensar={onAbrirDispensa}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              {expandidoId === titulo.id && (
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={5}>
                    <AnexosPanel tituloId={titulo.id} podeEscrever={podeEscrever} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
        {titulos.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              {filtroAtivo ? "Nenhum título encontrado para os filtros selecionados" : "Nenhum título cadastrado"}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
