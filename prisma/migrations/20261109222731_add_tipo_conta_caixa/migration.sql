-- AlterEnum
ALTER TYPE "TipoContaBancaria" ADD VALUE 'CAIXA';

-- Banco sentinela das contas Caixa (dinheiro em espécie). Idempotente.
INSERT INTO "bancos" ("id", "codigo", "nome")
VALUES (gen_random_uuid()::text, 'CX', 'Caixa interno (dinheiro em espécie)')
ON CONFLICT ("codigo") DO NOTHING;
