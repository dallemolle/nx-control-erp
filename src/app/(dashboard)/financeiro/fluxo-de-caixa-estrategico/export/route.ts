import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import {
  listarProjecaoEstrategica,
  TIPOS_CENARIO,
  type AnoProjetadoEstrategico,
} from "@/server/services/fluxoDeCaixaEstrategico";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";

const LABEL_CENARIO: Record<(typeof TIPOS_CENARIO)[number], string> = {
  BASE: "Base",
  OTIMISTA: "Otimista",
  PESSIMISTA: "Pessimista",
};

type LinhaExport = AnoProjetadoEstrategico & { cenario: string };

/** Uma linha por cenário × ano (a tela mostra uma matriz por cenário; em planilha, formato longo filtra melhor). */
const COLUNAS: ColunaExport<LinhaExport>[] = [
  { rotulo: "Cenário", valor: (l) => l.cenario },
  { rotulo: "Ano", valor: (l) => l.ano },
  { rotulo: "Receita", valor: (l) => l.receita },
  { rotulo: "Custo operacional", valor: (l) => l.custoOperacional },
  { rotulo: "CAPEX", valor: (l) => l.capex },
  { rotulo: "Juros", valor: (l) => l.jurosSobreDivida },
  { rotulo: "Geração líquida", valor: (l) => l.geracaoLiquida },
  { rotulo: "Saldo de caixa", valor: (l) => l.saldoCaixa },
  { rotulo: "Margem líquida %", valor: (l) => l.margemLiquida * 100 },
];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "planejamentoEstrategico:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const { projecoes } = await listarProjecaoEstrategica(sessao);
  const linhas: LinhaExport[] = TIPOS_CENARIO.flatMap((tipo) =>
    projecoes[tipo].map((ano) => ({ ...ano, cenario: LABEL_CENARIO[tipo] })),
  );

  return responderExport(linhas, COLUNAS, {
    nomeArquivo: "fluxo-de-caixa-estrategico",
    nomeAba: "Fluxo estratégico",
    formato: new URL(request.url).searchParams.get("formato"),
  });
}
