-- CreateEnum
CREATE TYPE "FormaPagamentoVenda" AS ENUM ('DINHEIRO', 'PIX', 'TRANSFERENCIA', 'CARTAO', 'A_PRAZO');

-- CreateEnum
CREATE TYPE "StatusPedidoVenda" AS ENUM ('CONFIRMADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusEntrega" AS ENUM ('PENDENTE', 'EM_ROTA', 'ENTREGUE', 'CANCELADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'VENDA';
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'ESTORNO_VENDA';

-- AlterTable
ALTER TABLE "configuracoes_producao" ADD COLUMN     "categoriaVendaId" TEXT,
ADD COLUMN     "contaCaixaPadraoId" TEXT,
ADD COLUMN     "contaRecebimentoPadraoId" TEXT;

-- AlterTable
ALTER TABLE "movimentos_estoque" ADD COLUMN     "itemPedidoId" TEXT;

-- CreateTable
CREATE TABLE "pedidos_venda" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "clienteId" TEXT NOT NULL,
    "canal" "CanalVenda",
    "formaPagamento" "FormaPagamentoVenda" NOT NULL,
    "vencimento" TIMESTAMP(3),
    "contaBancariaId" TEXT,
    "retiraNaPropriedade" BOOLEAN NOT NULL DEFAULT false,
    "numeroDocumentoFiscal" TEXT,
    "observacao" TEXT,
    "status" "StatusPedidoVenda" NOT NULL DEFAULT 'CONFIRMADO',
    "motivoCancelamento" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "tituloId" TEXT,
    "baixaAutomaticaId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_pedido_venda" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "quantidadeKg" DECIMAL(18,3) NOT NULL,
    "precoKg" DECIMAL(18,4) NOT NULL,
    "custoKg" DECIMAL(18,4) NOT NULL,
    "motivoLiberacaoVencido" TEXT,

    CONSTRAINT "itens_pedido_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas" (
    "pedidoId" TEXT NOT NULL,
    "dataPrevista" TIMESTAMP(3) NOT NULL,
    "dataRealizada" TIMESTAMP(3),
    "endereco" TEXT,
    "responsavel" TEXT,
    "recebidoPor" TEXT,
    "observacao" TEXT,
    "status" "StatusEntrega" NOT NULL DEFAULT 'PENDENTE',
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entregas_pkey" PRIMARY KEY ("pedidoId")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_venda_tituloId_key" ON "pedidos_venda"("tituloId");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_venda_baixaAutomaticaId_key" ON "pedidos_venda"("baixaAutomaticaId");

-- CreateIndex
CREATE INDEX "pedidos_venda_filialId_data_idx" ON "pedidos_venda"("filialId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_venda_filialId_numero_key" ON "pedidos_venda"("filialId", "numero");

-- CreateIndex
CREATE INDEX "itens_pedido_venda_pedidoId_idx" ON "itens_pedido_venda"("pedidoId");

-- CreateIndex
CREATE INDEX "itens_pedido_venda_loteId_idx" ON "itens_pedido_venda"("loteId");

-- CreateIndex
CREATE INDEX "entregas_status_dataPrevista_idx" ON "entregas"("status", "dataPrevista");

-- CreateIndex
CREATE INDEX "movimentos_estoque_itemPedidoId_idx" ON "movimentos_estoque"("itemPedidoId");

-- AddForeignKey
ALTER TABLE "configuracoes_producao" ADD CONSTRAINT "configuracoes_producao_categoriaVendaId_fkey" FOREIGN KEY ("categoriaVendaId") REFERENCES "categorias_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes_producao" ADD CONSTRAINT "configuracoes_producao_contaRecebimentoPadraoId_fkey" FOREIGN KEY ("contaRecebimentoPadraoId") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes_producao" ADD CONSTRAINT "configuracoes_producao_contaCaixaPadraoId_fkey" FOREIGN KEY ("contaCaixaPadraoId") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_itemPedidoId_fkey" FOREIGN KEY ("itemPedidoId") REFERENCES "itens_pedido_venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_tituloId_fkey" FOREIGN KEY ("tituloId") REFERENCES "titulos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_baixaAutomaticaId_fkey" FOREIGN KEY ("baixaAutomaticaId") REFERENCES "baixas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido_venda" ADD CONSTRAINT "itens_pedido_venda_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos_venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido_venda" ADD CONSTRAINT "itens_pedido_venda_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos_venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
