-- CreateEnum
CREATE TYPE "CategoriaProduto" AS ENUM ('FRUTO', 'POLPA');

-- CreateEnum
CREATE TYPE "Conservacao" AS ENUM ('IN_NATURA', 'RESFRIADO', 'CONGELADO');

-- CreateEnum
CREATE TYPE "TipoLocalArmazenamento" AS ENUM ('CAMARA_FRIA', 'FREEZER', 'REFRIGERADOR', 'RECEPCAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "CanalVenda" AS ENUM ('BATEDOR', 'ATACADO', 'VAREJO', 'RESTAURANTE', 'INDUSTRIA', 'CONSUMIDOR_FINAL', 'OUTRO');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "canalVenda" "CanalVenda",
ADD COLUMN     "enderecoEntrega" TEXT,
ADD COLUMN     "municipio" TEXT,
ADD COLUMN     "retiraNaPropriedade" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "cnpjCpf" DROP NOT NULL;

-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN     "municipio" TEXT;

-- CreateTable
CREATE TABLE "frutas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "custoPadraoKg" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "exigeBranqueamento" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "frutas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" "CategoriaProduto" NOT NULL,
    "frutaId" TEXT NOT NULL,
    "conservacao" "Conservacao" NOT NULL,
    "validadeDias" INTEGER NOT NULL,
    "precoReferenciaKg" DECIMAL(18,4),
    "armazenamento" TEXT,
    "unidadeComercial" TEXT,
    "fatorUnidadeKg" DECIMAL(18,3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "custoUnitario" DECIMAL(18,4) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talhoes" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "frutaId" TEXT NOT NULL,
    "areaHa" DECIMAL(10,2) NOT NULL,
    "anoPlantio" INTEGER,
    "espacamento" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talhoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locais_armazenamento" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoLocalArmazenamento" NOT NULL,
    "temperatura" TEXT,
    "capacidadeKg" DECIMAL(18,3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locais_armazenamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes_producao" (
    "filialId" TEXT NOT NULL,
    "registroAdepara" TEXT,
    "alertaVencimentoCongeladoDias" INTEGER NOT NULL DEFAULT 30,
    "alertaVencimentoResfriadoDias" INTEGER NOT NULL DEFAULT 1,
    "branqueamentoTemperaturaMinC" DECIMAL(5,1) NOT NULL DEFAULT 80,
    "branqueamentoTempoMinS" INTEGER NOT NULL DEFAULT 10,
    "toleranciaBalancoMassa" DECIMAL(5,4) NOT NULL DEFAULT 0.03,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_producao_pkey" PRIMARY KEY ("filialId")
);

-- CreateIndex
CREATE INDEX "frutas_empresaId_idx" ON "frutas"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "frutas_empresaId_nome_key" ON "frutas"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "produtos_empresaId_idx" ON "produtos"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_empresaId_codigo_key" ON "produtos"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "insumos_empresaId_idx" ON "insumos"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "insumos_empresaId_nome_key" ON "insumos"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "talhoes_filialId_idx" ON "talhoes"("filialId");

-- CreateIndex
CREATE UNIQUE INDEX "talhoes_filialId_nome_key" ON "talhoes"("filialId", "nome");

-- CreateIndex
CREATE INDEX "locais_armazenamento_filialId_idx" ON "locais_armazenamento"("filialId");

-- CreateIndex
CREATE UNIQUE INDEX "locais_armazenamento_filialId_nome_key" ON "locais_armazenamento"("filialId", "nome");

-- AddForeignKey
ALTER TABLE "frutas" ADD CONSTRAINT "frutas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_frutaId_fkey" FOREIGN KEY ("frutaId") REFERENCES "frutas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talhoes" ADD CONSTRAINT "talhoes_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talhoes" ADD CONSTRAINT "talhoes_frutaId_fkey" FOREIGN KEY ("frutaId") REFERENCES "frutas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locais_armazenamento" ADD CONSTRAINT "locais_armazenamento_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes_producao" ADD CONSTRAINT "configuracoes_producao_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
