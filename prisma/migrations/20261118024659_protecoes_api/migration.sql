-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "expiraEm" TIMESTAMP(3),
ADD COLUMN     "janelaLimiteEm" TIMESTAMP(3),
ADD COLUMN     "requisicoesNaJanela" INTEGER NOT NULL DEFAULT 0;
