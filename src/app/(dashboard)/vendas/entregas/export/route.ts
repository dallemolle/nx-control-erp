import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarEntregas, type EntregaListada } from "@/server/services/entrega";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { ROTULOS_STATUS_ENTREGA } from "@/lib/schemas/enums";
import { formatarData } from "@/lib/formatacao";
import { hojeDeCalendario } from "@/lib/producao/periodo";
import { filtrosDeEntregas } from "../filtros";

const COLUNAS: ColunaExport<EntregaListada>[] = [
  { rotulo: "Data prevista", valor: (e) => e.dataPrevista },
  { rotulo: "Pedido", tipo: "inteiro", valor: (e) => e.pedido.numero },
  { rotulo: "Cliente", valor: (e) => e.pedido.cliente.nome },
  { rotulo: "Endereço", valor: (e) => e.endereco ?? "" },
  { rotulo: "Responsável", valor: (e) => e.responsavel ?? "" },
  { rotulo: "Status", valor: (e) => ROTULOS_STATUS_ENTREGA[e.status] },
  { rotulo: "Data realizada", valor: (e) => e.dataRealizada ?? "" },
  { rotulo: "Recebido por", valor: (e) => e.recebidoPor ?? "" },
  { rotulo: "Atraso (dias)", tipo: "inteiro", valor: (e) => e.atraso ?? "" },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "venda:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const filtros = filtrosDeEntregas(Object.fromEntries(url.searchParams));
  const entregas = await listarEntregas(sessao.filialId, filtros, hojeDeCalendario());

  return responderExport(entregas, COLUNAS, {
    nomeArquivo: "entregas",
    nomeAba: "Entregas",
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: () =>
      cabecalhoDoRelatorio(sessao, {
        titulo: "Entregas",
        filtros: [
          `Status: ${
            filtros.status ? filtros.status.map((s) => ROTULOS_STATUS_ENTREGA[s]).join(", ") : "Pendentes e em rota"
          }`,
          filtros.inicio ? `Prevista de: ${formatarData(filtros.inicio)}` : null,
          filtros.fim ? `Prevista até: ${formatarData(filtros.fim)}` : null,
        ],
      }),
  });
}
