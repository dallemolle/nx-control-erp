import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { garantirSemBaixaPendente, ROTULO_PARCELA_FECHADA, STATUS_QUE_ACEITAM_BAIXA } from "./baixa";

export type NovaParcelaRenegociacao = {
  dataVencimento: Date;
  valorOriginal: number;
};

export async function renegociarParcela(
  sessao: SessaoAtiva,
  parcelaId: string,
  novasParcelas: NovaParcelaRenegociacao[],
) {
  requirePermission(sessao.perfil, "titulo:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  if (novasParcelas.length === 0) {
    throw new Error("Informe ao menos uma nova parcela para a renegociação");
  }

  await prisma.parcela.findFirstOrThrow({ where: { id: parcelaId, titulo: { filialId: sessao.filialId } } });

  return prisma.$transaction(async (tx) => {
    // Trava a parcela: um registro de baixa ao mesmo tempo fica em fila e um vê o outro.
    await tx.$queryRaw`SELECT id FROM parcelas WHERE id = ${parcelaId} FOR UPDATE`;
    const original = await tx.parcela.findUniqueOrThrow({ where: { id: parcelaId } });
    if (!STATUS_QUE_ACEITAM_BAIXA.includes(original.status)) {
      throw new Error(
        `Esta parcela está ${ROTULO_PARCELA_FECHADA[original.status] ?? "fechada"} e não pode ser renegociada`,
      );
    }
    await garantirSemBaixaPendente(tx, parcelaId, "renegociar a parcela");

    const ultimoNumero = await tx.parcela.aggregate({ where: { tituloId: original.tituloId }, _max: { numero: true } });
    let proximoNumero = (ultimoNumero._max.numero ?? 0) + 1;

    await tx.parcela.update({ where: { id: parcelaId }, data: { status: "RENEGOCIADO" } });
    const criadas = [];
    for (const nova of novasParcelas) {
      criadas.push(
        await tx.parcela.create({
          data: {
            tituloId: original.tituloId,
            numero: proximoNumero++,
            dataVencimento: nova.dataVencimento,
            valorOriginal: nova.valorOriginal,
            valorAtualizado: nova.valorOriginal,
            parcelaOrigemId: parcelaId,
          },
        }),
      );
    }

    await registrarAuditoria(
      {
        empresaId: sessao.empresaId,
        filialId: sessao.filialId,
        usuarioId: sessao.usuarioId,
        entidade: "Parcela",
        entidadeId: parcelaId,
        acao: "RENEGOCIAR",
        anterior: { status: original.status },
        novo: { status: "RENEGOCIADO", novasParcelas: criadas.map((parcela) => parcela.id) },
      },
      tx,
    );
    return criadas;
  });
}
