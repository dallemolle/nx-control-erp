-- CreateEnum
CREATE TYPE "ModalidadeCartao" AS ENUM ('DEBITO', 'CREDITO_VISTA', 'CREDITO_PARCELADO', 'PIX_MAQUININHA');

-- AlterTable
ALTER TABLE "pedidos_venda" ADD COLUMN     "modalidadeCartao" "ModalidadeCartao",
ADD COLUMN     "operadoraCartaoId" TEXT,
ADD COLUMN     "parcelasCartao" INTEGER,
ADD COLUMN     "taxaCartaoPercentual" DECIMAL(7,4),
ADD COLUMN     "tituloTaxaId" TEXT;

-- CreateTable
CREATE TABLE "operadoras_cartao" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "categoriaTaxaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operadoras_cartao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condicoes_operadora_cartao" (
    "id" TEXT NOT NULL,
    "operadoraId" TEXT NOT NULL,
    "modalidade" "ModalidadeCartao" NOT NULL,
    "parcelasDe" INTEGER NOT NULL,
    "parcelasAte" INTEGER NOT NULL,
    "taxaPercentual" DECIMAL(7,4) NOT NULL,
    "prazoDias" INTEGER NOT NULL,
    "antecipado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "condicoes_operadora_cartao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repasses_cartao_confirmados" (
    "id" TEXT NOT NULL,
    "parcelaId" TEXT NOT NULL,
    "baixaRecebimentoId" TEXT NOT NULL,
    "baixaTaxaId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repasses_cartao_confirmados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operadoras_cartao_filialId_idx" ON "operadoras_cartao"("filialId");

-- CreateIndex
CREATE UNIQUE INDEX "operadoras_cartao_filialId_nome_key" ON "operadoras_cartao"("filialId", "nome");

-- CreateIndex
CREATE INDEX "condicoes_operadora_cartao_operadoraId_idx" ON "condicoes_operadora_cartao"("operadoraId");

-- CreateIndex
CREATE UNIQUE INDEX "repasses_cartao_confirmados_parcelaId_key" ON "repasses_cartao_confirmados"("parcelaId");

-- CreateIndex
CREATE UNIQUE INDEX "repasses_cartao_confirmados_baixaRecebimentoId_key" ON "repasses_cartao_confirmados"("baixaRecebimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "repasses_cartao_confirmados_baixaTaxaId_key" ON "repasses_cartao_confirmados"("baixaTaxaId");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_venda_tituloTaxaId_key" ON "pedidos_venda"("tituloTaxaId");

-- AddForeignKey
ALTER TABLE "operadoras_cartao" ADD CONSTRAINT "operadoras_cartao_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operadoras_cartao" ADD CONSTRAINT "operadoras_cartao_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operadoras_cartao" ADD CONSTRAINT "operadoras_cartao_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operadoras_cartao" ADD CONSTRAINT "operadoras_cartao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operadoras_cartao" ADD CONSTRAINT "operadoras_cartao_categoriaTaxaId_fkey" FOREIGN KEY ("categoriaTaxaId") REFERENCES "categorias_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condicoes_operadora_cartao" ADD CONSTRAINT "condicoes_operadora_cartao_operadoraId_fkey" FOREIGN KEY ("operadoraId") REFERENCES "operadoras_cartao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasses_cartao_confirmados" ADD CONSTRAINT "repasses_cartao_confirmados_parcelaId_fkey" FOREIGN KEY ("parcelaId") REFERENCES "parcelas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasses_cartao_confirmados" ADD CONSTRAINT "repasses_cartao_confirmados_baixaRecebimentoId_fkey" FOREIGN KEY ("baixaRecebimentoId") REFERENCES "baixas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasses_cartao_confirmados" ADD CONSTRAINT "repasses_cartao_confirmados_baixaTaxaId_fkey" FOREIGN KEY ("baixaTaxaId") REFERENCES "baixas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_tituloTaxaId_fkey" FOREIGN KEY ("tituloTaxaId") REFERENCES "titulos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_operadoraCartaoId_fkey" FOREIGN KEY ("operadoraCartaoId") REFERENCES "operadoras_cartao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
