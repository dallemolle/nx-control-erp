-- Condição da venda a prazo; os vencimentos ficam só nas parcelas do título.
ALTER TABLE "pedidos_venda" ADD COLUMN "condicaoPagamento" TEXT;

-- Pedidos a prazo já gravados: a condição é o prazo único que eles tinham.
UPDATE "pedidos_venda"
SET "condicaoPagamento" = ("vencimento"::date - "data"::date)::text
WHERE "formaPagamento" = 'A_PRAZO' AND "vencimento" IS NOT NULL;

-- AlterTable
ALTER TABLE "pedidos_venda" DROP COLUMN "vencimento";
