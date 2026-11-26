import { Prisma } from "@prisma/client";

/**
 * Trava (`FOR UPDATE`) todas as parcelas dos títulos, em ordem fixa de id —
 * a mesma da confirmação de repasses, para não criar deadlock. Quem cancela
 * o título chama antes de conferir as baixas: uma baixa registrada ao mesmo
 * tempo (que também trava a parcela) fica em fila e vê a parcela cancelada.
 */
export async function travarParcelasDosTitulos(
  tx: Prisma.TransactionClient,
  tituloIds: (string | null | undefined)[],
): Promise<void> {
  const ids = tituloIds.filter((id): id is string => !!id);
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM parcelas WHERE "tituloId" IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}
