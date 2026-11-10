import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar, requirePermission } from "@/server/auth/permissions";
import { listarPedidos } from "@/server/services/pedidoVenda";
import {
  ROTULOS_CANAL_VENDA,
  ROTULOS_FORMA_PAGAMENTO_VENDA,
  ROTULOS_STATUS_ENTREGA,
  ROTULOS_STATUS_PEDIDO_VENDA,
  STATUS_PEDIDO_VENDA,
} from "@/lib/schemas/enums";
import { calcularPedido, ROTULOS_SITUACAO_PAGAMENTO, SITUACOES_PAGAMENTO } from "@/lib/producao/venda";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../_shared/exportar-links";
import { BarraDeFiltros } from "../../producao/_shared/barra-de-filtros";
import { PERCENTUAL, SituacaoPagamentoBadge } from "../_shared/formatos";
import { filtrosDePedidos, type ParametrosPedidos } from "./filtros";

export default async function PedidosPage({ searchParams }: { searchParams: Promise<ParametrosPedidos> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "venda:ler");
  const podeEscrever = podeExecutar(sessao.perfil, "venda:escrever") && sessao.podeAlterarFilial;

  const sp = await searchParams;
  const filtros = filtrosDePedidos(sp);
  const [pedidos, clientes] = await Promise.all([
    listarPedidos(sessao.filialId, filtros, hojeDeCalendario()),
    prisma.cliente.findMany({
      where: { empresaId: sessao.empresaId },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const valoresFiltro = {
    inicio: paraDataIso(filtros.inicio),
    fim: paraDataIso(filtros.fim),
    cliente: filtros.clienteId ?? "",
    status: filtros.status ?? "",
    situacao: filtros.situacao ?? "",
  };
  const query = new URLSearchParams(Object.entries(valoresFiltro).filter(([, v]) => v)).toString();

  // Totais só dos pedidos confirmados: o cancelado não é venda.
  const confirmados = pedidos.filter((p) => p.status === "CONFIRMADO");
  const totais = calcularPedido(
    confirmados.flatMap((p) =>
      p.itens.map((i) => ({ quantidadeKg: Number(i.quantidadeKg), precoKg: Number(i.precoKg), custoKg: Number(i.custoKg) })),
    ),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Pedidos de venda</h1>
          <p className="text-sm text-muted-foreground">
            Cada pedido baixa o estoque por lote e cria a conta a receber; à vista, já recebida.
          </p>
        </div>
        {podeEscrever ? <Button nativeButton={false} render={<Link href="/vendas/pedidos/novo" />}>Novo pedido</Button> : null}
      </div>

      <BarraDeFiltros
        valores={valoresFiltro}
        campos={[
          { tipo: "data", campo: "inicio", rotulo: "De" },
          { tipo: "data", campo: "fim", rotulo: "Até" },
          {
            tipo: "select",
            campo: "cliente",
            rotulo: "Cliente",
            rotuloTodos: "Todos",
            opcoes: clientes.map((c) => ({ valor: c.id, rotulo: c.nome })),
          },
          {
            tipo: "select",
            campo: "status",
            rotulo: "Status",
            rotuloTodos: "Todos",
            opcoes: STATUS_PEDIDO_VENDA.map((s) => ({ valor: s, rotulo: ROTULOS_STATUS_PEDIDO_VENDA[s] })),
          },
          {
            tipo: "select",
            campo: "situacao",
            rotulo: "Pagamento",
            rotuloTodos: "Todas",
            opcoes: SITUACOES_PAGAMENTO.map((s) => ({ valor: s, rotulo: ROTULOS_SITUACAO_PAGAMENTO[s] })),
          },
        ]}
      />
      <ExportarLinks baseHref="/vendas/pedidos/export" queryString={query} />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Entrega</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pedidos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum pedido no período.
                </TableCell>
              </TableRow>
            ) : null}
            {pedidos.map((p) => {
              const cancelado = p.status === "CANCELADO";
              return (
                <TableRow key={p.id} className={cancelado ? "text-muted-foreground" : undefined}>
                  <TableCell className="font-medium whitespace-nowrap">
                    <Link
                      href={`/vendas/pedidos/${p.numero}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {p.numero}
                    </Link>
                    {cancelado ? (
                      <Badge variant="destructive" className="ml-2" title={p.motivoCancelamento ?? undefined}>
                        {ROTULOS_STATUS_PEDIDO_VENDA.CANCELADO}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatarData(p.data)}</TableCell>
                  <TableCell>{p.cliente.nome}</TableCell>
                  <TableCell>{p.canal ? ROTULOS_CANAL_VENDA[p.canal] : "—"}</TableCell>
                  <TableCell>{ROTULOS_FORMA_PAGAMENTO_VENDA[p.formaPagamento]}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(p.valor)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatarMoeda(p.margem)}{" "}
                    <span className="text-muted-foreground">({PERCENTUAL.format(p.margemPercentual)})</span>
                  </TableCell>
                  <TableCell>
                    <SituacaoPagamentoBadge situacao={p.situacao} />
                  </TableCell>
                  <TableCell>{p.entrega ? ROTULOS_STATUS_ENTREGA[p.entrega.status] : "Retira"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {confirmados.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>
                  Total dos confirmados ({confirmados.length}) · custo {formatarMoeda(totais.custo)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(totais.valor)}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {formatarMoeda(totais.margem)}{" "}
                  <span className="text-muted-foreground">({PERCENTUAL.format(totais.margemPercentual)})</span>
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </div>
  );
}
