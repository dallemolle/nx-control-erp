-- Reformata o cnpjCpf ja gravado em empresas/filiais/fornecedores/clientes.
-- Ate aqui o cadastro nao normalizava o valor digitado (ex.: um CPF colado
-- so com digitos ficava gravado sem mascara). Esta migration extrai os
-- digitos e remonta a mascara certa por tamanho (11 = CPF, 14 = CNPJ);
-- qualquer outro tamanho fica so com os digitos, sem mascara, ja que nao
-- corresponde a um CPF nem a um CNPJ valido.

CREATE FUNCTION "_migrate_formatar_cnpj_cpf"(valor text) RETURNS text AS $$
DECLARE
  digitos text := regexp_replace(valor, '\D', '', 'g');
BEGIN
  IF length(digitos) = 11 THEN
    RETURN substring(digitos from 1 for 3) || '.' || substring(digitos from 4 for 3) || '.' ||
           substring(digitos from 7 for 3) || '-' || substring(digitos from 10 for 2);
  ELSIF length(digitos) = 14 THEN
    RETURN substring(digitos from 1 for 2) || '.' || substring(digitos from 3 for 3) || '.' ||
           substring(digitos from 6 for 3) || '/' || substring(digitos from 9 for 4) || '-' ||
           substring(digitos from 13 for 2);
  ELSE
    RETURN digitos;
  END IF;
END;
$$ LANGUAGE plpgsql;

UPDATE "empresas" SET "cnpjCpf" = "_migrate_formatar_cnpj_cpf"("cnpjCpf");
UPDATE "filiais" SET "cnpjCpf" = "_migrate_formatar_cnpj_cpf"("cnpjCpf");
UPDATE "fornecedores" SET "cnpjCpf" = "_migrate_formatar_cnpj_cpf"("cnpjCpf");
UPDATE "clientes" SET "cnpjCpf" = "_migrate_formatar_cnpj_cpf"("cnpjCpf");

DROP FUNCTION "_migrate_formatar_cnpj_cpf"(text);
