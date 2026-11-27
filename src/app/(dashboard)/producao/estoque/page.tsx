import Link from "next/link";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeEscreverCadastroProducao, podeExecutar, requirePermission } from "@/server/auth/permissions";
import { liberacaoCobre, situacaoLiberacao } from "@/lib/producao/liberacaoVencido";
import { loteVencidoNaData } from "@/lib/producao/venda";
import { listarLotes, resumoPorStatus, resumoProdutoLocal } from "@/server/services/estoque";
import { ROTULOS_STATUS_LOTE, STATUS_LOTE } from "@/lib/producao/statusLote";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso } from "@/lib/producao/periodo";
import { cn } from "@/lib/utils";
import { ExportarLinks } from "../../_shared/exportar-links";
import { BarraDeFiltros } from "../_shared/barra-de-filtros";
import { LinkRastreio } from "../_shared/link-rastreio";
import { StatusLoteBadge } from "../_shared/status-lote-badge";
import { TransferirLoteDialog } from "./transferir-lote-dialog";
import { LiberarLoteDialog, RevogarLiberacaoDialog } from "./liberar-lote-dialog";
import { filtrosDoEstoque, type ParametrosEstoque } from "./filtros";
import { ResumoStatusEstoque } from "./resumo-status";

const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export default async function EstoquePage({ searchParams }: { searchParams: Promise<ParametrosEstoque> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");
  const podeTransferir = podeExecutar(sessao.perfil, "producao:escrever") && sessao.podeAlterarFilial;
  const permissoesLote = {
    podeTransferir,
    podeLiberar: podeExecutar(sessao.perfil, "estoque:liberarVencido") && sessao.podeAlterarFilial,
    podeEditarProduto: podeEscreverCadastroProducao(sessao.perfil, sessao.podeAlterarFilial),
  };

  const sp = await searchParams;
  const visao = sp.visao === "resumo" ? "resumo" : "lotes";
  const { filtros, referencia } = filtrosDoEstoque(sp);

  // Na visão por produto e local não há filtro de produto/local: o resumo é da filial toda.
  const filtroResumo = visao === "lotes" ? { produtoId: filtros.produtoId, localId: filtros.localId } : {};
  const [produtos, locais, resumo] = await Promise.all([
    prisma.produto.findMany({
      where: { empresaId: sessao.empresaId },
      select: { id: true, codigo: true, descricao: true },
      orderBy: { codigo: "asc" },
    }),
    prisma.localArmazenamento.findMany({
      where: { filialId: sessao.filialId, ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    resumoPorStatus(sessao.filialId, filtroResumo, referencia, { saldoNaData: true }),
  ]);
  const ehHoje = paraDataIso(referencia) === paraDataIso(hojeDeCalendario());

  const valoresFiltro = {
    produto: sp.produto ?? "",
    local: sp.local ?? "",
    status: filtros.status ?? "",
    zerados: filtros.incluirZerados ? "1" : "",
    referencia: paraDataIso(referencia),
  };
  const query = new URLSearchParams(Object.entries(valoresFiltro).filter(([, v]) => v)).toString();
  const hrefVisao = (v: string) => `/producao/estoque?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(query)), visao: v })}`;
  // O cartão sempre abre a lista por lote, que é onde o status filtra.
  const hrefStatus = (s: string) =>
    `/producao/estoque?${new URLSearchParams(Object.entries({ ...valoresFiltro, status: s }).filter(([, v]) => v))}`;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold">Estoque</h1>
          <BotaoAjuda tela="estoque" />
        </div>
        <p className="text-sm text-muted-foreground">
          Saldo por lote, em ordem de validade (o que vence primeiro sai primeiro).
        </p>
      </div>

      {ehHoje ? null : (
        <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Estoque em {formatarData(referencia)}: saldos somando as movimentações até esse dia. Custo e local são os de
          hoje; transferir e liberar usam o saldo de hoje.{" "}
          <Link
            href={`/producao/estoque?${new URLSearchParams({
              ...Object.fromEntries(new URLSearchParams(query)),
              referencia: paraDataIso(hojeDeCalendario()),
              ...(visao === "resumo" ? { visao } : {}),
            })}`}
            className="underline underline-offset-4"
          >
            Voltar para hoje
          </Link>
        </p>
      )}

      <ResumoStatusEstoque
        resumo={resumo}
        ativo={visao === "lotes" ? (filtros.status ?? "") : ""}
        hrefStatus={hrefStatus}
      />

      <div className="flex flex-wrap gap-2" role="tablist">
        {(["lotes", "resumo"] as const).map((v) => (
          <Button
            key={v}
            variant={visao === v ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={<Link href={hrefVisao(v)} />}
            aria-selected={visao === v}
            role="tab"
          >
            {v === "lotes" ? "Por lote" : "Por produto e local"}
          </Button>
        ))}
      </div>

      {visao === "lotes" ? (
        <VisaoLotes
          filialId={sessao.filialId}
          filtros={filtros}
          referencia={referencia}
          valoresFiltro={valoresFiltro}
          query={query}
          produtos={produtos}
          locais={locais}
          permissoes={permissoesLote}
        />
      ) : (
        <VisaoResumo
          filialId={sessao.filialId}
          referencia={referencia}
          queryExport={`referencia=${paraDataIso(referencia)}&visao=resumo`}
        />
      )}
    </div>
  );
}

async function VisaoLotes({
  filialId,
  filtros,
  referencia,
  valoresFiltro,
  query,
  produtos,
  locais,
  permissoes,
}: {
  filialId: string;
  filtros: ReturnType<typeof filtrosDoEstoque>["filtros"];
  referencia: Date;
  valoresFiltro: Record<string, string>;
  query: string;
  produtos: { id: string; codigo: string; descricao: string }[];
  locais: { id: string; nome: string }[];
  permissoes: { podeTransferir: boolean; podeLiberar: boolean; podeEditarProduto: boolean };
}) {
  const { podeTransferir, podeLiberar, podeEditarProduto } = permissoes;
  // Liberação usa o dia de hoje, não a data de referência da consulta (D-35).
  const hoje = hojeDeCalendario();
  const lotes = await listarLotes(filialId, filtros, referencia, { saldoNaData: true });
  // Ações agem sobre o lote de agora: usam o saldo de hoje, não o da data de referência.
  const linhas = lotes.map((lote) => ({
    lote,
    liberado: liberacaoCobre(lote.liberadoAte, hoje),
    liberavel: podeLiberar && lote.saldoAtualKg > 0 && !lote.bloqueio && loteVencidoNaData(lote.validade, hoje),
  }));
  const totalKg = lotes.reduce((soma, l) => soma + Math.max(0, l.saldoKg), 0);
  const totalValor = lotes.reduce((soma, l) => soma + l.valor, 0);

  return (
    <>
      <BarraDeFiltros
        valores={valoresFiltro}
        campos={[
          {
            tipo: "select",
            campo: "produto",
            rotulo: "Produto",
            rotuloTodos: "Todos",
            opcoes: produtos.map((p) => ({ valor: p.id, rotulo: `${p.codigo} · ${p.descricao}` })),
          },
          {
            tipo: "select",
            campo: "local",
            rotulo: "Local",
            rotuloTodos: "Todos",
            opcoes: locais.map((l) => ({ valor: l.id, rotulo: l.nome })),
          },
          {
            tipo: "select",
            campo: "status",
            rotulo: "Status",
            rotuloTodos: "Todos",
            opcoes: STATUS_LOTE.map((s) => ({ valor: s, rotulo: ROTULOS_STATUS_LOTE[s] })),
          },
          { tipo: "data", campo: "referencia", rotulo: "Data de referência" },
          { tipo: "checkbox", campo: "zerados", rotulo: "Mostrar zerados" },
        ]}
      />
      <ExportarLinks baseHref="/producao/estoque/export" queryString={query} />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lote</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead className="text-right">Dias</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Saldo (kg)</TableHead>
              <TableHead className="text-right">Custo/kg</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum lote com esses filtros.
                </TableCell>
              </TableRow>
            ) : null}
            {linhas.map(({ lote, liberado, liberavel }) => (
              <TableRow key={lote.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  <LinkRastreio codigo={lote.codigo} />
                </TableCell>
                <TableCell>{lote.produto.descricao}</TableCell>
                <TableCell>{lote.local.nome}</TableCell>
                <TableCell>{formatarData(lote.data)}</TableCell>
                <TableCell>{formatarData(lote.validade)}</TableCell>
                <TableCell className={cn("text-right tabular-nums", lote.dias < 0 && "text-destructive")}>
                  {lote.dias}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <StatusLoteBadge status={lote.status} />
                    {lote.emProducao ? <Badge variant="outline">Em produção</Badge> : null}
                  </div>
                  {liberado && lote.liberadoAte ? (
                    <p
                      className="mt-1 text-xs text-muted-foreground"
                      title={`Liberado por ${lote.liberadoPor?.nome ?? "—"}${
                        lote.liberadoEm ? ` em ${formatarData(lote.liberadoEm)}` : ""
                      }: ${lote.motivoLiberacao ?? ""}`}
                    >
                      Movimentação liberada até {formatarData(lote.liberadoAte)}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{KG.format(lote.saldoKg)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(lote.custoKg)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(lote.valor)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {lote.bloqueio ? null : (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/producao/lotes/${lote.id}/etiqueta`} target="_blank" />}
                      >
                        Etiqueta
                      </Button>
                    )}
                    {podeTransferir && lote.saldoAtualKg > 0 ? (
                      <TransferirLoteDialog
                        lote={{ id: lote.id, codigo: lote.codigo, localId: lote.localId, saldoKg: lote.saldoAtualKg }}
                        locais={locais}
                      />
                    ) : null}
                    {liberavel && liberado && lote.liberadoAte ? (
                      <RevogarLiberacaoDialog lote={{ id: lote.id, codigo: lote.codigo }} liberadoAte={lote.liberadoAte} />
                    ) : null}
                    {liberavel && !liberado ? (
                      <LiberarLoteDialog
                        lote={{ id: lote.id, codigo: lote.codigo }}
                        situacao={situacaoLiberacao(lote.validade, lote.produto.diasLiberacaoVencido, hoje)}
                        podeEditarProduto={podeEditarProduto}
                      />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {lotes.length > 0 ? (
            <tfoot>
              <TableRow className="font-medium">
                <TableCell colSpan={7}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{KG.format(totalKg)}</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{formatarMoeda(totalValor)}</TableCell>
                <TableCell />
              </TableRow>
            </tfoot>
          ) : null}
        </Table>
      </div>
    </>
  );
}

async function VisaoResumo({
  filialId,
  referencia,
  queryExport,
}: {
  filialId: string;
  referencia: Date;
  queryExport: string;
}) {
  const { linhas, locais } = await resumoProdutoLocal(filialId, referencia);
  return (
    <div className="space-y-6">
      <ExportarLinks baseHref="/producao/estoque/export" queryString={queryExport} />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Local</TableHead>
              <TableHead className="text-right">Saldo (kg)</TableHead>
              <TableHead className="text-right">Valor a custo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum lote com saldo.
                </TableCell>
              </TableRow>
            ) : null}
            {linhas.map((l) => (
              <TableRow key={`${l.produtoId}-${l.localId}`}>
                <TableCell>{l.produto}</TableCell>
                <TableCell>{l.local}</TableCell>
                <TableCell className="text-right tabular-nums">{KG.format(l.saldoKg)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Ocupação dos locais</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Local</TableHead>
                <TableHead className="text-right">Saldo (kg)</TableHead>
                <TableHead className="text-right">Capacidade (kg)</TableHead>
                <TableHead className="text-right">Ocupação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locais.map((l) => (
                <TableRow key={l.localId}>
                  <TableCell>{l.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{KG.format(l.saldoKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.capacidadeKg === null ? "—" : KG.format(l.capacidadeKg)}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", (l.ocupacao ?? 0) > 1 && "text-destructive")}>
                    {l.ocupacao === null ? "—" : PERCENTUAL.format(l.ocupacao)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
