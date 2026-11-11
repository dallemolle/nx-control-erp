import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar, requirePermission } from "@/server/auth/permissions";
import { listarOPs } from "@/server/services/ordemProducao";
import { ROTULOS_STATUS_ORDEM_PRODUCAO, STATUS_ORDEM_PRODUCAO } from "@/lib/schemas/enums";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso } from "@/lib/producao/periodo";
import { ROTULOS_VERIFICAR_OP, VERIFICAR_OP } from "@/lib/producao/op";
import { ExportarLinks } from "../../_shared/exportar-links";
import { BarraDeFiltros } from "../_shared/barra-de-filtros";
import { filtrosDasOPs, type ParametrosOPs } from "./filtros";
import { BranqueamentoBadge, KG, PERCENTUAL, StatusOPBadge, VerificacaoBadge } from "./formatos";
import { NovaOPDialog } from "./nova-op-dialog";

export default async function ProcessamentoPage({ searchParams }: { searchParams: Promise<ParametrosOPs> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");
  const podeEscrever = podeExecutar(sessao.perfil, "producao:escrever") && sessao.podeAlterarFilial;

  const sp = await searchParams;
  const filtros = filtrosDasOPs(sp);
  const [ops, frutas] = await Promise.all([
    listarOPs(sessao.filialId, filtros),
    prisma.fruta.findMany({
      where: { empresaId: sessao.empresaId },
      select: { id: true, nome: true, ativo: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const valoresFiltro = {
    inicio: paraDataIso(filtros.inicio),
    fim: paraDataIso(filtros.fim),
    fruta: filtros.frutaId ?? "",
    status: filtros.status ?? "",
    verificar: filtros.verificar ?? "",
  };
  const query = new URLSearchParams(Object.entries(valoresFiltro).filter(([, v]) => v)).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Processamento</h1>
          <p className="text-sm text-muted-foreground">
            Ordens de produção: fruto consumido, polpa produzida, insumos, rendimento e custo.
          </p>
        </div>
        {podeEscrever ? (
          <NovaOPDialog
            hoje={paraDataIso(hojeDeCalendario())}
            frutas={frutas.filter((f) => f.ativo).map((f) => ({ id: f.id, nome: f.nome }))}
          />
        ) : null}
      </div>

      <BarraDeFiltros
        valores={valoresFiltro}
        campos={[
          { tipo: "data", campo: "inicio", rotulo: "De" },
          { tipo: "data", campo: "fim", rotulo: "Até" },
          {
            tipo: "select",
            campo: "fruta",
            rotulo: "Fruta",
            rotuloTodos: "Todas",
            opcoes: frutas.map((f) => ({ valor: f.id, rotulo: f.nome })),
          },
          {
            tipo: "select",
            campo: "status",
            rotulo: "Status",
            rotuloTodos: "Todos",
            opcoes: STATUS_ORDEM_PRODUCAO.map((s) => ({ valor: s, rotulo: ROTULOS_STATUS_ORDEM_PRODUCAO[s] })),
          },
          {
            tipo: "select",
            campo: "verificar",
            rotulo: "A verificar",
            rotuloTodos: "Todas",
            opcoes: VERIFICAR_OP.map((v) => ({ valor: v, rotulo: ROTULOS_VERIFICAR_OP[v] })),
          },
        ]}
      />
      <ExportarLinks baseHref="/producao/processamento/export" queryString={query} />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Fruta</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="text-right">Fruto (kg)</TableHead>
              <TableHead className="text-right">Polpa (kg)</TableHead>
              <TableHead className="text-right">Rendimento</TableHead>
              <TableHead>Balanço</TableHead>
              <TableHead>Branqueamento</TableHead>
              <TableHead className="text-right">Custo/kg</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ops.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma OP no período.
                </TableCell>
              </TableRow>
            ) : null}
            {ops.map((op) => {
              const cancelada = op.status === "CANCELADA";
              return (
                <TableRow key={op.id} className={cancelada ? "text-muted-foreground" : undefined}>
                  <TableCell className="font-medium whitespace-nowrap">
                    <Link
                      href={`/producao/processamento/${op.numero}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {op.numero}
                    </Link>
                  </TableCell>
                  <TableCell>{formatarData(op.data)}</TableCell>
                  <TableCell>{op.fruta.nome}</TableCell>
                  <TableCell>{op.responsavel ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{KG.format(op.resumo.frutoKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{KG.format(op.resumo.polpaKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {op.resumo.rendimento === null ? "—" : PERCENTUAL.format(op.resumo.rendimento)}
                  </TableCell>
                  <TableCell>
                    <VerificacaoBadge status={op.resumo.balanco.status} />
                  </TableCell>
                  <TableCell>
                    <BranqueamentoBadge status={op.resumo.branqueamento} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatarMoeda(op.resumo.custo.custoKgPolpa)}
                    {op.status === "ABERTA" ? <span className="ml-1 text-xs text-muted-foreground">(prov.)</span> : null}
                  </TableCell>
                  <TableCell>
                    <StatusOPBadge status={op.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
