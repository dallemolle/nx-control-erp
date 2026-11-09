import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { listarRecepcoes, type RecepcaoListada } from "@/server/services/recepcaoFruto";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { ORIGEM_RECEPCAO, ROTULOS_ORIGEM_RECEPCAO } from "@/lib/schemas/enums";
import { formatarData } from "@/lib/formatacao";
import { periodoDaUrl } from "@/lib/producao/periodo";

const COLUNAS: ColunaExport<RecepcaoListada>[] = [
  { rotulo: "Data", valor: (r) => r.data },
  { rotulo: "Lote", valor: (r) => r.lote.codigo },
  { rotulo: "Produto", valor: (r) => r.produto.descricao },
  { rotulo: "Fruta", valor: (r) => r.produto.fruta.nome },
  { rotulo: "Origem", valor: (r) => ROTULOS_ORIGEM_RECEPCAO[r.origem] },
  { rotulo: "Talhão/Fornecedor", valor: (r) => (r.origem === "PROPRIA" ? r.talhao?.nome : r.fornecedor?.nome) ?? "" },
  { rotulo: "Bruto (kg)", valor: (r) => Number(r.pesoBrutoKg) },
  { rotulo: "Descarte (kg)", valor: (r) => Number(r.descarteKg) },
  {
    rotulo: "Descarte (%)",
    tipo: "percentual",
    valor: (r) => (Number(r.pesoBrutoKg) > 0 ? Number(r.descarteKg) / Number(r.pesoBrutoKg) : 0),
  },
  { rotulo: "Líquido (kg)", valor: (r) => Number(r.pesoBrutoKg) - Number(r.descarteKg) },
  { rotulo: "R$/kg", valor: (r) => Number(r.precoKg) },
  { rotulo: "Valor", valor: (r) => Number(r.valorTotal) },
  { rotulo: "Qualidade", valor: (r) => r.qualidade ?? "" },
  { rotulo: "Documento", valor: (r) => r.documento ?? "" },
  { rotulo: "Status", valor: (r) => (r.status === "CANCELADA" ? "Excluída" : "Ativa") },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const periodo = periodoDaUrl({
    inicio: url.searchParams.get("inicio") ?? undefined,
    fim: url.searchParams.get("fim") ?? undefined,
  });
  const frutaId = url.searchParams.get("fruta") || undefined;
  const origemBruta = url.searchParams.get("origem") ?? "";
  const origem = (ORIGEM_RECEPCAO as readonly string[]).includes(origemBruta)
    ? (origemBruta as (typeof ORIGEM_RECEPCAO)[number])
    : undefined;

  const recepcoes = await listarRecepcoes(sessao.filialId, { ...periodo, frutaId, origem });

  return responderExport(recepcoes, COLUNAS, {
    nomeArquivo: "recepcoes-de-fruto",
    nomeAba: "Recepções",
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: async () => {
      const fruta = frutaId
        ? await prisma.fruta.findFirst({ where: { id: frutaId, empresaId: sessao.empresaId }, select: { nome: true } })
        : null;
      return cabecalhoDoRelatorio(sessao, {
        titulo: "Recepção de fruto",
        filtros: [
          `Período: ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`,
          fruta ? `Fruta: ${fruta.nome}` : null,
          origem ? `Origem: ${ROTULOS_ORIGEM_RECEPCAO[origem]}` : null,
        ],
      });
    },
  });
}
