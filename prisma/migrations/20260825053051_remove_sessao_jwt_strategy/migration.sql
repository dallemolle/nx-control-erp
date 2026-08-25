/*
  Warnings:

  - You are about to drop the `sessoes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "sessoes" DROP CONSTRAINT "sessoes_usuarioId_fkey";

-- DropTable
DROP TABLE "sessoes";
