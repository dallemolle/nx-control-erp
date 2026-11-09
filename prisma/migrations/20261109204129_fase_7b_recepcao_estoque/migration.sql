-- CreateEnum
CREATE TYPE "OrigemRecepcao" AS ENUM ('PROPRIA', 'TERCEIRO');

-- CreateEnum
CREATE TYPE "QualidadeFruto" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "StatusRecepcao" AS ENUM ('ATIVA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigemLote" AS ENUM ('RECEPCAO', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "TipoMovimentoEstoque" AS ENUM ('ENTRADA', 'ESTORNO_RECEPCAO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "MotivoAjusteEstoque" AS ENUM ('VENCIDO', 'AVARIA', 'AMOSTRA', 'INVENTARIO', 'CONSUMO_INTERNO', 'OUTRO');

-- AlterTable
ALTER TABLE "configuracoes_producao" ADD COLUMN     "categoriaCompraFrutoId" TEXT,
ADD COLUMN     "prazoPagamentoProdutorDias" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "lotes" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "codigoManual" BOOLEAN NOT NULL DEFAULT false,
    "produtoId" TEXT NOT NULL,
    "origem" "OrigemLote" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "validade" TIMESTAMP(3) NOT NULL,
    "localId" TEXT NOT NULL,
    "quantidadeInicialKg" DECIMAL(18,3) NOT NULL,
    "saldoKg" DECIMAL(18,3) NOT NULL,
    "custoKg" DECIMAL(18,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_estoque" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoMovimentoEstoque" NOT NULL,
    "quantidadeKg" DECIMAL(18,3) NOT NULL,
    "ajusteId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentos_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustes_estoque" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "loteId" TEXT NOT NULL,
    "quantidadeKg" DECIMAL(18,3) NOT NULL,
    "motivo" "MotivoAjusteEstoque" NOT NULL,
    "observacao" TEXT,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ajustes_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepcoes_fruto" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "produtoId" TEXT NOT NULL,
    "origem" "OrigemRecepcao" NOT NULL,
    "talhaoId" TEXT,
    "fornecedorId" TEXT,
    "pesoBrutoKg" DECIMAL(18,3) NOT NULL,
    "descarteKg" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "precoKg" DECIMAL(18,4) NOT NULL,
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "qualidade" "QualidadeFruto",
    "documento" TEXT,
    "observacao" TEXT,
    "safraId" TEXT,
    "tituloId" TEXT,
    "status" "StatusRecepcao" NOT NULL DEFAULT 'ATIVA',
    "motivoCancelamento" TEXT,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recepcoes_fruto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lotes_filialId_produtoId_idx" ON "lotes"("filialId", "produtoId");

-- CreateIndex
CREATE INDEX "lotes_filialId_validade_idx" ON "lotes"("filialId", "validade");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_filialId_codigo_key" ON "lotes"("filialId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "movimentos_estoque_ajusteId_key" ON "movimentos_estoque"("ajusteId");

-- CreateIndex
CREATE INDEX "movimentos_estoque_loteId_idx" ON "movimentos_estoque"("loteId");

-- CreateIndex
CREATE INDEX "movimentos_estoque_filialId_data_idx" ON "movimentos_estoque"("filialId", "data");

-- CreateIndex
CREATE INDEX "ajustes_estoque_filialId_data_idx" ON "ajustes_estoque"("filialId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "recepcoes_fruto_loteId_key" ON "recepcoes_fruto"("loteId");

-- CreateIndex
CREATE UNIQUE INDEX "recepcoes_fruto_tituloId_key" ON "recepcoes_fruto"("tituloId");

-- CreateIndex
CREATE INDEX "recepcoes_fruto_filialId_data_idx" ON "recepcoes_fruto"("filialId", "data");

-- AddForeignKey
ALTER TABLE "configuracoes_producao" ADD CONSTRAINT "configuracoes_producao_categoriaCompraFrutoId_fkey" FOREIGN KEY ("categoriaCompraFrutoId") REFERENCES "categorias_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_localId_fkey" FOREIGN KEY ("localId") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_ajusteId_fkey" FOREIGN KEY ("ajusteId") REFERENCES "ajustes_estoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_estoque" ADD CONSTRAINT "ajustes_estoque_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_estoque" ADD CONSTRAINT "ajustes_estoque_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_estoque" ADD CONSTRAINT "ajustes_estoque_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_talhaoId_fkey" FOREIGN KEY ("talhaoId") REFERENCES "talhoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_safraId_fkey" FOREIGN KEY ("safraId") REFERENCES "safras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_tituloId_fkey" FOREIGN KEY ("tituloId") REFERENCES "titulos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
