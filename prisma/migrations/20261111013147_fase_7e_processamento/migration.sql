-- CreateEnum
CREATE TYPE "StatusOrdemProducao" AS ENUM ('ABERTA', 'ENCERRADA', 'CANCELADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'CONSUMO_OP';
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'ESTORNO_CONSUMO_OP';
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'PRODUCAO_OP';
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'ESTORNO_PRODUCAO_OP';

-- AlterTable
ALTER TABLE "configuracoes_producao" ADD COLUMN     "enderecoEtiqueta" TEXT;

-- AlterTable
ALTER TABLE "movimentos_estoque" ADD COLUMN     "consumoOpId" TEXT,
ADD COLUMN     "producaoOpId" TEXT;

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "textoEtiqueta" TEXT;

-- CreateTable
CREATE TABLE "ordens_producao" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "frutaId" TEXT NOT NULL,
    "responsavel" TEXT,
    "branqueamentoTemperaturaC" DECIMAL(5,1),
    "branqueamentoTempoS" INTEGER,
    "aguaLitros" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "carocoResiduoKg" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "perdaKg" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "status" "StatusOrdemProducao" NOT NULL DEFAULT 'ABERTA',
    "custoFrutoTotal" DECIMAL(18,2),
    "custoInsumosTotal" DECIMAL(18,2),
    "custoKgPolpa" DECIMAL(18,4),
    "encerradaEm" TIMESTAMP(3),
    "motivoReabertura" TEXT,
    "motivoCancelamento" TEXT,
    "canceladaEm" TIMESTAMP(3),
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordens_producao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumos_op" (
    "id" TEXT NOT NULL,
    "ordemProducaoId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "quantidadeKg" DECIMAL(18,3) NOT NULL,
    "custoKg" DECIMAL(18,4) NOT NULL,
    "motivoLiberacaoVencido" TEXT,
    "removidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumos_op_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producoes_op" (
    "id" TEXT NOT NULL,
    "ordemProducaoId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidadeKg" DECIMAL(18,3) NOT NULL,
    "embalagens" INTEGER,
    "localId" TEXT NOT NULL,
    "removidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producoes_op_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumos_op" (
    "id" TEXT NOT NULL,
    "ordemProducaoId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,3) NOT NULL,
    "custoUnitario" DECIMAL(18,4) NOT NULL,
    "removidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insumos_op_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ordens_producao_filialId_data_idx" ON "ordens_producao"("filialId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_producao_filialId_numero_key" ON "ordens_producao"("filialId", "numero");

-- CreateIndex
CREATE INDEX "consumos_op_ordemProducaoId_idx" ON "consumos_op"("ordemProducaoId");

-- CreateIndex
CREATE INDEX "consumos_op_loteId_idx" ON "consumos_op"("loteId");

-- CreateIndex
CREATE UNIQUE INDEX "producoes_op_loteId_key" ON "producoes_op"("loteId");

-- CreateIndex
CREATE INDEX "producoes_op_ordemProducaoId_idx" ON "producoes_op"("ordemProducaoId");

-- CreateIndex
CREATE INDEX "insumos_op_ordemProducaoId_idx" ON "insumos_op"("ordemProducaoId");

-- CreateIndex
CREATE INDEX "movimentos_estoque_consumoOpId_idx" ON "movimentos_estoque"("consumoOpId");

-- CreateIndex
CREATE INDEX "movimentos_estoque_producaoOpId_idx" ON "movimentos_estoque"("producaoOpId");

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_consumoOpId_fkey" FOREIGN KEY ("consumoOpId") REFERENCES "consumos_op"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_producaoOpId_fkey" FOREIGN KEY ("producaoOpId") REFERENCES "producoes_op"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_frutaId_fkey" FOREIGN KEY ("frutaId") REFERENCES "frutas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_op" ADD CONSTRAINT "consumos_op_ordemProducaoId_fkey" FOREIGN KEY ("ordemProducaoId") REFERENCES "ordens_producao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_op" ADD CONSTRAINT "consumos_op_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producoes_op" ADD CONSTRAINT "producoes_op_ordemProducaoId_fkey" FOREIGN KEY ("ordemProducaoId") REFERENCES "ordens_producao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producoes_op" ADD CONSTRAINT "producoes_op_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producoes_op" ADD CONSTRAINT "producoes_op_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producoes_op" ADD CONSTRAINT "producoes_op_localId_fkey" FOREIGN KEY ("localId") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumos_op" ADD CONSTRAINT "insumos_op_ordemProducaoId_fkey" FOREIGN KEY ("ordemProducaoId") REFERENCES "ordens_producao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumos_op" ADD CONSTRAINT "insumos_op_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
