import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar, requirePermission } from "@/server/auth/permissions";
import { listarAjustes } from "@/server/services/ajusteEstoque";
import { listarLotes } from "@/server/services/estoque";
import {
  MOTIVO_AJUSTE_ESTOQUE,
  ROTULOS_MOTIVO_AJUSTE,
} from "@/lib/schemas/enums";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso } from "@/lib/producao/periodo";
import { cn } from "@/lib/utils";
import { ExportarLinks } from "../../_shared/exportar-links";
import { BarraDeFiltros } from "../_shared/barra-de-filtros";
import { Badge } from "@/components/ui/badge";
import { AjusteDialogForm } from "./ajuste-dialog-form";
import { EstornarAjusteDialog } from "./estornar-ajuste-dialog";
import { filtrosDosAjustes, type ParametrosAjustes } from "./filtros";

const KG = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
  signDisplay: "exceptZero",
});
const KG_SALDO = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export default async function AjustesPage({
  searchParams,
}: {
  searchParams: Promise<ParametrosAjustes>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");
  const podeAjustar =
    podeExecutar(sessao.perfil, "estoque:ajustar") && sessao.podeAlterarFilial;

  const sp = await searchParams;
  const filtros = filtrosDosAjustes(sp);
  const hoje = hojeDeCalendario();

  const [ajustes, lotes] = await Promise.all([
    listarAjustes(sessao.filialId, filtros),
    podeAjustar
      ? listarLotes(sessao.filialId, { incluirZerados: true }, hoje)
      : Promise.resolve([]),
  ]);

  const valoresFiltro = {
    inicio: paraDataIso(filtros.inicio),
    fim: paraDataIso(filtros.fim),
    motivo: filtros.motivo ?? "",
  };
  const query = new URLSearchParams(
    Object.entries(valoresFiltro).filter(([, v]) => v),
  ).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-lg font-semibold">Ajustes de estoque</h1>
            <BotaoAjuda tela="ajustes" />
          </div>
          <p className="text-sm text-muted-foreground">
            Baixas por vencimento, avaria, amostra ou consumo, e acertos de
            inventário.
          </p>
        </div>
        {podeAjustar ? (
          <AjusteDialogForm
            hoje={paraDataIso(hoje)}
            lotes={lotes
              .filter((l) => l.recepcao?.status !== "CANCELADA" && !l.bloqueio)
              .map((l) => ({
                id: l.id,
                saldoKg: Number(l.saldoKg),
                rotulo: `${l.codigo} · ${KG_SALDO.format(Number(l.saldoKg))} kg · vence ${formatarData(l.validade)}`,
              }))}
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
            campo: "motivo",
            rotulo: "Motivo",
            rotuloTodos: "Todos",
            opcoes: MOTIVO_AJUSTE_ESTOQUE.map((m) => ({
              valor: m,
              rotulo: ROTULOS_MOTIVO_AJUSTE[m],
            })),
          },
        ]}
      />
      <ExportarLinks baseHref="/producao/ajustes/export" queryString={query} />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Quantidade (kg)</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Observação</TableHead>
              <TableHead>Usuário</TableHead>
              {podeAjustar ? <TableHead className="text-right">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ajustes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={podeAjustar ? 8 : 7}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Nenhum ajuste no período.
                </TableCell>
              </TableRow>
            ) : null}
            {ajustes.map((a) => {
              const kg = Number(a.quantidadeKg);
              const estornado = a.estornadoEm !== null;
              return (
                <TableRow key={a.id} className={cn(estornado && "text-muted-foreground")}>
                  <TableCell>{formatarData(a.data)}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    {a.lote.codigo}
                  </TableCell>
                  <TableCell>{a.produto.descricao}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      estornado ? "line-through" : kg < 0 && "text-destructive",
                    )}
                  >
                    {KG.format(kg)}
                  </TableCell>
                  <TableCell>
                    {ROTULOS_MOTIVO_AJUSTE[a.motivo]}
                    {a.estornadoEm ? (
                      <div className="mt-1 space-y-0.5">
                        <Badge variant="outline">Estornado</Badge>
                        <p className="text-xs">
                          {formatarData(a.estornadoEm)} por {a.estornadoPor?.nome ?? "—"}: {a.motivoEstorno}
                        </p>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{a.observacao ?? "—"}</TableCell>
                  <TableCell>{a.usuario.nome}</TableCell>
                  {podeAjustar ? (
                    <TableCell className="text-right">
                      {estornado ? null : (
                        <EstornarAjusteDialog
                          ajuste={{
                            id: a.id,
                            lote: a.lote.codigo,
                            descricao:
                              `${kg < 0 ? "Saída" : "Entrada"} de ${KG_SALDO.format(Math.abs(kg))} kg ` +
                              `em ${formatarData(a.data)} (${ROTULOS_MOTIVO_AJUSTE[a.motivo]})`,
                          }}
                        />
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
