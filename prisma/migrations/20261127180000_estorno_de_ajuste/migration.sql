-- AlterEnum
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'ESTORNO_AJUSTE';

-- AlterTable
ALTER TABLE "ajustes_estoque" ADD COLUMN     "estornadoEm" TIMESTAMP(3),
ADD COLUMN     "estornadoPorId" TEXT,
ADD COLUMN     "motivoEstorno" TEXT;

-- AlterTable
ALTER TABLE "movimentos_estoque" ADD COLUMN     "ajusteEstornadoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "movimentos_estoque_ajusteEstornadoId_key" ON "movimentos_estoque"("ajusteEstornadoId");

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_ajusteEstornadoId_fkey" FOREIGN KEY ("ajusteEstornadoId") REFERENCES "ajustes_estoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_estoque" ADD CONSTRAINT "ajustes_estoque_estornadoPorId_fkey" FOREIGN KEY ("estornadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
