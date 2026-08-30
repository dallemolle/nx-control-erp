-- Backfill: cria uma Filial "Matriz" para cada Empresa existente, reaproveitando
-- cnpj/ativo da empresa, e propaga o vínculo para os registros já existentes.
-- Só DML — sem alteração de schema. Em uma base "empresas" vazia (banco novo,
-- ainda sem seed), os INSERT/UPDATE abaixo afetam 0 linhas e não geram erro.

-- (a) Uma Filial "Matriz" por Empresa existente.
INSERT INTO "filiais" ("id", "empresaId", "nome", "cnpj", "ativo", "criadoEm", "atualizadoEm")
SELECT gen_random_uuid(), "id", 'Matriz', "cnpj", "ativo", now(), now()
FROM "empresas";

-- (b) Propaga filialId para os 6 entities via join por empresaId -> Matriz.
UPDATE "centros_custo" cc
SET "filialId" = f."id"
FROM "filiais" f
WHERE f."empresaId" = cc."empresaId";

UPDATE "centros_lucro" cl
SET "filialId" = f."id"
FROM "filiais" f
WHERE f."empresaId" = cl."empresaId";

UPDATE "safras" s
SET "filialId" = f."id"
FROM "filiais" f
WHERE f."empresaId" = s."empresaId";

UPDATE "projetos" p
SET "filialId" = f."id"
FROM "filiais" f
WHERE f."empresaId" = p."empresaId";

UPDATE "categorias_financeiras" cf
SET "filialId" = f."id"
FROM "filiais" f
WHERE f."empresaId" = cf."empresaId";

UPDATE "contas_bancarias" cb
SET "filialId" = f."id"
FROM "filiais" f
WHERE f."empresaId" = cb."empresaId";

-- (c) Vincula cada usuario_empresa existente à Filial Matriz da sua empresa,
-- com podeAlterar = true (acesso total, equivalente ao comportamento anterior
-- sem isolamento por filial). audit_logs não é tocado — histórico fica com
-- filialId nulo.
INSERT INTO "usuarios_empresas_filiais" ("id", "usuarioEmpresaId", "filialId", "podeAlterar", "ativo", "criadoEm")
SELECT gen_random_uuid(), ue."id", f."id", true, true, now()
FROM "usuarios_empresas" ue
JOIN "filiais" f ON f."empresaId" = ue."empresaId";
