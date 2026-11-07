import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import {
  buscarOpcoesFiltroAuditoria,
  listarAuditoriaParaExport,
  LIMITE_EXPORT_AUDITORIA,
  LIMITE_PDF_AUDITORIA,
  type FiltroAuditoria,
} from "@/server/services/auditoria";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { type ColunaExport } from "@/lib/export/csv";
import { formatoExportDaUrl, responderExport } from "@/lib/export/responder";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { formatarData } from "@/lib/formatacao";
import { filtroAuditoriaDaUrl } from "../filtro-auditoria-url";

type LogAuditoria = Awaited<ReturnType<typeof listarAuditoriaParaExport>>["logs"][number];

const NUMERO = new Intl.NumberFormat("pt-BR");

/** Instante (não data de calendário): formatado no fuso de Brasília, como na tela. */
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
});

/** Valores anterior/novo em JSON completo — na tela eles aparecem truncados. */
const COLUNAS: ColunaExport<LogAuditoria>[] = [
  { rotulo: "Data/hora", valor: (l) => DATA_HORA.format(l.criadoEm) },
  { rotulo: "Usuário", valor: (l) => l.usuario?.nome ?? "" },
  { rotulo: "Filial", valor: (l) => l.filial?.nome ?? "" },
  { rotulo: "Entidade", valor: (l) => l.entidade },
  { rotulo: "ID do registro", valor: (l) => l.entidadeId },
  { rotulo: "Ação", valor: (l) => l.acao },
  { rotulo: "Valor anterior", valor: (l) => (l.valorAnterior ? JSON.stringify(l.valorAnterior) : "") },
  { rotulo: "Valor novo", valor: (l) => (l.valorNovo ? JSON.stringify(l.valorNovo) : "") },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "auditoria:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const filtro = filtroAuditoriaDaUrl((campo) => url.searchParams.get(campo) ?? undefined);
  const formato = url.searchParams.get("formato");
  const limite = formatoExportDaUrl(formato) === "pdf" ? LIMITE_PDF_AUDITORIA : LIMITE_EXPORT_AUDITORIA;
  const { logs, total } = await listarAuditoriaParaExport(sessao, filtro, limite);

  return responderExport(logs, COLUNAS, {
    nomeArquivo: "auditoria",
    nomeAba: "Auditoria",
    formato,
    cabecalhoPdf: async () =>
      cabecalhoDoRelatorio(sessao, {
        titulo: "Auditoria",
        consolidado: true,
        filtros: await descreverFiltro(sessao, filtro),
        avisos:
          total > logs.length
            ? [
                `Mostrando os ${NUMERO.format(logs.length)} registros mais recentes de ${NUMERO.format(total)}. ` +
                  "Para o restante, filtre por período ou exporte em Excel/CSV.",
              ]
            : [],
      }),
  });
}

/** Usuário e filial chegam como id na URL — o PDF mostra o nome. */
async function descreverFiltro(sessao: SessaoAtiva, filtro: FiltroAuditoria): Promise<(string | null)[]> {
  const opcoes = filtro.usuarioId || filtro.filialId ? await buscarOpcoesFiltroAuditoria(sessao) : null;
  const nomeDe = (lista: { id: string; nome: string }[] | undefined, id: string) =>
    lista?.find((item) => item.id === id)?.nome ?? id;

  return [
    filtro.entidade ? `Entidade: ${filtro.entidade}` : null,
    filtro.acao ? `Ação: ${filtro.acao}` : null,
    filtro.usuarioId ? `Usuário: ${nomeDe(opcoes?.usuarios, filtro.usuarioId)}` : null,
    filtro.filialId ? `Filial: ${nomeDe(opcoes?.filiais, filtro.filialId)}` : null,
    filtro.dataDe ? `De: ${formatarData(filtro.dataDe)}` : null,
    filtro.dataAte ? `Até: ${formatarData(filtro.dataAte)}` : null,
  ];
}
