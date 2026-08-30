-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "filialId" TEXT;

-- AlterTable
ALTER TABLE "categorias_financeiras" ADD COLUMN     "filialId" TEXT;

-- AlterTable
ALTER TABLE "centros_custo" ADD COLUMN     "filialId" TEXT;

-- AlterTable
ALTER TABLE "centros_lucro" ADD COLUMN     "filialId" TEXT;

-- AlterTable
ALTER TABLE "contas_bancarias" ADD COLUMN     "filialId" TEXT;

-- AlterTable
ALTER TABLE "projetos" ADD COLUMN     "filialId" TEXT;

-- AlterTable
ALTER TABLE "safras" ADD COLUMN     "filialId" TEXT;

-- CreateTable
CREATE TABLE "filiais" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filiais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios_empresas_filiais" (
    "id" TEXT NOT NULL,
    "usuarioEmpresaId" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "podeAlterar" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_empresas_filiais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "filiais_cnpj_key" ON "filiais"("cnpj");

-- CreateIndex
CREATE INDEX "filiais_empresaId_idx" ON "filiais"("empresaId");

-- CreateIndex
CREATE INDEX "usuarios_empresas_filiais_filialId_idx" ON "usuarios_empresas_filiais"("filialId");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_empresas_filiais_usuarioEmpresaId_filialId_key" ON "usuarios_empresas_filiais"("usuarioEmpresaId", "filialId");

-- CreateIndex
CREATE INDEX "audit_logs_filialId_idx" ON "audit_logs"("filialId");

-- AddForeignKey
ALTER TABLE "filiais" ADD CONSTRAINT "filiais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_empresas_filiais" ADD CONSTRAINT "usuarios_empresas_filiais_usuarioEmpresaId_fkey" FOREIGN KEY ("usuarioEmpresaId") REFERENCES "usuarios_empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_empresas_filiais" ADD CONSTRAINT "usuarios_empresas_filiais_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centros_custo" ADD CONSTRAINT "centros_custo_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centros_lucro" ADD CONSTRAINT "centros_lucro_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safras" ADD CONSTRAINT "safras_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_financeiras" ADD CONSTRAINT "categorias_financeiras_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE SET NULL ON UPDATE CASCADE;
