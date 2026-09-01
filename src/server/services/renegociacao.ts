import { prisma } from "@/server/db/client";
import { requirePermission, requireAlteracaoFilial } from "@/server/auth/permissions";
import { registrarAuditoria } from "@/server/audit/registrar";
import type { SessaoAtiva } from "@/server/auth/sessao";

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

  const original = await prisma.parcela.findFirstOrThrow({
    where: { id: parcelaId, titulo: { filialId: sessao.filialId } },
  });

  const ultimoNumero = await prisma.parcela.aggregate({
    where: { tituloId: original.tituloId },
    _max: { numero: true },
  });
  let proximoNumero = (ultimoNumero._max.numero ?? 0) + 1;

  const [, ...criadas] = await prisma.$transaction([
    prisma.parcela.update({ where: { id: parcelaId }, data: { status: "RENEGOCIADO" } }),
    ...novasParcelas.map((nova) =>
      prisma.parcela.create({
        data: {
          tituloId: original.tituloId,
          numero: proximoNumero++,
          dataVencimento: nova.dataVencimento,
          valorOriginal: nova.valorOriginal,
          valorAtualizado: nova.valorOriginal,
          parcelaOrigemId: parcelaId,
        },
      }),
    ),
  ]);

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "Parcela",
    entidadeId: parcelaId,
    acao: "RENEGOCIAR",
    anterior: { status: original.status },
    novo: { status: "RENEGOCIADO", novasParcelas: criadas.map((parcela) => parcela.id) },
  });

  return criadas;
}
