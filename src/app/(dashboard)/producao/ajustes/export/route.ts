import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarAjustes, type AjusteListado } from "@/server/services/ajusteEstoque";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { ROTULOS_MOTIVO_AJUSTE } from "@/lib/schemas/enums";
import { formatarData } from "@/lib/formatacao";
import { filtrosDosAjustes } from "../filtros";

const COLUNAS: ColunaExport<AjusteListado>[] = [
  { rotulo: "Data", valor: (a) => a.data },
  { rotulo: "Lote", valor: (a) => a.lote.codigo },
  { rotulo: "Produto", valor: (a) => a.produto.descricao },
  { rotulo: "Quantidade (kg)", valor: (a) => Number(a.quantidadeKg) },
  { rotulo: "Motivo", valor: (a) => ROTULOS_MOTIVO_AJUSTE[a.motivo] },
  { rotulo: "Observação", valor: (a) => a.observacao ?? "" },
  { rotulo: "Usuário", valor: (a) => a.usuario.nome },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const filtros = filtrosDosAjustes(Object.fromEntries(url.searchParams));
  const ajustes = await listarAjustes(sessao.filialId, filtros);

  return responderExport(ajustes, COLUNAS, {
    nomeArquivo: "ajustes-de-estoque",
    nomeAba: "Ajustes",
    formato: url.searchParams.get("formato"),
    cabecalhoPdf: () =>
      cabecalhoDoRelatorio(sessao, {
        titulo: "Ajustes de estoque",
        filtros: [
          `Período: ${formatarData(filtros.inicio)} a ${formatarData(filtros.fim)}`,
          filtros.motivo ? `Motivo: ${ROTULOS_MOTIVO_AJUSTE[filtros.motivo]}` : null,
        ],
      }),
  });
}
