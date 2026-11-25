-- AlterTable
ALTER TABLE "baixas" ADD COLUMN     "dispensadaEm" TIMESTAMP(3),
ADD COLUMN     "dispensadaPorId" TEXT,
ADD COLUMN     "motivoDispensa" TEXT;

-- AddForeignKey
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_dispensadaPorId_fkey" FOREIGN KEY ("dispensadaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
