import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar, requirePermission } from "@/server/auth/permissions";
import { obterPedido, situacaoParaCancelar } from "@/server/services/pedidoVenda";
import {
  ROTULOS_CANAL_VENDA,
  ROTULOS_CLASSIFICACAO_FISCAL,
  ROTULOS_FORMA_PAGAMENTO_VENDA,
  ROTULOS_STATUS_ENTREGA,
} from "@/lib/schemas/enums";
import { atrasoEntregaDias } from "@/lib/producao/venda";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso } from "@/lib/producao/periodo";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { EntregaAcoes } from "../../_shared/entrega-acoes";
import { KG, PERCENTUAL, SituacaoPagamentoBadge } from "../../_shared/formatos";
import { LinkRastreio } from "../../../producao/_shared/link-rastreio";
import { CancelarPedido, ObservacaoPedido } from "./pedido-acoes";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function PedidoPage({ params }: { params: Promise<{ numero: string }> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "venda:ler");

  const { numero: numeroBruto } = await params;
  const numero = Number(numeroBruto);
  if (!Number.isInteger(numero) || numero < 1) notFound();
  const hoje = hojeDeCalendario();
  const pedido = await obterPedido(sessao.filialId, numero, hoje);
  if (!pedido) notFound();

  const podeEscrever = podeExecutar(sessao.perfil, "venda:escrever") && sessao.podeAlterarFilial;
  const podeCancelar = podeExecutar(sessao.perfil, "venda:cancelar") && sessao.podeAlterarFilial;
  const situacaoCancelamento = podeCancelar ? await situacaoParaCancelar(pedido) : null;
  const cancelado = pedido.status === "CANCELADO";
  const atraso = pedido.entrega ? atrasoEntregaDias(pedido.entrega, hoje) : null;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/vendas/pedidos" className="underline-offset-4 hover:underline">
              Pedidos
            </Link>
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            Pedido {pedido.numero}
            {cancelado ? <Badge variant="destructive">Cancelado</Badge> : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatarData(pedido.data)} · {pedido.cliente.nome}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/vendas/pedidos/${pedido.numero}/recibo`} target="_blank" />}
          >
            Recibo (PDF)
          </Button>
          {situacaoCancelamento ? (
            <CancelarPedido pedidoId={pedido.id} numero={pedido.numero} situacao={situacaoCancelamento} />
          ) : null}
        </div>
      </div>

      {cancelado ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-sm">
          Cancelado em {pedido.canceladoEm?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}:{" "}
          {pedido.motivoCancelamento}
        </p>
      ) : null}

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Dado rotulo="Canal">{pedido.canal ? ROTULOS_CANAL_VENDA[pedido.canal] : "—"}</Dado>
            <Dado rotulo="Forma de pagamento">{ROTULOS_FORMA_PAGAMENTO_VENDA[pedido.formaPagamento]}</Dado>
            {pedido.formaPagamento === "A_PRAZO" ? (
              <Dado rotulo="Vencimento">{pedido.vencimento ? formatarData(pedido.vencimento) : "—"}</Dado>
            ) : (
              <Dado rotulo="Conta">{pedido.contaBancaria ? nomeDaContaBancaria(pedido.contaBancaria) : "—"}</Dado>
            )}
            <Dado rotulo="Classificação">
              {pedido.titulo ? ROTULOS_CLASSIFICACAO_FISCAL[pedido.titulo.classificacaoFiscal] : "—"}
              {pedido.numeroDocumentoFiscal ? ` · NF ${pedido.numeroDocumentoFiscal}` : ""}
            </Dado>
            <Dado rotulo="Lançado por">{pedido.usuario.nome}</Dado>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">kg</TableHead>
                <TableHead className="text-right">R$/kg</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pedido.itens.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.lote.produto.descricao}
                    {item.motivoLiberacaoVencido ? (
                      <p className="text-xs text-destructive">Lote vencido liberado: {item.motivoLiberacaoVencido}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <LinkRastreio codigo={item.lote.codigo} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{KG.format(Number(item.quantidadeKg))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(item.precoKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(item.valor)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(item.custo)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(item.margem)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(pedido.totais.valor)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(pedido.totais.custo)}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {formatarMoeda(pedido.totais.margem)} ({PERCENTUAL.format(pedido.totais.margemPercentual)})
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <SituacaoPagamentoBadge situacao={pedido.situacao} />
              {pedido.titulo ? (
                <span className="text-sm text-muted-foreground">Conta a receber {pedido.titulo.documento}</span>
              ) : null}
            </div>
            {pedido.titulo?.parcelas.map((parcela) => (
              <p key={parcela.id} className="text-sm">
                Vence {formatarData(parcela.dataVencimento)} · {formatarMoeda(parcela.valorAtualizado)}
              </p>
            ))}
            {podeExecutar(sessao.perfil, "titulo:ler") ? (
              <Link
                href={`/financeiro/contas-a-receber?contraparte=${pedido.clienteId}`}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Ver em Contas a receber
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entrega</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pedido.entrega ? (
              <>
                <dl className="grid grid-cols-2 gap-3">
                  <Dado rotulo="Status">{ROTULOS_STATUS_ENTREGA[pedido.entrega.status]}</Dado>
                  <Dado rotulo="Prevista">{formatarData(pedido.entrega.dataPrevista)}</Dado>
                  {pedido.entrega.dataRealizada ? (
                    <Dado rotulo="Entregue em">{formatarData(pedido.entrega.dataRealizada)}</Dado>
                  ) : null}
                  {atraso ? (
                    <Dado rotulo="Atraso">
                      <span className="font-medium text-destructive">{atraso} dia(s)</span>
                    </Dado>
                  ) : null}
                  <Dado rotulo="Endereço">{pedido.entrega.endereco ?? "—"}</Dado>
                  <Dado rotulo="Responsável">{pedido.entrega.responsavel ?? "—"}</Dado>
                  {pedido.entrega.recebidoPor ? (
                    <Dado rotulo="Recebido por">{pedido.entrega.recebidoPor}</Dado>
                  ) : null}
                  {pedido.entrega.observacao ? (
                    <Dado rotulo="Observação">{pedido.entrega.observacao}</Dado>
                  ) : null}
                </dl>
                <EntregaAcoes
                  podeEscrever={podeEscrever}
                  hoje={paraDataIso(hoje)}
                  entrega={{
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    status: pedido.entrega.status,
                    dataPrevista: paraDataIso(pedido.entrega.dataPrevista),
                    endereco: pedido.entrega.endereco,
                    responsavel: pedido.entrega.responsavel,
                    observacao: pedido.entrega.observacao,
                    recebidoPor: pedido.entrega.recebidoPor,
                  }}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">O cliente retira na propriedade.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Observação</CardTitle>
        </CardHeader>
        <CardContent>
          <ObservacaoPedido pedidoId={pedido.id} observacao={pedido.observacao} podeEditar={podeEscrever} />
        </CardContent>
      </Card>
    </div>
  );
}
