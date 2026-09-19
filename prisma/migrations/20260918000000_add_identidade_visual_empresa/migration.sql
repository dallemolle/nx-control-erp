-- Adiciona cor de fundo da sidebar e logo, opcionais, configuraveis por
-- empresa. Sem NOT NULL, sem default: toda empresa ja cadastrada recebe
-- NULL nas duas colunas e continua com a aparencia atual ate o
-- Administrador configurar.

ALTER TABLE "empresas" ADD COLUMN "corPrimaria" TEXT;
ALTER TABLE "empresas" ADD COLUMN "logoUrl" TEXT;
