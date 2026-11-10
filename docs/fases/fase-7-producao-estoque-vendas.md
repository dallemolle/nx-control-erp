# Fase 7 — Produção, estoque e vendas

Status: 🟡 **Em desenvolvimento.** 7a (fundação) concluída em 2026-11-08:
perfis Produção e Vendas, permissões, menu por permissão, cadastros de
fruta, produto, insumo, talhão e local, configuração de produção e cliente
sem CPF/CNPJ. 7b (recepção e estoque) concluída em 2026-11-09: recepção de
fruto com lote numerado e conta a pagar, estoque por lote com saldo por
movimentos, ajustes e etiqueta. Conta Caixa (Fase B fiscal) concluída. 7c
(vendas e entregas) concluída em 2026-11-10: pedido de venda com itens por
lote, conta a receber criada junto (já paga quando à vista, com dinheiro na
conta Caixa), liberação de lote vencido com motivo, cancelamento com estorno
de estoque e do recebimento, entregas com atraso e recibo em PDF. Próximo:
7d (importação da planilha), que depende das decisões D-17 e D-21.

## Escopo

Substituir a planilha *Hortitex – Controle produção e vendas* por módulos do
sistema:

- **Recepção de fruto** (própria e de terceiros) gerando lotes.
- **Processamento** em ordens de produção (OP), com rendimento, balanço de
  massa, branqueamento e custo por kg.
- **Estoque por lote**: saldo, validade, local e alertas.
- **Vendas por lote** e entregas.
- **Rastreabilidade** para recall e fiscalização (ADEPARA), com etiqueta de
  lote.
- **Integração com o financeiro**: venda gera conta a receber; compra de
  fruto gera conta a pagar.
- **Painel e relatórios** de produção, origem, processamento, estoque e
  vendas.

## Documentação

O levantamento completo, as regras de negócio, o modelo de dados proposto,
as dúvidas e o plano de entrega estão em
[`docs/modulos/producao-estoque-vendas/`](../modulos/producao-estoque-vendas/README.md).

## Sub-projetos

7a Fundação · 7b Recepção e estoque · 7c Vendas e entregas · 7d Importação e
corte da planilha · 7e Processamento (OP) · 7f Rastreabilidade · 7g Painel e
relatórios. Detalhes, dependências e critérios de pronto no
[plano de entrega](../modulos/producao-estoque-vendas/09-plano-de-entrega.md).

Pré-requisito relacionado: conta "Caixa" (Fase B do
`PLANO_IMPLEMENTACAO_FISCAL_GERENCIAL.md`), necessária para registrar vendas
pagas em dinheiro.
