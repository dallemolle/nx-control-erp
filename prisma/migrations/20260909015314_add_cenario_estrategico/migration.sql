-- CreateEnum
CREATE TYPE "TipoCenarioEstrategico" AS ENUM ('BASE', 'OTIMISTA', 'PESSIMISTA');

-- CreateTable
CREATE TABLE "cenarios_estrategicos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoCenarioEstrategico" NOT NULL,
    "crescimentoReceita" DECIMAL(7,4) NOT NULL,
    "crescimentoCustos" DECIMAL(7,4) NOT NULL,
    "capexPercentualReceita" DECIMAL(7,4) NOT NULL,
    "novoEndividamentoAnual" DECIMAL(18,2) NOT NULL,
    "taxaJurosAnual" DECIMAL(7,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cenarios_estrategicos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cenarios_estrategicos_empresaId_idx" ON "cenarios_estrategicos"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "cenarios_estrategicos_empresaId_tipo_key" ON "cenarios_estrategicos"("empresaId", "tipo");

-- AddForeignKey
ALTER TABLE "cenarios_estrategicos" ADD CONSTRAINT "cenarios_estrategicos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
