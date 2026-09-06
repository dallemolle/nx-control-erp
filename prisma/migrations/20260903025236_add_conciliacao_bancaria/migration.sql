-- CreateEnum
CREATE TYPE "StatusLinhaExtrato" AS ENUM ('NAO_CONCILIADO', 'SUGESTAO', 'CONCILIADO', 'DIVERGENCIA_VALOR', 'DIVERGENCIA_DATA', 'DUPLICADO');

-- AlterTable
ALTER TABLE "lancamentos_bancarios" ADD COLUMN     "conciliado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "extratos_importados" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "totalLinhas" INTEGER NOT NULL,
    "linhasNovas" INTEGER NOT NULL,
    "linhasIgnoradas" INTEGER NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extratos_importados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_extrato" (
    "id" TEXT NOT NULL,
    "extratoImportadoId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "historico" TEXT NOT NULL,
    "identificadorBancario" TEXT NOT NULL,
    "status" "StatusLinhaExtrato" NOT NULL DEFAULT 'NAO_CONCILIADO',
    "lancamentoBancarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linhas_extrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extratos_importados_filialId_idx" ON "extratos_importados"("filialId");

-- CreateIndex
CREATE INDEX "extratos_importados_contaBancariaId_idx" ON "extratos_importados"("contaBancariaId");

-- CreateIndex
CREATE UNIQUE INDEX "linhas_extrato_lancamentoBancarioId_key" ON "linhas_extrato"("lancamentoBancarioId");

-- CreateIndex
CREATE INDEX "linhas_extrato_contaBancariaId_idx" ON "linhas_extrato"("contaBancariaId");

-- CreateIndex
CREATE INDEX "linhas_extrato_extratoImportadoId_idx" ON "linhas_extrato"("extratoImportadoId");

-- CreateIndex
CREATE INDEX "linhas_extrato_status_idx" ON "linhas_extrato"("status");

-- CreateIndex
CREATE UNIQUE INDEX "linhas_extrato_contaBancariaId_identificadorBancario_key" ON "linhas_extrato"("contaBancariaId", "identificadorBancario");

-- AddForeignKey
ALTER TABLE "extratos_importados" ADD CONSTRAINT "extratos_importados_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extratos_importados" ADD CONSTRAINT "extratos_importados_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extratos_importados" ADD CONSTRAINT "extratos_importados_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_extratoImportadoId_fkey" FOREIGN KEY ("extratoImportadoId") REFERENCES "extratos_importados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_lancamentoBancarioId_fkey" FOREIGN KEY ("lancamentoBancarioId") REFERENCES "lancamentos_bancarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
