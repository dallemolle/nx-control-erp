-- CreateEnum
CREATE TYPE "MeioPagamento" AS ENUM ('PIX', 'DEPOSITO_BANCARIO');

-- CreateEnum
CREATE TYPE "TipoChavePix" AS ENUM ('CPF_CNPJ', 'CELULAR', 'EMAIL', 'ALEATORIA');

-- CreateEnum
CREATE TYPE "TipoContaTerceiro" AS ENUM ('CORRENTE', 'POUPANCA');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "agencia" TEXT,
ADD COLUMN     "bancoId" TEXT,
ADD COLUMN     "chavePix" TEXT,
ADD COLUMN     "conta" TEXT,
ADD COLUMN     "meioPagamento" "MeioPagamento",
ADD COLUMN     "tipoChavePix" "TipoChavePix",
ADD COLUMN     "tipoContaTerceiro" "TipoContaTerceiro",
ADD COLUMN     "titularConta" TEXT;

-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN     "agencia" TEXT,
ADD COLUMN     "bancoId" TEXT,
ADD COLUMN     "chavePix" TEXT,
ADD COLUMN     "conta" TEXT,
ADD COLUMN     "meioPagamento" "MeioPagamento",
ADD COLUMN     "tipoChavePix" "TipoChavePix",
ADD COLUMN     "tipoContaTerceiro" "TipoContaTerceiro",
ADD COLUMN     "titularConta" TEXT;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES "bancos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES "bancos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
