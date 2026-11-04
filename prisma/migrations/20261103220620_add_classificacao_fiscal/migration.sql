-- CreateEnum
CREATE TYPE "ClassificacaoFiscal" AS ENUM ('FISCAL', 'GERENCIAL');

-- CreateEnum
CREATE TYPE "TipoComprovante" AS ENUM ('NFE', 'NFCE', 'NFSE', 'CTE', 'NF_PRODUTOR', 'NF_ENTRADA', 'GUIA_TRIBUTO', 'FOLHA_PAGAMENTO', 'TARIFA_BANCARIA', 'CONTRATO', 'OUTRO_FISCAL', 'RECIBO', 'PEDIDO_INTERNO', 'SEM_COMPROVANTE');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "classificacaoFiscalPadrao" "ClassificacaoFiscal";

-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN     "classificacaoFiscalPadrao" "ClassificacaoFiscal";

-- AlterTable
ALTER TABLE "lancamentos_bancarios" ADD COLUMN     "classificacaoFiscal" "ClassificacaoFiscal" DEFAULT 'FISCAL',
ADD COLUMN     "numeroComprovante" TEXT,
ADD COLUMN     "tipoComprovante" "TipoComprovante";

-- AlterTable
ALTER TABLE "titulos" ADD COLUMN     "chaveAcesso" TEXT,
ADD COLUMN     "classificacaoFiscal" "ClassificacaoFiscal" NOT NULL DEFAULT 'FISCAL',
ADD COLUMN     "dataEmissaoDocumentoFiscal" TIMESTAMP(3),
ADD COLUMN     "motivoSemDocumento" TEXT,
ADD COLUMN     "numeroDocumentoFiscal" TEXT,
ADD COLUMN     "serieDocumentoFiscal" TEXT,
ADD COLUMN     "tipoComprovante" "TipoComprovante";

-- CreateIndex
CREATE INDEX "lancamentos_bancarios_filialId_classificacaoFiscal_data_idx" ON "lancamentos_bancarios"("filialId", "classificacaoFiscal", "data");

-- CreateIndex
CREATE INDEX "titulos_filialId_classificacaoFiscal_idx" ON "titulos"("filialId", "classificacaoFiscal");

-- CreateIndex
CREATE INDEX "titulos_filialId_chaveAcesso_idx" ON "titulos"("filialId", "chaveAcesso");

-- Backfill (FG1): titulos e lancamentos existentes ficam FISCAL (default das colunas).
-- Lancamentos de baixa herdam a classificacao do titulo (hoje sempre FISCAL, mas
-- explicito para nao depender disso); transferencias ficam NULL (nao sao receita
-- nem despesa).
UPDATE "lancamentos_bancarios" l
   SET "classificacaoFiscal" = t."classificacaoFiscal"
  FROM "baixas" b
  JOIN "parcelas" p ON p."id" = b."parcelaId"
  JOIN "titulos"  t ON t."id" = p."tituloId"
 WHERE l."baixaId" = b."id";

UPDATE "lancamentos_bancarios" SET "classificacaoFiscal" = NULL
 WHERE "origem" = 'TRANSFERENCIA';

-- Integridade (adicionadas depois do backfill: todas as linhas existentes ja satisfazem)
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_classificacao_chk"
  CHECK ("origem" = 'TRANSFERENCIA' OR "classificacaoFiscal" IS NOT NULL);

ALTER TABLE "titulos" ADD CONSTRAINT "titulos_comprovante_coerente_chk" CHECK (
  "tipoComprovante" IS NULL
  OR ("classificacaoFiscal" = 'FISCAL'    AND "tipoComprovante" NOT IN ('RECIBO', 'PEDIDO_INTERNO', 'SEM_COMPROVANTE'))
  OR ("classificacaoFiscal" = 'GERENCIAL' AND "tipoComprovante"     IN ('RECIBO', 'PEDIDO_INTERNO', 'SEM_COMPROVANTE'))
);

ALTER TABLE "titulos" ADD CONSTRAINT "titulos_chave_acesso_chk"
  CHECK ("chaveAcesso" IS NULL OR "chaveAcesso" ~ '^[0-9]{44}$');
