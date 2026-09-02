-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "OrigemLancamento" AS ENUM ('MANUAL', 'BAIXA', 'TRANSFERENCIA');

-- CreateTable
CREATE TABLE "lancamentos_bancarios" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "origem" "OrigemLancamento" NOT NULL DEFAULT 'MANUAL',
    "baixaId" TEXT,
    "transferenciaId" TEXT,
    "categoriaFinanceiraId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lancamentos_bancarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldos_bancarios_informados" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "saldo" DECIMAL(18,2) NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saldos_bancarios_informados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lancamentos_bancarios_filialId_idx" ON "lancamentos_bancarios"("filialId");

-- CreateIndex
CREATE INDEX "lancamentos_bancarios_contaBancariaId_idx" ON "lancamentos_bancarios"("contaBancariaId");

-- CreateIndex
CREATE INDEX "lancamentos_bancarios_baixaId_idx" ON "lancamentos_bancarios"("baixaId");

-- CreateIndex
CREATE INDEX "saldos_bancarios_informados_contaBancariaId_idx" ON "saldos_bancarios_informados"("contaBancariaId");

-- AddForeignKey
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_bancarios_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_bancarios_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_bancarios_baixaId_fkey" FOREIGN KEY ("baixaId") REFERENCES "baixas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_bancarios_categoriaFinanceiraId_fkey" FOREIGN KEY ("categoriaFinanceiraId") REFERENCES "categorias_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_bancarios_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos_bancarios_informados" ADD CONSTRAINT "saldos_bancarios_informados_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos_bancarios_informados" ADD CONSTRAINT "saldos_bancarios_informados_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
