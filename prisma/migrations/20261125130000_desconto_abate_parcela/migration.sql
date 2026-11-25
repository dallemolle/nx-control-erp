-- Desconto abate o saldo da parcela (spec 2026-11-25-desconto-abate-parcela).
-- Recalcula PAGO x PARCIALMENTE_PAGO com o valor abatido das baixas aprovadas:
-- valorPago - valorJuros - valorMulta + valorDesconto. Parcela que fica sem nada
-- abatido é corrigida pela sincronização da lista de títulos.
WITH saldos AS (
  SELECT p."id",
         p."valorAtualizado" - COALESCE(SUM(b."valorPago" - b."valorJuros" - b."valorMulta" + b."valorDesconto"), 0) AS "saldo"
  FROM "parcelas" p
  LEFT JOIN "baixas" b ON b."parcelaId" = p."id" AND b."statusAprovacao" = 'APROVADO'
  WHERE p."status" IN ('PAGO', 'PARCIALMENTE_PAGO')
  GROUP BY p."id"
)
UPDATE "parcelas" p
SET "status" = CASE WHEN s."saldo" <= 0 THEN 'PAGO'::"StatusParcela" ELSE 'PARCIALMENTE_PAGO'::"StatusParcela" END,
    "atualizadoEm" = NOW()
FROM saldos s
WHERE s."id" = p."id"
  AND s."saldo" < p."valorAtualizado"
  AND p."status" <> CASE WHEN s."saldo" <= 0 THEN 'PAGO'::"StatusParcela" ELSE 'PARCIALMENTE_PAGO'::"StatusParcela" END;
