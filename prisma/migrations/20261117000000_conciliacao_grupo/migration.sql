-- Conciliação em grupo: N linhas do extrato ↔ M lançamentos com somas iguais.
CREATE TABLE "grupos_conciliacao" (
    "id" TEXT NOT NULL,
    "filialId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupos_conciliacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "grupos_conciliacao_filialId_idx" ON "grupos_conciliacao"("filialId");
CREATE INDEX "grupos_conciliacao_contaBancariaId_idx" ON "grupos_conciliacao"("contaBancariaId");

ALTER TABLE "grupos_conciliacao" ADD CONSTRAINT "grupos_conciliacao_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "filiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grupos_conciliacao" ADD CONSTRAINT "grupos_conciliacao_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grupos_conciliacao" ADD CONSTRAINT "grupos_conciliacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "linhas_extrato" ADD COLUMN "grupoConciliacaoId" TEXT;
ALTER TABLE "lancamentos_bancarios" ADD COLUMN "grupoConciliacaoId" TEXT;

CREATE INDEX "linhas_extrato_grupoConciliacaoId_idx" ON "linhas_extrato"("grupoConciliacaoId");
CREATE INDEX "lancamentos_bancarios_grupoConciliacaoId_idx" ON "lancamentos_bancarios"("grupoConciliacaoId");

ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_grupoConciliacaoId_fkey" FOREIGN KEY ("grupoConciliacaoId") REFERENCES "grupos_conciliacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_bancarios_grupoConciliacaoId_fkey" FOREIGN KEY ("grupoConciliacaoId") REFERENCES "grupos_conciliacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vínculos 1:1 já gravados viram grupos 1+1. O grupo reaproveita o id da linha
-- (uuid já único), quem importou o extrato fica como autor.
INSERT INTO "grupos_conciliacao" ("id", "filialId", "contaBancariaId", "usuarioId")
SELECT l."id", c."filialId", l."contaBancariaId", e."usuarioId"
FROM "linhas_extrato" l
JOIN "contas_bancarias" c ON c."id" = l."contaBancariaId"
JOIN "extratos_importados" e ON e."id" = l."extratoImportadoId"
WHERE l."lancamentoBancarioId" IS NOT NULL;

UPDATE "linhas_extrato" SET "grupoConciliacaoId" = "id" WHERE "lancamentoBancarioId" IS NOT NULL;

UPDATE "lancamentos_bancarios" lb
SET "grupoConciliacaoId" = l."id"
FROM "linhas_extrato" l
WHERE l."lancamentoBancarioId" = lb."id";

-- O vínculo antigo sai.
ALTER TABLE "linhas_extrato" DROP CONSTRAINT "linhas_extrato_lancamentoBancarioId_fkey";
DROP INDEX "linhas_extrato_lancamentoBancarioId_key";
ALTER TABLE "linhas_extrato" DROP COLUMN "lancamentoBancarioId";
