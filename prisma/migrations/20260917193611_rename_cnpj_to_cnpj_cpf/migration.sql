-- Renomeia a coluna cnpj para cnpjCpf em empresas e filiais (preserva os dados
-- existentes — nao e um drop+add). A empresa/filial pode ser pessoa fisica (CPF)
-- ou juridica (CNPJ); o campo ja aceitava qualquer um dos dois na pratica (so
-- exigia minimo de 11 caracteres), o nome so estava desatualizado.

ALTER TABLE "empresas" RENAME COLUMN "cnpj" TO "cnpjCpf";
ALTER INDEX "empresas_cnpj_key" RENAME TO "empresas_cnpjCpf_key";

ALTER TABLE "filiais" RENAME COLUMN "cnpj" TO "cnpjCpf";
ALTER INDEX "filiais_cnpj_key" RENAME TO "filiais_cnpjCpf_key";
