import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { listarPendenciasFiscais, obterComparativoMensal } from "@/server/services/relatorioFiscalGerencial";
import { ROTULOS_PENDENCIA_FISCAL, type PendenciaFiscal } from "@/lib/classificacaoFiscal";
import { type ColunaExport } from "@/lib/export/csv";
import { responderExport } from "@/lib/export/responder";

type LinhaComparativo = {
  mes: number;
  entradasFiscal: number;
  entradasGerencial: number;
  percentualGerencialEntradas: number | string;
  saidasFiscal: number;
  saidasGerencial: number;
  percentualGerencialSaidas: number | string;
};

const COLUNAS_COMPARATIVO: ColunaExport<LinhaComparativo>[] = [
  { rotulo: "Mês", valor: (l) => l.mes },
  { rotulo: "Entradas fiscais", valor: (l) => l.entradasFiscal },
  { rotulo: "Entradas gerenciais", valor: (l) => l.entradasGerencial },
  { rotulo: "% gerencial (entradas)", valor: (l) => l.percentualGerencialEntradas },
  { rotulo: "Saídas fiscais", valor: (l) => l.saidasFiscal },
  { rotulo: "Saídas gerenciais", valor: (l) => l.saidasGerencial },
  { rotulo: "% gerencial (saídas)", valor: (l) => l.percentualGerencialSaidas },
];

type LinhaPendencia = {
  documento: string;
  contraparte: string;
  tipo: string;
  dataEmissao: Date;
  valor: number;
  pendencias: string;
};

const COLUNAS_PENDENCIAS: ColunaExport<LinhaPendencia>[] = [
  { rotulo: "Documento", valor: (l) => l.documento },
  { rotulo: "Parceiro", valor: (l) => l.contraparte },
  { rotulo: "Tipo", valor: (l) => l.tipo },
  { rotulo: "Emissão", valor: (l) => l.dataEmissao },
  { rotulo: "Valor", valor: (l) => l.valor },
  { rotulo: "Pendências", valor: (l) => l.pendencias },
];

const PENDENCIAS = Object.keys(ROTULOS_PENDENCIA_FISCAL) as PendenciaFiscal[];

export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "titulo:ler") || !podeExecutar(sessao.perfil, "lancamento:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const formato = url.searchParams.get("formato");

  if (url.searchParams.get("relatorio") === "pendencias") {
    const filtro = url.searchParams.get("pendencia");
    const pendencia = PENDENCIAS.includes(filtro as PendenciaFiscal) ? (filtro as PendenciaFiscal) : undefined;
    const titulos = await listarPendenciasFiscais(sessao, { pendencia });
    const linhas: LinhaPendencia[] = titulos.map((titulo) => ({
      documento: titulo.documento,
      contraparte: titulo.contraparte,
      tipo: titulo.tipo === "PAGAR" ? "A pagar" : "A receber",
      dataEmissao: titulo.dataEmissao,
      valor: titulo.valor,
      pendencias: titulo.pendencias.map((item) => ROTULOS_PENDENCIA_FISCAL[item]).join("; "),
    }));
    return responderExport(linhas, COLUNAS_PENDENCIAS, {
      nomeArquivo: "pendencias-fiscais",
      nomeAba: "Pendências fiscais",
      formato,
    });
  }

  const anoParam = Number(url.searchParams.get("ano"));
  const ano = Number.isInteger(anoParam) && anoParam > 0 ? anoParam : new Date().getUTCFullYear();
  const comparativo = await obterComparativoMensal(sessao, ano);
  const linhas: LinhaComparativo[] = comparativo.map((linha) => ({
    ...linha,
    percentualGerencialEntradas: linha.percentualGerencialEntradas ?? "",
    percentualGerencialSaidas: linha.percentualGerencialSaidas ?? "",
  }));
  return responderExport(linhas, COLUNAS_COMPARATIVO, {
    nomeArquivo: `fiscal-gerencial-${ano}`,
    nomeAba: "Fiscal x gerencial",
    formato,
  });
}
