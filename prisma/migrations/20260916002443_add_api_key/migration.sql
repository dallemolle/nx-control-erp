-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "chaveHash" TEXT NOT NULL,
    "ultimoUsoEm" TIMESTAMP(3),
    "revogadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_chaveHash_key" ON "api_keys"("chaveHash");

-- CreateIndex
CREATE INDEX "api_keys_usuarioId_idx" ON "api_keys"("usuarioId");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
