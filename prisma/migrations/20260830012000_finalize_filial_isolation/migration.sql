-- DropForeignKey
ALTER TABLE "categorias_financeiras" DROP CONSTRAINT "categorias_financeiras_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "centros_custo" DROP CONSTRAINT "centros_custo_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "centros_lucro" DROP CONSTRAINT "centros_lucro_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "contas_bancarias" DROP CONSTRAINT "contas_bancarias_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "projetos" DROP CONSTRAINT "projetos_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "safras" DROP CONSTRAINT "safras_empresaId_fkey";

-- DropIndex
DROP INDEX "categorias_financeiras_empresaId_idx";

-- DropIndex
DROP INDEX "centros_custo_empresaId_codigo_key";

-- DropIndex
DROP INDEX "centros_custo_empresaId_idx";

-- DropIndex
DROP INDEX "centros_lucro_empresaId_codigo_key";

-- DropIndex
DROP INDEX "centros_lucro_empresaId_idx";

-- DropIndex
DROP INDEX "contas_bancarias_empresaId_bancoId_agencia_conta_key";

-- DropIndex
DROP INDEX "contas_bancarias_empresaId_idx";

-- DropIndex
DROP INDEX "projetos_empresaId_codigo_key";

-- DropIndex
DROP INDEX "projetos_empresaId_idx";

-- DropIndex
DROP INDEX "safras_empresaId_idx";

-- DropIndex
DROP INDEX "safras_empresaId_nome_key";

-- AlterTable
ALTER TABLE "categorias_financeiras" DROP COLUMN "empresaId",
ALTER COLUMN "filialId" SET NOT NULL;

-- AlterTable
ALTER TABLE "centros_custo" DROP COLUMN "empresaId",
ALTER COLUMN "filialId" SET NOT NULL;

-- AlterTable
ALTER TABLE "centros_lucro" DROP COLUMN "empresaId",
ALTER COLUMN "filialId" SET NOT NULL;

-- AlterTable
ALTER TABLE "contas_bancarias" DROP COLUMN "empresaId",
ALTER COLUMN "filialId" SET NOT NULL;

-- AlterTable
ALTER TABLE "projetos" DROP COLUMN "empresaId",
ALTER COLUMN "filialId" SET NOT NULL;

-- AlterTable
ALTER TABLE "safras" DROP COLUMN "empresaId",
ALTER COLUMN "filialId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "categorias_financeiras_filialId_idx" ON "categorias_financeiras"("filialId");

-- CreateIndex
CREATE INDEX "centros_custo_filialId_idx" ON "centros_custo"("filialId");

-- CreateIndex
CREATE UNIQUE INDEX "centros_custo_filialId_codigo_key" ON "centros_custo"("filialId", "codigo");

-- CreateIndex
CREATE INDEX "centros_lucro_filialId_idx" ON "centros_lucro"("filialId");

-- CreateIndex
CREATE UNIQUE INDEX "centros_lucro_filialId_codigo_key" ON "centros_lucro"("filialId", "codigo");

-- CreateIndex
CREATE INDEX "contas_bancarias_filialId_idx" ON "contas_bancarias"("filialId");

-- CreateIndex
CREATE UNIQUE INDEX "contas_bancarias_filialId_bancoId_agencia_conta_key" ON "contas_bancarias"("filialId", "bancoId", "agencia", "conta");

-- CreateIndex
CREATE INDEX "projetos_filialId_idx" ON "projetos"("filialId");

-- CreateIndex
CREATE UNIQUE INDEX "projetos_filialId_codigo_key" ON "projetos"("filialId", "codigo");

-- CreateIndex
CREATE INDEX "safras_filialId_idx" ON "safras"("filialId");

-- CreateIndex
CREATE UNIQUE INDEX "safras_filialId_nome_key" ON "safras"("filialId", "nome");

