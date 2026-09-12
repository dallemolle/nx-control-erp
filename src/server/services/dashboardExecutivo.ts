import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { StatusParcela } from "@prisma/client";
import { buscarSaldoEmCaixaAte, fimDoDiaUTC } from "./fluxoDeCaixa";
import { saldoRemanescenteParcela } from "./fluxoDeCaixaProjetado";

export type IndicadoresExecutivos = {
  caixaDisponivel: number;
  contasAPagarEmAberto: number;
  contasAReceberEmAberto: number;
  inadimplencia: number;
  geracaoDeCaixaMesAtual: number;
  obrigacoes7Dias: number;
  obrigacoes30Dias: number;
  recebimentosEsperados30Dias: number;
  saldoProjetado30Dias: number;
};

const STATUS_ABERTO: StatusParcela[] = ["EM_ABERTO", "A_VENCER", "VENCIDO", "PARCIALMENTE_PAGO"];

function inicioDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1));
}

/**
 * Consolida por empresa (soma todas as filiais) — mesmo padrão de
 * `buscarAnoBaseConsolidado` em `fluxoDeCaixaEstrategico.ts`: busca as
 * filiais da empresa e faz um loop reaproveitando funções já existentes,
 * sem duplicar query.
 */
export async function buscarIndicadoresExecutivos(sessao: SessaoAtiva): Promise<IndicadoresExecutivos> {
  requirePermission(sessao.perfil, "dashboardExecutivo:ler");

  const filiais = await prisma.filial.findMany({ where: { empresaId: sessao.empresaId }, select: { id: true } });
  const hoje = new Date();
  const inicioDeHoje = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  const em7Dias = fimDoDiaUTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 7);
  const em30Dias = fimDoDiaUTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 30);
  const inicioMesAtual = inicioDoMes(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1);

  let caixaDisponivel = 0;
  let contasAPagarEmAberto = 0;
  let contasAReceberEmAberto = 0;
  let inadimplencia = 0;
  let geracaoDeCaixaMesAtual = 0;
  let obrigacoes7Dias = 0;
  let obrigacoes30Dias = 0;
  let recebimentosEsperados30Dias = 0;

  for (const filial of filiais) {
    caixaDisponivel += await buscarSaldoEmCaixaAte(filial.id, hoje);

    const parcelasEmAberto = await prisma.parcela.findMany({
      where: {
        titulo: { filialId: filial.id },
        status: { in: STATUS_ABERTO },
      },
      include: {
        titulo: { select: { tipo: true } },
        baixas: { where: { statusAprovacao: "APROVADO" } },
      },
    });

    for (const parcela of parcelasEmAberto) {
      const saldo = saldoRemanescenteParcela(
        Number(parcela.valorAtualizado),
        parcela.baixas.map((baixa) => ({ valorPago: Number(baixa.valorPago) })),
      );
      const dentroDe7Dias = parcela.dataVencimento >= inicioDeHoje && parcela.dataVencimento <= em7Dias;
      const dentroDe30Dias = parcela.dataVencimento >= inicioDeHoje && parcela.dataVencimento <= em30Dias;

      if (parcela.titulo.tipo === "PAGAR") {
        contasAPagarEmAberto += saldo;
        if (dentroDe7Dias) obrigacoes7Dias += saldo;
        if (dentroDe30Dias) obrigacoes30Dias += saldo;
      } else {
        contasAReceberEmAberto += saldo;
        if (parcela.status === "VENCIDO") inadimplencia += saldo;
        if (dentroDe30Dias) recebimentosEsperados30Dias += saldo;
      }
    }

    const somasMes = await prisma.lancamentoBancario.groupBy({
      by: ["tipo"],
      where: {
        filialId: filial.id,
        conciliado: true,
        data: { gte: inicioMesAtual, lte: hoje },
        contaBancaria: { ativo: true },
      },
      _sum: { valor: true },
    });
    const entradasMes = Number(somasMes.find((s) => s.tipo === "ENTRADA")?._sum.valor ?? 0);
    const saidasMes = Number(somasMes.find((s) => s.tipo === "SAIDA")?._sum.valor ?? 0);
    geracaoDeCaixaMesAtual += entradasMes - saidasMes;
  }

  const saldoProjetado30Dias = caixaDisponivel + recebimentosEsperados30Dias - obrigacoes30Dias;

  return {
    caixaDisponivel,
    contasAPagarEmAberto,
    contasAReceberEmAberto,
    inadimplencia,
    geracaoDeCaixaMesAtual,
    obrigacoes7Dias,
    obrigacoes30Dias,
    recebimentosEsperados30Dias,
    saldoProjetado30Dias,
  };
}
