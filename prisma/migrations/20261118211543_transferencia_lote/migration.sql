-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'TRANSFERENCIA_SAIDA';
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'TRANSFERENCIA_ENTRADA';

-- AlterTable
ALTER TABLE "lotes" ADD COLUMN     "loteOrigemId" TEXT;

-- AlterTable
ALTER TABLE "movimentos_estoque" ADD COLUMN     "transferenciaId" TEXT;

-- CreateIndex
CREATE INDEX "lotes_loteOrigemId_idx" ON "lotes"("loteOrigemId");

-- CreateIndex
CREATE INDEX "movimentos_estoque_transferenciaId_idx" ON "movimentos_estoque"("transferenciaId");

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_loteOrigemId_fkey" FOREIGN KEY ("loteOrigemId") REFERENCES "lotes"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
