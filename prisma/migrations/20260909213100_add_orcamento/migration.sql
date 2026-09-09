-- CreateTable
CREATE TABLE "orcamentos" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "categoriaFinanceiraId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orcamentos_filialId_idx" ON "orcamentos"("filialId");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_filialId_categoriaFinanceiraId_ano_mes_key" ON "orcamentos"("filialId", "categoriaFinanceiraId", "ano", "mes");

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_categoriaFinanceiraId_fkey" FOREIGN KEY ("categoriaFinanceiraId") REFERENCES "categorias_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
