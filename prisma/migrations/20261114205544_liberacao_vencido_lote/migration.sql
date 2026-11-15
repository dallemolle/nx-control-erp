-- AlterTable
ALTER TABLE "lotes" ADD COLUMN     "liberadoAte" TIMESTAMP(3),
ADD COLUMN     "liberadoEm" TIMESTAMP(3),
ADD COLUMN     "liberadoPorId" TEXT,
ADD COLUMN     "motivoLiberacao" TEXT;

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "diasLiberacaoVencido" INTEGER;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_liberadoPorId_fkey" FOREIGN KEY ("liberadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
