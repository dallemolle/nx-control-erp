import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar, requirePermission } from "@/server/auth/permissions";
import { listarRecepcoes, situacoesParaCancelar } from "@/server/services/recepcaoFruto";
import { obterConfiguracaoProducao } from "@/server/services/configuracaoProducao";
import { ORIGEM_RECEPCAO, ROTULOS_ORIGEM_RECEPCAO } from "@/lib/schemas/enums";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso, periodoDaUrl } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../_shared/exportar-links";
import { BarraDeFiltros } from "../_shared/barra-de-filtros";
import { NovaRecepcao, type OpcoesRecepcao } from "./recepcao-dialog-form";
import { LinkRastreio } from "../_shared/link-rastreio";
import { RecepcaoAcoes } from "./recepcao-acoes";

type SearchParams = { inicio?: string; fim?: string; fruta?: string; origem?: string };

const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export default async function RecepcaoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");
  const podeEscrever = podeExecutar(sessao.perfil, "producao:escrever") && sessao.podeAlterarFilial;

  const sp = await searchParams;
  const periodo = periodoDaUrl(sp);
  const origem = (ORIGEM_RECEPCAO as readonly string[]).includes(sp.origem ?? "")
    ? (sp.origem as (typeof ORIGEM_RECEPCAO)[number])
    : undefined;

  const [recepcoes, frutas] = await Promise.all([
    listarRecepcoes(sessao.filialId, { ...periodo, frutaId: sp.fruta || undefined, origem }),
    prisma.fruta.findMany({ where: { empresaId: sessao.empresaId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
  const situacoes = await situacoesParaCancelar(recepcoes);
  const opcoes = podeEscrever ? await carregarOpcoes(sessao.empresaId, sessao.filialId) : null;

  const valoresFiltro = {
    inicio: paraDataIso(periodo.inicio),
    fim: paraDataIso(periodo.fim),
    fruta: sp.fruta ?? "",
    origem: origem ?? "",
  };
  const query = new URLSearchParams(Object.entries(valoresFiltro).filter(([, v]) => v)).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Recepção de fruto</h1>
          <p className="text-sm text-muted-foreground">
            Cada carga recebida vira um lote com número, validade e entrada no estoque.
          </p>
        </div>
        {opcoes ? <NovaRecepcao opcoes={opcoes} /> : null}
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
            campo: "origem",
            rotulo: "Origem",
            rotuloTodos: "Todas",
            opcoes: ORIGEM_RECEPCAO.map((o) => ({ valor: o, rotulo: ROTULOS_ORIGEM_RECEPCAO[o] })),
          },
        ]}
      />
      <ExportarLinks baseHref="/producao/recepcao/export" queryString={query} />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="text-right">Bruto (kg)</TableHead>
              <TableHead className="text-right">Descarte</TableHead>
              <TableHead className="text-right">Líquido (kg)</TableHead>
              <TableHead className="text-right">R$/kg</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Qualidade</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recepcoes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma recepção no período.
                </TableCell>
              </TableRow>
            ) : null}
            {recepcoes.map((r) => {
              const bruto = Number(r.pesoBrutoKg);
              const descarte = Number(r.descarteKg);
              const cancelada = r.status === "CANCELADA";
              return (
                <TableRow key={r.id} className={cancelada ? "text-muted-foreground" : undefined}>
                  <TableCell>{formatarData(r.data)}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    <LinkRastreio codigo={r.lote.codigo} />
                    {cancelada ? (
                      <Badge variant="destructive" className="ml-2" title={r.motivoCancelamento ?? undefined}>
                        Excluída
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.produto.descricao}</TableCell>
                  <TableCell>
                    {ROTULOS_ORIGEM_RECEPCAO[r.origem]} · {r.origem === "PROPRIA" ? r.talhao?.nome : r.fornecedor?.nome}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{KG.format(bruto)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {bruto > 0 ? PERCENTUAL.format(descarte / bruto) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{KG.format(bruto - descarte)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(r.precoKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(r.valorTotal)}</TableCell>
                  <TableCell>{r.qualidade ?? "—"}</TableCell>
                  <TableCell>
                    <RecepcaoAcoes
                      podeEscrever={podeEscrever && !cancelada}
                      situacao={situacoes.get(r.id) ?? { podeCancelar: false }}
                      recepcao={{
                        id: r.id,
                        loteId: r.loteId,
                        codigoLote: r.lote.codigo,
                        qualidade: r.qualidade,
                        documento: r.documento,
                        observacao: r.observacao,
                      }}
                    />
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

async function carregarOpcoes(empresaId: string, filialId: string): Promise<OpcoesRecepcao> {
  const [produtos, talhoes, fornecedores, locais, safras, configuracao] = await Promise.all([
    prisma.produto.findMany({
      where: { empresaId, ativo: true, categoria: "FRUTO" },
      include: { fruta: { select: { custoPadraoKg: true } } },
      orderBy: { codigo: "asc" },
    }),
    prisma.talhao.findMany({
      where: { filialId, ativo: true },
      select: { id: true, nome: true, frutaId: true },
      orderBy: { nome: "asc" },
    }),
    prisma.fornecedor.findMany({
      where: { empresaId, ativo: true },
      select: { id: true, nome: true, classificacaoFiscalPadrao: true },
      orderBy: { nome: "asc" },
    }),
    prisma.localArmazenamento.findMany({
      where: { filialId, ativo: true },
      select: { id: true, nome: true, tipo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.safra.findMany({ where: { filialId, ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    obterConfiguracaoProducao(filialId),
  ]);
  return {
    produtos: produtos.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      frutaId: p.frutaId,
      validadeDias: p.validadeDias,
      unidadeComercial: p.unidadeComercial,
      fatorUnidadeKg: p.fatorUnidadeKg === null ? null : Number(p.fatorUnidadeKg),
      custoPadraoKg: Number(p.fruta.custoPadraoKg),
    })),
    talhoes,
    fornecedores,
    locais,
    safras,
    prazoPagamentoProdutorDias: configuracao.prazoPagamentoProdutorDias,
    hoje: paraDataIso(hojeDeCalendario()),
  };
}
