-- CreateTable
CREATE TABLE "requisicoes_idempotentes" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "hashCorpo" TEXT,
    "statusHttp" INTEGER,
    "resposta" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" TIMESTAMP(3),

    CONSTRAINT "requisicoes_idempotentes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requisicoes_idempotentes_usuarioId_filialId_rota_chave_key" ON "requisicoes_idempotentes"("usuarioId", "filialId", "rota", "chave");

-- AddForeignKey
ALTER TABLE "requisicoes_idempotentes" ADD CONSTRAINT "requisicoes_idempotentes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisicoes_idempotentes" ADD CONSTRAINT "requisicoes_idempotentes_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
