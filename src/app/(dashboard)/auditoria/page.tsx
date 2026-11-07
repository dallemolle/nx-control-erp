import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import {
  listarAuditoria,
  buscarOpcoesFiltroAuditoria,
  LIMITE_EXPORT_AUDITORIA,
  LIMITE_PDF_AUDITORIA,
} from "@/server/services/auditoria";
import { filtroAuditoriaDaUrl, paginaDaUrl, queryStringDoFiltroAuditoria } from "./filtro-auditoria-url";
import { ExportarLinks } from "../_shared/exportar-links";
import { BarraDeFiltrosAuditoria } from "./barra-de-filtros";
import { Paginacao } from "./paginacao";

/** Instante, não data de calendário: fuso de Brasília explícito (o servidor roda em UTC), igual ao export. */
function formatarData(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

const NUMERO = new Intl.NumberFormat("pt-BR");

function paramCru(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

type SearchParams = {
  entidade?: string | string[];
  acao?: string | string[];
  usuarioId?: string | string[];
  filialId?: string | string[];
  dataDe?: string | string[];
  dataAte?: string | string[];
  pagina?: string | string[];
};

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "auditoria:ler");

  const sp = await searchParams;
  const get = (campo: string) => paramCru((sp as Record<string, string | string[] | undefined>)[campo]);
  const filtro = filtroAuditoriaDaUrl(get);
  const pagina = paginaDaUrl(get);
  const filtroAtivo = Object.values(filtro).some((valor) => valor !== undefined);

  const [{ logs, totalPaginas }, opcoes] = await Promise.all([
    listarAuditoria(sessao, filtro, pagina),
    buscarOpcoesFiltroAuditoria(sessao),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Alterações registradas nesta empresa.</p>
      </div>

      <BarraDeFiltrosAuditoria opcoes={opcoes} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <ExportarLinks baseHref="/auditoria/export" queryString={queryStringDoFiltroAuditoria(get)} />
        <p className="text-xs text-muted-foreground">
          PDF: até {NUMERO.format(LIMITE_PDF_AUDITORIA)} registros mais recentes · CSV e Excel: até{" "}
          {NUMERO.format(LIMITE_EXPORT_AUDITORIA)}
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data/hora</TableHead>
            <TableHead>Usuário</TableHead>
            <TableHead>Filial</TableHead>
            <TableHead>Entidade</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Valor anterior</TableHead>
            <TableHead>Valor novo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap text-xs">{formatarData(log.criadoEm)}</TableCell>
              <TableCell className="text-xs">{log.usuario?.nome ?? "—"}</TableCell>
              <TableCell className="text-xs">{log.filial?.nome ?? "—"}</TableCell>
              <TableCell className="text-xs">{log.entidade}</TableCell>
              <TableCell className="text-xs">{log.acao}</TableCell>
              <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                {log.valorAnterior ? JSON.stringify(log.valorAnterior) : "—"}
              </TableCell>
              <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                {log.valorNovo ? JSON.stringify(log.valorNovo) : "—"}
              </TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {filtroAtivo
                  ? "Nenhum registro encontrado para os filtros selecionados"
                  : "Nenhum registro de auditoria ainda"}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Paginacao pagina={pagina} totalPaginas={totalPaginas} />
    </div>
  );
}
