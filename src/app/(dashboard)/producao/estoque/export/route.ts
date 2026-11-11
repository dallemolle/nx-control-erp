import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import {
  listarLotes,
  resumoPorStatus,
  resumoProdutoLocal,
  STATUS_RESUMIDOS,
  type LoteListado,
} from "@/server/services/estoque";
import { type ColunaExport } from "@/lib/export/csv";
import { gerarPdfSecoes, secaoPdf } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";
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

type LinhaResumo = { status: string; quantidade: number; kg: number };
const COLUNAS_RESUMO: ColunaExport<LinhaResumo>[] = [
  { rotulo: "Status", valor: (r) => r.status },
  { rotulo: "Lotes", tipo: "inteiro", valor: (r) => r.quantidade },
  { rotulo: "kg", valor: (r) => r.kg },
];

type ProdutoLocal = Awaited<ReturnType<typeof resumoProdutoLocal>>;
const COLUNAS_PRODUTO_LOCAL: ColunaExport<ProdutoLocal["linhas"][number]>[] = [
  { rotulo: "Produto", valor: (l) => l.produto },
  { rotulo: "Local", valor: (l) => l.local },
  { rotulo: "Saldo (kg)", valor: (l) => l.saldoKg },
  { rotulo: "Valor", valor: (l) => l.valor },
];
const COLUNAS_OCUPACAO: ColunaExport<ProdutoLocal["locais"][number]>[] = [
  { rotulo: "Local", valor: (l) => l.nome },
  { rotulo: "Saldo (kg)", valor: (l) => l.saldoKg },
  { rotulo: "Capacidade (kg)", valor: (l) => l.capacidadeKg ?? "" },
  { rotulo: "Ocupação (%)", tipo: "percentual", valor: (l) => (l.ocupacao === null ? "" : l.ocupacao * 100) },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const formato = url.searchParams.get("formato");
  const porProdutoLocal = url.searchParams.get("visao") === "resumo";
  const { filtros, referencia } = filtrosDoEstoque(Object.fromEntries(url.searchParams));
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: porProdutoLocal ? "Estoque por produto e local" : "Estoque por lote",
      filtros: porProdutoLocal
        ? [`Referência: ${formatarData(referencia)}`]
        : [
            `Referência: ${formatarData(referencia)}`,
            filtros.status ? `Status: ${ROTULOS_STATUS_LOTE[filtros.status]}` : null,
            filtros.incluirZerados ? "Com lotes zerados" : null,
          ],
    });

  if (porProdutoLocal) {
    const produtoLocal = await resumoProdutoLocal(sessao.filialId);
    if (formato === "pdf") {
      const resumo = await resumoPorStatus(sessao.filialId, {}, referencia);
      const secoes = [
        secaoResumo(resumo),
        secaoPdf({ titulo: "Saldo por produto e local", linhas: produtoLocal.linhas, colunas: COLUNAS_PRODUTO_LOCAL }),
        secaoPdf({ titulo: "Ocupação dos locais", linhas: produtoLocal.locais, colunas: COLUNAS_OCUPACAO }),
      ];
      return responderArquivoPdf(await gerarPdfSecoes(secoes, await cabecalho()), "estoque-por-produto-local");
    }
    return responderExport(produtoLocal.linhas, COLUNAS_PRODUTO_LOCAL, {
      nomeArquivo: "estoque-por-produto-local",
      nomeAba: "Estoque",
      formato,
    });
  }

  const lotes = await listarLotes(sessao.filialId, filtros, referencia);
  if (formato === "pdf") {
    const resumo = await resumoPorStatus(sessao.filialId, filtros, referencia);
    const secoes = [secaoResumo(resumo), secaoPdf({ titulo: "Lotes", linhas: lotes, colunas: COLUNAS })];
    return responderArquivoPdf(await gerarPdfSecoes(secoes, await cabecalho()), "estoque-por-lote");
  }
  return responderExport(lotes, COLUNAS, { nomeArquivo: "estoque-por-lote", nomeAba: "Estoque", formato });
}

function secaoResumo(resumo: Awaited<ReturnType<typeof resumoPorStatus>>) {
  return secaoPdf({
    titulo: "Resumo por status de validade",
    linhas: STATUS_RESUMIDOS.map((s) => ({ status: ROTULOS_STATUS_LOTE[s], ...resumo[s] })),
    colunas: COLUNAS_RESUMO,
  });
}
