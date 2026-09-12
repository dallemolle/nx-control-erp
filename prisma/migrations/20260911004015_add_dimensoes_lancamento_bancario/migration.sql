-- AlterTable
ALTER TABLE "lancamentos_bancarios" ADD COLUMN     "centroCustoId" TEXT,
ADD COLUMN     "centroLucroId" TEXT,
ADD COLUMN     "projetoId" TEXT,
ADD COLUMN     "safraId" TEXT;

-- AddForeignKey
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_bancarios_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "centros_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_bancarios_centroLucroId_fkey" FOREIGN KEY ("centroLucroId") REFERENCES "centros_lucro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_bancarios_safraId_fkey" FOREIGN KEY ("safraId") REFERENCES "safras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_bancarios_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
