-- AlterTable
ALTER TABLE "ordens_producao" ADD COLUMN     "branqueamentoTemperaturaMinC" DECIMAL(5,1),
ADD COLUMN     "branqueamentoTempoMinS" INTEGER,
ADD COLUMN     "toleranciaBalancoMassa" DECIMAL(5,4);

-- OPs já encerradas (e as canceladas depois de encerradas, que guardam o custo) recebem a configuração de hoje da
-- filial, ou os padrões (3%, 80 °C, 10 s) se ela nunca salvou: o que aparece hoje não muda, e mudar a
-- configuração daqui em diante não mexe mais nelas.
UPDATE "ordens_producao" AS op
SET "toleranciaBalancoMassa" = COALESCE(c."toleranciaBalancoMassa", 0.03),
    "branqueamentoTemperaturaMinC" = COALESCE(c."branqueamentoTemperaturaMinC", 80),
    "branqueamentoTempoMinS" = COALESCE(c."branqueamentoTempoMinS", 10)
FROM "ordens_producao" AS o
LEFT JOIN "configuracoes_producao" AS c ON c."filialId" = o."filialId"
WHERE op."id" = o."id" AND (o."status" = 'ENCERRADA' OR o."custoKgPolpa" IS NOT NULL);
