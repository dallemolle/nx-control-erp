import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarAuditoriaParaExport } from "@/server/services/auditoria";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { filtroAuditoriaDaUrl } from "../filtro-auditoria-url";

type LogAuditoria = Awaited<ReturnType<typeof listarAuditoriaParaExport>>[number];

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
  const logs = await listarAuditoriaParaExport(sessao, filtro);

  return responderExport(logs, COLUNAS, {
    nomeArquivo: "auditoria",
    nomeAba: "Auditoria",
    formato: url.searchParams.get("formato"),
  });
}
