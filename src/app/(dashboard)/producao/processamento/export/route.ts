import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { listarOPs, type OPListada } from "@/server/services/ordemProducao";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { ROTULOS_STATUS_ORDEM_PRODUCAO } from "@/lib/schemas/enums";
import {
  ROTULOS_STATUS_BRANQUEAMENTO,
  ROTULOS_STATUS_VERIFICACAO,
  ROTULOS_VERIFICAR_OP,
} from "@/lib/producao/op";
import { formatarData } from "@/lib/formatacao";
import { filtrosDasOPs } from "../filtros";

const COLUNAS: ColunaExport<OPListada>[] = [
  { rotulo: "Nº", valor: (op) => op.numero },
  { rotulo: "Data", valor: (op) => op.data },
  { rotulo: "Fruta", valor: (op) => op.fruta.nome },
  { rotulo: "Responsável", valor: (op) => op.responsavel ?? "" },
  { rotulo: "Fruto (kg)", valor: (op) => op.resumo.frutoKg },
  { rotulo: "Polpa (kg)", valor: (op) => op.resumo.polpaKg },
  {
    rotulo: "Rendimento (%)",
    tipo: "percentual",
    valor: (op) => (op.resumo.rendimento === null ? "" : op.resumo.rendimento * 100),
  },
  { rotulo: "Balanço (kg)", valor: (op) => op.resumo.balanco.diferencaKg },
  {
    rotulo: "Balanço (%)",
    tipo: "percentual",
    valor: (op) => (op.resumo.balanco.percentual === null ? "" : op.resumo.balanco.percentual * 100),
  },
  { rotulo: "Balanço", valor: (op) => ROTULOS_STATUS_VERIFICACAO[op.resumo.balanco.status] },
  { rotulo: "Branqueamento", valor: (op) => ROTULOS_STATUS_BRANQUEAMENTO[op.resumo.branqueamento] },
  { rotulo: "Custo total", valor: (op) => op.resumo.custo.custoTotal },
  { rotulo: "Custo/kg", valor: (op) => op.resumo.custo.custoKgPolpa },
  { rotulo: "Status", valor: (op) => ROTULOS_STATUS_ORDEM_PRODUCAO[op.status] },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const filtros = filtrosDasOPs(Object.fromEntries(url.searchParams));
  const ops = await listarOPs(sessao.filialId, filtros);

  return responderExport(ops, COLUNAS, {
    nomeArquivo: "ordens-de-producao",
    nomeAba: "OPs",
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: async () => {
      const fruta = filtros.frutaId
        ? await prisma.fruta.findFirst({
            where: { id: filtros.frutaId, empresaId: sessao.empresaId },
            select: { nome: true },
          })
        : null;
      return cabecalhoDoRelatorio(sessao, {
        titulo: "Ordens de produção",
        filtros: [
          `Período: ${formatarData(filtros.inicio)} a ${formatarData(filtros.fim)}`,
          fruta ? `Fruta: ${fruta.nome}` : null,
          filtros.status ? `Status: ${ROTULOS_STATUS_ORDEM_PRODUCAO[filtros.status]}` : null,
          filtros.verificar ? `A verificar: ${ROTULOS_VERIFICAR_OP[filtros.verificar]}` : null,
        ],
      });
    },
  });
}
