-- Lançamentos de baixa antigos: "Baixa aprovada — parcela nº N" passa a dizer de qual título são, no mesmo formato
-- de descricaoDoLancamentoDaBaixa (src/lib/financeiro/descricaoDaBaixa.ts): "documento · contraparte · parcela N/total".
-- Só toca a descrição gerada pelo sistema (lançamento de baixa não é editável); qualquer outra fica como está.
UPDATE "lancamentos_bancarios" AS l
SET "descricao" = concat_ws(
  ' · ',
  NULLIF(btrim(t."documento"), ''),
  NULLIF(btrim(CASE WHEN t."tipo" = 'PAGAR' THEN f."nome" ELSE c."nome" END), ''),
  'parcela ' || p."numero" || '/' || (SELECT count(*) FROM "parcelas" AS p2 WHERE p2."tituloId" = t."id")
)
FROM "baixas" AS b
JOIN "parcelas" AS p ON p."id" = b."parcelaId"
JOIN "titulos" AS t ON t."id" = p."tituloId"
LEFT JOIN "fornecedores" AS f ON f."id" = t."fornecedorId"
LEFT JOIN "clientes" AS c ON c."id" = t."clienteId"
WHERE l."baixaId" = b."id"
  AND l."origem" = 'BAIXA'
  AND l."descricao" = 'Baixa aprovada — parcela nº ' || p."numero";
