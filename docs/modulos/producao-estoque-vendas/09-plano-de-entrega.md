# 9. Plano de entrega

Fase 7 dividida em sub-projetos, no mesmo ciclo das fases anteriores:
spec curta em `docs/superpowers/specs/` → aprovação → implementação numa
branch própria → PR para `staging`.

**Ordem guiada pelo uso real:** a planilha hoje só registra recepção e
venda in natura. Entregar isso primeiro e depois construir o
processamento, que ainda não começou a ser usado.

**7d adiada (2026-11-10):** sem importação de dados antigos por ora
(D-21), a filial da Hortitex será cadastrada na implantação (D-17) e a
numeração recomeça (D-18). A importação e o corte da planilha ficam para
depois do desenvolvimento, se forem necessários; a seção
[Importação da planilha](#importação-da-planilha-7d) fica como referência.

```
7a Fundação ─► 7b Recepção e estoque ─► 7c Vendas e entregas ─► 7e Processamento (OP) ─► 7f Rastreabilidade ─► 7g1 Painel ─► 7g2 Relatórios

          (Fase B fiscal: conta Caixa — antes ou junto de 7c)
          (7d Importação + corte: adiada para depois do desenvolvimento)
```

| Sub-projeto | Entrega | Depende de | Decisões necessárias | Tamanho |
|---|---|---|---|---|
| **7a Fundação** | Perfis PRODUCAO e VENDAS; ações de RBAC; cadastros de fruta, produto (com rasa), talhão, local, insumo; configuração de produção por filial; ajustes em Cliente/Fornecedor; menu Produção e Vendas. | — | D-09, D-02 | M |
| **7b Recepção e estoque** | Recepção de fruto (própria/terceiro, rasa); lote com nº imutável; ledger e saldo; validade e status; tela de estoque (por lote e produto × local, ocupação); ajustes; título a pagar de terceiro; etiqueta em PDF. | 7a | D-04, D-13 | L |
| **7c Vendas e entregas** | Pedido com itens por lote (FEFO, bloqueios RN-18/19); custo e margem gravados; título a receber na mesma transação; baixa automática à vista; cancelamento com estorno; entregas e atraso; recibo em PDF. | 7b; **Fase B (conta Caixa)** para dinheiro | D-03, D-11, D-16 | L |
| **7d Importação + corte** *(adiada)* | Script de importação da planilha (cadastros, 16 recepções, 29 vendas) com simulação prévia (dry-run); conferência de saldos contra `ESTOQUE_LOTES`; recepção e venda in natura passam a ser lançadas só no sistema. | 7c | D-17, D-18, D-21 | M |
| **7e Processamento** | OP com consumo, produção (lotes de polpa), insumos e processo; rendimento, balanço e branqueamento ao vivo; encerramento com custo gravado; cancelamento. | 7b | D-06, D-07, D-08 | L |
| **7f Rastreabilidade** | Consulta por lote para trás e para frente, até os clientes da polpa derivada (RN-28); PDF para fiscalização. | 7c, 7e | D-10 | M |
| **7g1 Painel** | Painel de produção com indicadores, alertas clicáveis e exportação; resumo por status e PDF em seções no Estoque; filtros "só atrasadas" e "a verificar". | 7c, 7e | D-24, D-25, D-26 | M |
| **7g2 Relatórios** | Relatório mensal, de vendas, de origem e de processamento, com gráficos e exports. | 7g1 | — | L |

Tamanho: **M** ≈ o porte de "comparação entre safras"; **L** ≈ o porte de
"contas a pagar/receber".

## Critério de pronto (todos os sub-projetos)

- Spec aprovada antes do código; decisões 🔴 do doc 8 respondidas.
- Regras RN-xx do escopo cobertas por teste:
  - **unitário** para cálculo puro (RN-01 numeração, RN-03 rasa, RN-04/05
    recepção, RN-07 validade, RN-10 a RN-13 OP, RN-16 status, RN-22
    margem, RN-24 atraso, RN-30 produtividade);
  - **integração** (Postgres real, fixtures como
    `criarFixtureFinanceiro`) para tudo que envolve transação: saldo e
    ledger, concorrência de duas vendas no mesmo lote, título criado e
    cancelado junto com o pedido, permissões por perfil;
  - **caracterização contra a planilha**: um cenário com os números que a
    planilha calcula (copiados das células) deve dar o mesmo resultado
    no sistema.
- Auditoria em toda escrita; `podeAlterarFilial` respeitado.
- Telas conferidas no navegador, no desktop e no celular (390px).
- Exportação CSV, Excel e PDF nas listagens.
- `npm test`, `npm run lint` e `npm run build` limpos.
- `content/ajuda/passo-a-passo.md` atualizado com o fluxo do sub-projeto.

## Importação da planilha (7d)

> Adiada (2026-11-10). Mantida como referência caso a importação volte a
> ser necessária depois do desenvolvimento.

1. Script `scripts/importar-planilha-producao.ts`, que lê o `.xlsx` com o
   `exceljs` já instalado, sem Python nem macros.
2. **Modo simulação (padrão):** valida e mostra o que seria criado
   (cadastros novos, lotes com código atual, pedidos), divergências
   (cliente sem cadastro, produto desconhecido) e o saldo previsto por
   lote, comparado à coluna `SALDO` de `ESTOQUE_LOTES`.
3. **Modo gravação:** uma transação por bloco (cadastros → recepções →
   vendas), idempotente: rodar duas vezes não duplica, pela chave do
   código do lote e do nº do pedido.
4. Ordem: frutas e produtos (catálogo do doc 1) → locais, talhões,
   insumos → fornecedores e clientes (casando pelo nome, com conferência
   manual) → recepções → vendas.
5. Depois do corte, a planilha fica **somente leitura** para recepção e
   venda. Processamento continua nela até 7e, se começar a ser usado
   antes.

## Riscos

| Risco | Mitigação |
|---|---|
| Uso no galpão com internet ruim. | Formulários curtos, sem dependência de JS pesado. Modo offline fica fora da v1; avaliar depois do primeiro mês de uso. |
| Venda simultânea do mesmo lote por duas pessoas. | Atualização condicional do saldo na transação (doc 4) e teste de concorrência. |
| Custo/margem diferentes da planilha por causa do congelamento do custo (D-05) e do custo do fruto próprio (D-04). | Documentar na ajuda; o teste de caracterização mostra exatamente onde e por que difere. |
| Escopo crescer (estoque de insumos, transferências parciais, parcelamento). | Fora da v1, registrado no backlog (D-12, D-14, D-15). |
