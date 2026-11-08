# 7. Relatórios e indicadores

Na planilha, o PAINEL tem um filtro global (data inicial, data final e
ano) que vale para todos os REL_*. No sistema, cada tela de relatório tem
seu próprio filtro de período na URL, como o restante do sistema
(fluxo de caixa, orçamento), e todas exportam CSV, Excel e PDF pelo
mecanismo que já existe (`responderExport` + `ColunaExport`).

**Fruta não fica fixa no código.** As fórmulas da planilha repetem "Açaí" e
"Acerola" em cada coluna. No sistema, cada métrica "por fruta" vira uma
linha ou coluna por fruta cadastrada.

A aba `INICIO` cita gráficos em cada relatório. Os gráficos do Excel não
são lidos por ferramenta (só fórmulas e valores), então os sugeridos abaixo
são proposta, feitos com o mesmo `recharts` do dashboard executivo.

## Painel de produção (PAINEL)

Filtro: período. Os indicadores em **negrito** têm alerta clicável, que
leva à lista filtrada.

| Bloco | Indicador | Regra |
|---|---|---|
| Recepção e processamento | Fruto recebido (kg), por fruta | Soma do peso líquido no período. |
| | % de terceiros, por fruta | RN-33. |
| | Descarte na triagem (%) | `Σ descarte ÷ Σ bruto`. |
| | Fruto processado (kg) | Soma do consumo das OPs do período. |
| | Nº de OPs | |
| | Polpa produzida (kg), por fruta | |
| | Rendimento, por fruta | `polpa ÷ fruto consumido` (RN-10). |
| | Custo médio da polpa (R$/kg), por fruta | `Σ custo total ÷ Σ polpa` das OPs. |
| Vendas | Faturamento total; fruto in natura; polpa por fruta | Soma do valor dos itens. |
| | Kg vendidos; preço médio; nº de pedidos; ticket médio | RN-32. |
| | Margem bruta (R$ e %) | Σ margem dos itens (RN-22). |
| | A receber em aberto (R$) | Do título (RN-26), não da venda. |
| Estoque e alertas | Estoque de polpa (kg); fruto aguardando (kg, não vencido); valor do estoque a custo | RN-15, RN-17. |
| | **Lotes vencendo**; **lotes vencidos com saldo** (nº e kg) | RN-16. |
| | **Entregas pendentes/em rota**; **entregas com atraso** | RN-24. |
| | **OPs com balanço a verificar**; **OPs com branqueamento a verificar** | RN-11, RN-12. |

Dois alertas da planilha deixam de existir porque o sistema bloqueia a
situação na origem: "Vendas com alerta de lote" (RN-18/RN-19) e "Consumo
com fruta diferente da OP" (RN-14).

Tabelas do painel: **estoque atual por produto** (saldo e valor a custo) e
**vendas do período por produto** (kg e faturamento).

## Relatório mensal (REL_MENSAL)

Filtro: ano. Doze linhas (meses) mais o total. Colunas:

- **Recepção:** kg próprio e de terceiros por fruta, e total recebido.
- **Processamento:** fruto processado e polpa produzida por fruta,
  rendimento por fruta e nº de OPs.
- **Vendas:** faturamento in natura, de polpa por fruta e total; kg
  vendidos; margem bruta (R$ e %).
- **Custos:** custo da polpa (R$/kg) por fruta e fruto pago a terceiros
  (R$).

Segunda tabela: **polpa produzida por produto × mês**.
Gráficos sugeridos: recebido × processado × vendido por mês; faturamento e
margem por mês.

## Vendas (REL_VENDAS)

Filtro: período.

- **Top 10 clientes:** faturamento, kg, canal, a receber.
- **Vendas por cliente:** todos os clientes, com kg, faturamento, % do
  total, preço médio, margem e a receber total.
- **Por produto:** kg, faturamento, preço médio, custo médio e margem (%).
- **Por canal:** kg, faturamento, % do total.
- **Por forma de pagamento:** faturamento e a receber.

Gráficos: faturamento por canal e top clientes.

## Origem da matéria-prima (REL_ORIGEM)

Filtro: período; a produtividade usa o ano.

- **Por origem** (fornecedor ou talhão próprio): kg por fruta, total,
  valor pago, preço médio, descarte (%), nº de cargas. Top 10 origens.
- **Produtividade dos talhões:** área, kg no período, kg no ano, t/ha no
  ano (RN-30), nº de colheitas no ano.
- **Preço médio pago a terceiros por mês** (ano), por fruta.

## Processamento (REL_PROCESSAMENTO)

Filtro: período.

- **Resumo por fruta:** nº de OPs, fruto (kg), polpa (kg), rendimento
  médio, mínimo e máximo, custo médio (R$/kg).
- **Balanço de massa por fruta:** fruto, água, polpa, caroço, perda,
  diferença.
- **Custo por fruta:** fruto, insumos, total.
- **Últimas OPs:** nº, data, fruta, kg, rendimento, custo/kg, balanço % e
  branqueamento. Paginado, sem o limite de 30 da planilha.

## Estoque (REL_ESTOQUE)

Filtro: data de referência (padrão hoje, RN-16).

- **Saldo por produto × local** (kg) e valor a custo, com linha de
  **capacidade** e **ocupação (%)** por local.
- **Estoque por status de validade:** OK, Vencendo, Vencido (nº de lotes
  e kg).
- **Próximos a vencer:** lotes com saldo em ordem de validade (FEFO),
  com produto, local, saldo, validade, dias e status.

## Rastreabilidade e etiqueta

Ver RN-28, RN-29 e F6 no doc 5. Os dois geram PDF; a rastreabilidade também
CSV e Excel.

## Implementação

- Serviços de leitura em `src/server/services/relatorioProducao*.ts`, com
  `groupBy` e agregação no banco. Nada de laço de consultas por produto ou
  por mês; mesma disciplina aplicada ao dashboard executivo.
- Rotas `…/export/route.ts` com `responderExport` e `cabecalhoDoRelatorio`
  (período e filtros no PDF).
- Indicadores do painel com teste de caracterização: um cenário fixo com
  números conferidos à mão contra a fórmula da planilha.
