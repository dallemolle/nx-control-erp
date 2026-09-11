-- CreateTable
CREATE TABLE "orcamentos_safra" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "safraId" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamentos_safra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orcamentos_safra_filialId_idx" ON "orcamentos_safra"("filialId");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_safra_filialId_safraId_key" ON "orcamentos_safra"("filialId", "safraId");

-- AddForeignKey
ALTER TABLE "orcamentos_safra" ADD CONSTRAINT "orcamentos_safra_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos_safra" ADD CONSTRAINT "orcamentos_safra_safraId_fkey" FOREIGN KEY ("safraId") REFERENCES "safras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
