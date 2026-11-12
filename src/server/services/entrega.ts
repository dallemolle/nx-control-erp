import type { StatusEntrega } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireAlteracaoFilial, requirePermission } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import type { DadosEntrega } from "@/lib/schemas/entrega";
import { hojeDeCalendario } from "@/lib/producao/periodo";
import { atrasoEntregaDias } from "@/lib/producao/venda";

/** Atualiza a entrega (D-16). Só os campos enviados mudam; entrega cancelada fica como está. */
export async function atualizarEntrega(sessao: SessaoAtiva, pedidoId: string, dados: DadosEntrega): Promise<void> {
  requirePermission(sessao.perfil, "venda:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const atual = await prisma.entrega.findFirst({ where: { pedidoId, pedido: { filialId: sessao.filialId } } });
  if (!atual) throw new Error("Entrega não encontrada");
  if (atual.status === "CANCELADA") throw new Error("Entrega cancelada não pode ser alterada");

  const status = dados.status ?? atual.status;
  const entregue = status === "ENTREGUE";
  const novo = {
    dataPrevista: dados.dataPrevista ?? atual.dataPrevista,
    endereco: dados.endereco === undefined ? atual.endereco : dados.endereco,
    responsavel: dados.responsavel === undefined ? atual.responsavel : dados.responsavel,
    observacao: dados.observacao === undefined ? atual.observacao : dados.observacao,
    status,
    dataRealizada: entregue ? (dados.dataRealizada ?? atual.dataRealizada ?? hojeDeCalendario()) : null,
    recebidoPor: entregue ? (dados.recebidoPor === undefined ? atual.recebidoPor : dados.recebidoPor) : null,
  };

  await prisma.entrega.update({ where: { pedidoId }, data: novo });
  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Entrega",
    entidadeId: pedidoId,
    acao: "ATUALIZAR",
    anterior: {
      dataPrevista: atual.dataPrevista,
      endereco: atual.endereco,
      responsavel: atual.responsavel,
      observacao: atual.observacao,
      status: atual.status,
      dataRealizada: atual.dataRealizada,
      recebidoPor: atual.recebidoPor,
    },
    novo,
  });
}

export const STATUS_ENTREGA_ABERTA: StatusEntrega[] = ["PENDENTE", "EM_ROTA"];

export type FiltroEntregas = {
  status?: StatusEntrega[];
  inicio?: Date;
  fim?: Date;
  /** Só as com atraso maior que zero na data de hoje (alerta do painel). */
  atrasadas?: boolean;
};

/** Entregas da filial com o atraso calculado (RN-24); por padrão, só as em aberto. */
export async function listarEntregas(filialId: string, filtros: FiltroEntregas, hoje: Date) {
  const entregas = await prisma.entrega.findMany({
    where: {
      pedido: { filialId },
      status: { in: filtros.status ?? STATUS_ENTREGA_ABERTA },
      ...(filtros.inicio || filtros.fim
        ? {
            dataPrevista: {
              ...(filtros.inicio ? { gte: filtros.inicio } : {}),
              ...(filtros.fim ? { lte: filtros.fim } : {}),
            },
          }
        : {}),
    },
    include: { pedido: { select: { numero: true, cliente: { select: { nome: true } } } } },
    orderBy: [{ dataPrevista: "asc" }, { pedido: { numero: "asc" } }],
  });
  const listadas = entregas.map((entrega) => ({ ...entrega, atraso: atrasoEntregaDias(entrega, hoje) }));
  return filtros.atrasadas ? listadas.filter((entrega) => (entrega.atraso ?? 0) > 0) : listadas;
}

export type EntregaListada = Awaited<ReturnType<typeof listarEntregas>>[number];
