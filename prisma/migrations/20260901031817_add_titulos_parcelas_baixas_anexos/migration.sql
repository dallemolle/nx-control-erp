-- CreateEnum
CREATE TYPE "TipoTitulo" AS ENUM ('PAGAR', 'RECEBER');

-- CreateEnum
CREATE TYPE "StatusParcela" AS ENUM ('EM_ABERTO', 'A_VENCER', 'VENCIDO', 'PARCIALMENTE_PAGO', 'PAGO', 'CANCELADO', 'RENEGOCIADO');

-- CreateEnum
CREATE TYPE "StatusAprovacaoBaixa" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO');

-- CreateTable
CREATE TABLE "titulos" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "tipo" "TipoTitulo" NOT NULL,
    "fornecedorId" TEXT,
    "clienteId" TEXT,
    "documento" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataCompetencia" TIMESTAMP(3) NOT NULL,
    "categoriaFinanceiraId" TEXT NOT NULL,
    "centroCustoId" TEXT,
    "centroLucroId" TEXT,
    "safraId" TEXT,
    "projetoId" TEXT,
    "contaBancariaId" TEXT,
    "formaPagamento" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "titulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcelas" (
    "id" TEXT NOT NULL,
    "tituloId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "valorOriginal" DECIMAL(18,2) NOT NULL,
    "valorAtualizado" DECIMAL(18,2) NOT NULL,
    "status" "StatusParcela" NOT NULL DEFAULT 'EM_ABERTO',
    "parcelaOrigemId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcelas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baixas" (
    "id" TEXT NOT NULL,
    "parcelaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valorPago" DECIMAL(18,2) NOT NULL,
    "valorJuros" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorMulta" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorDesconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "contaBancariaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "statusAprovacao" "StatusAprovacaoBaixa" NOT NULL DEFAULT 'PENDENTE',
    "avaliadoPorId" TEXT,
    "avaliadoEm" TIMESTAMP(3),
    "motivoRejeicao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baixas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexos" (
    "id" TEXT NOT NULL,
    "tituloId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "titulos_filialId_idx" ON "titulos"("filialId");

-- CreateIndex
CREATE INDEX "titulos_fornecedorId_idx" ON "titulos"("fornecedorId");

-- CreateIndex
CREATE INDEX "titulos_clienteId_idx" ON "titulos"("clienteId");

-- CreateIndex
CREATE INDEX "parcelas_tituloId_idx" ON "parcelas"("tituloId");

-- CreateIndex
CREATE INDEX "parcelas_status_idx" ON "parcelas"("status");

-- CreateIndex
CREATE UNIQUE INDEX "parcelas_tituloId_numero_key" ON "parcelas"("tituloId", "numero");

-- CreateIndex
CREATE INDEX "baixas_parcelaId_idx" ON "baixas"("parcelaId");

-- CreateIndex
CREATE INDEX "anexos_tituloId_idx" ON "anexos"("tituloId");

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_categoriaFinanceiraId_fkey" FOREIGN KEY ("categoriaFinanceiraId") REFERENCES "categorias_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "centros_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_centroLucroId_fkey" FOREIGN KEY ("centroLucroId") REFERENCES "centros_lucro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_safraId_fkey" FOREIGN KEY ("safraId") REFERENCES "safras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_tituloId_fkey" FOREIGN KEY ("tituloId") REFERENCES "titulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_parcelaOrigemId_fkey" FOREIGN KEY ("parcelaOrigemId") REFERENCES "parcelas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_parcelaId_fkey" FOREIGN KEY ("parcelaId") REFERENCES "parcelas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_avaliadoPorId_fkey" FOREIGN KEY ("avaliadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_tituloId_fkey" FOREIGN KEY ("tituloId") REFERENCES "titulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
