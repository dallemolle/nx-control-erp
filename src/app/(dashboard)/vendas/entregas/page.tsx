import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar, requirePermission } from "@/server/auth/permissions";
import { listarEntregas } from "@/server/services/entrega";
import { ROTULOS_STATUS_ENTREGA, STATUS_ENTREGA } from "@/lib/schemas/enums";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../_shared/exportar-links";
import { BarraDeFiltros } from "../../producao/_shared/barra-de-filtros";
import { EntregaAcoes } from "../_shared/entrega-acoes";
import { filtrosDeEntregas, TODAS, type ParametrosEntregas } from "./filtros";

export default async function EntregasPage({ searchParams }: { searchParams: Promise<ParametrosEntregas> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "venda:ler");
  const podeEscrever = podeExecutar(sessao.perfil, "venda:escrever") && sessao.podeAlterarFilial;

  const sp = await searchParams;
  const filtros = filtrosDeEntregas(sp);
  const hoje = hojeDeCalendario();
  const entregas = await listarEntregas(sessao.filialId, filtros, hoje);

  const valoresFiltro = {
    // Só valores válidos voltam para a URL; o resto cai no padrão.
    status: filtros.status ? (sp.status ?? "") : "",
    inicio: filtros.inicio ? paraDataIso(filtros.inicio) : "",
    fim: filtros.fim ? paraDataIso(filtros.fim) : "",
    atraso: filtros.atrasadas ? "1" : "",
  };
  const query = new URLSearchParams(Object.entries(valoresFiltro).filter(([, v]) => v)).toString();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Entregas</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos que não são retirados na propriedade. O atraso conta a partir da data prevista.
        </p>
      </div>

      <BarraDeFiltros
        valores={valoresFiltro}
        campos={[
          {
            tipo: "select",
            campo: "status",
            rotulo: "Status",
            rotuloTodos: "Pendentes e em rota",
            opcoes: [
              ...STATUS_ENTREGA.map((s) => ({ valor: s, rotulo: ROTULOS_STATUS_ENTREGA[s] })),
              { valor: TODAS, rotulo: "Todas" },
            ],
          },
          { tipo: "data", campo: "inicio", rotulo: "Prevista de" },
          { tipo: "data", campo: "fim", rotulo: "Até" },
          { tipo: "checkbox", campo: "atraso", rotulo: "Só atrasadas" },
        ]}
      />
      <ExportarLinks baseHref="/vendas/entregas/export" queryString={query} />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prevista</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Atraso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entregas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma entrega com esses filtros.
                </TableCell>
              </TableRow>
            ) : null}
            {entregas.map((e) => (
              <TableRow key={e.pedidoId}>
                <TableCell className="whitespace-nowrap">{formatarData(e.dataPrevista)}</TableCell>
                <TableCell>
                  <Link
                    href={`/vendas/pedidos/${e.pedido.numero}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {e.pedido.numero}
                  </Link>
                </TableCell>
                <TableCell>{e.pedido.cliente.nome}</TableCell>
                <TableCell>{e.endereco ?? "—"}</TableCell>
                <TableCell>{e.responsavel ?? "—"}</TableCell>
                <TableCell>{ROTULOS_STATUS_ENTREGA[e.status]}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.atraso === null ? (
                    "—"
                  ) : e.atraso > 0 ? (
                    <span className="font-medium text-destructive">{e.atraso} d</span>
                  ) : (
                    "0"
                  )}
                </TableCell>
                <TableCell>
                  <EntregaAcoes
                    podeEscrever={podeEscrever}
                    hoje={paraDataIso(hoje)}
                    entrega={{
                      pedidoId: e.pedidoId,
                      numero: e.pedido.numero,
                      status: e.status,
                      dataPrevista: paraDataIso(e.dataPrevista),
                      endereco: e.endereco,
                      responsavel: e.responsavel,
                      observacao: e.observacao,
                      recebidoPor: e.recebidoPor,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
