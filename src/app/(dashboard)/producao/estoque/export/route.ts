import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarLotes, type LoteListado } from "@/server/services/estoque";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { ROTULOS_STATUS_LOTE } from "@/lib/producao/statusLote";
import { formatarData } from "@/lib/formatacao";
import { filtrosDoEstoque } from "../filtros";

const COLUNAS: ColunaExport<LoteListado>[] = [
  { rotulo: "Lote", valor: (l) => l.codigo },
  { rotulo: "Produto", valor: (l) => l.produto.descricao },
  { rotulo: "Local", valor: (l) => l.local.nome },
  { rotulo: "Data", valor: (l) => l.data },
  { rotulo: "Validade", valor: (l) => l.validade },
  { rotulo: "Dias", tipo: "inteiro", valor: (l) => l.dias },
  { rotulo: "Status", valor: (l) => ROTULOS_STATUS_LOTE[l.status] },
  { rotulo: "Saldo (kg)", valor: (l) => Number(l.saldoKg) },
  { rotulo: "Custo/kg", valor: (l) => Number(l.custoKg) },
  { rotulo: "Valor", valor: (l) => l.valor },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const { filtros, referencia } = filtrosDoEstoque(Object.fromEntries(url.searchParams));
  const lotes = await listarLotes(sessao.filialId, filtros, referencia);

  return responderExport(lotes, COLUNAS, {
    nomeArquivo: "estoque-por-lote",
    nomeAba: "Estoque",
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: () =>
      cabecalhoDoRelatorio(sessao, {
        titulo: "Estoque por lote",
        filtros: [
          `Referência: ${formatarData(referencia)}`,
          filtros.status ? `Status: ${ROTULOS_STATUS_LOTE[filtros.status]}` : null,
          filtros.incluirZerados ? "Com lotes zerados" : null,
        ],
      }),
  });
}
