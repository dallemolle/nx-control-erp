-- AlterEnum
ALTER TYPE "StatusAprovacaoBaixa" ADD VALUE 'ESTORNADO';

-- AlterTable
ALTER TABLE "baixas" ADD COLUMN     "estornadoEm" TIMESTAMP(3),
ADD COLUMN     "estornadoPorId" TEXT,
ADD COLUMN     "motivoEstorno" TEXT;

-- AddForeignKey
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_estornadoPorId_fkey" FOREIGN KEY ("estornadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
