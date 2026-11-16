# Venda a prazo em parcelas

Data: 2026-11-16 · Status: implementada (2026-11-16)

Item do [backlog](../../backlog.md) ("Venda a prazo em parcelas"), levantado na
varredura dos "fora do escopo" de 2026-11-16. Revê a D-12 da 7c ("v1: uma
parcela", doc 08 do módulo de produção/estoque/vendas).

## Problema

O pedido `A_PRAZO` grava um `vencimento` e cria o título a receber com uma
parcela só (`criarPedido`, `src/server/services/pedidoVenda.ts`). Uma venda
combinada em várias datas (ex.: 28/56 dias) fica com uma data só, o que
distorce o contas a receber, o aging do dashboard e a projeção de caixa. O
título já aceita várias parcelas (`criarTituloInterno`) e o cancelamento do
pedido já cancela todas as parcelas do título.

## Decisões deste desenho

1. **Prazos em dias com ajuste** (decisão do usuário). O vendedor digita os
   prazos (`28/56`); o sistema gera as parcelas e mostra as linhas, que podem
   ter vencimento e valor ajustados antes de salvar.
2. **Divisão igual, centavos na última parcela** (decisão do usuário).
3. **Até 60 parcelas** (decisão do usuário: 12 era pouco para uma venda
   grande). O limite só protege contra erro de digitação; o cadastro de
   títulos do financeiro não tem limite.
4. **Uma fonte só para as datas** (decisão do usuário): a coluna
   `PedidoVenda.vencimento` sai; datas e valores ficam só nas parcelas do
   título. O pedido guarda apenas o texto da condição (`condicaoPagamento`)
   para tela e recibo.
5. **A condição é derivada das datas finais**, em dias desde a data do
   pedido, e não do texto digitado: se o vendedor muda 56 para 60, grava
   `28/60`. O texto sempre bate com as parcelas no momento da venda (depois,
   uma alteração de vencimento feita no financeiro não muda o texto: ele
   registra o que foi combinado na venda).
6. **Soma exata:** a soma das parcelas tem que ser igual ao total do pedido,
   recalculado no servidor a partir dos itens. Diferença bloqueia o Salvar na
   tela e é rejeitada no servidor.
7. **Se o total dos itens muda, as parcelas são regeradas** a partir dos
   prazos e os ajustes manuais se perdem. Regra simples e previsível.
8. **À vista não muda:** uma parcela com baixa automática.

## Dados

- Migration: remove `pedidos_venda.vencimento`; cria
  `condicaoPagamento String?` (só `A_PRAZO`). Pedidos a prazo já gravados
  recebem a condição calculada antes de a coluna sair: dias entre
  `pedido.data` e `vencimento` (ex.: `"30"`). A data em si já está na parcela
  1 do título; nada se perde.
- Doc 04 do módulo (modelo de dados) e doc 06 (integração com o financeiro,
  linha "parcelas") atualizados.

## Regra pura (`src/lib/producao/venda.ts`)

- `interpretarPrazos(texto)` → `{ ok: true; prazos: number[] } | { ok: false;
  erro: string }`. Dias inteiros ≥ 0 separados por `/` (espaços tolerados),
  estritamente crescentes, de 1 a 60. Mensagens: "Informe os prazos",
  "Prazo inválido: …", "Os prazos devem ser crescentes", "No máximo 60
  parcelas".
- `gerarParcelasPorPrazos(data, total, prazos)` → `{ numero; dataVencimento;
  valor }[]`. Vencimento = data + dias; valor = total ÷ n arredondado a 2
  casas, e a última leva a diferença.
- `condicaoDasParcelas(data, datas)` → texto `"28/56"` com os dias de cada
  vencimento desde a data do pedido.
- `MAX_PARCELAS_VENDA = 60`.

## Schema e serviço

- `pedidoVendaSchema`: sai `vencimento`; entra `parcelas` (JSON num campo
  escondido, como os itens): lista de `{ dataVencimento, valor }`. Para
  `A_PRAZO` exige de 1 a 60 parcelas; para à vista ignora.
- `criarPedido` (`A_PRAZO`) confere, além do que já confere:
  - nenhum vencimento antes da data do pedido;
  - vencimentos estritamente crescentes;
  - valores positivos;
  - soma (em centavos) igual a `totais.valor`; mensagem "A soma das parcelas
    (R$ x) difere do total do pedido (R$ y)".
  Cria o título com as N parcelas (`numero` 1..N), grava
  `condicaoPagamento = condicaoDasParcelas(...)` e inclui condição e parcelas
  na auditoria `CRIAR`.
- `obterPedido` passa a expor `condicaoPagamento` (vem do modelo).
- Cancelamento e `situacaoParaCancelar`: sem mudança (já tratam todas as
  parcelas do título).

## Telas

- **Novo pedido** (`pedido-form.tsx`): em *A prazo*, o campo "Vencimento" vira
  **"Prazos (dias)"** (texto, placeholder `28/56`). Com prazos válidos e total
  > 0, aparece a tabela de parcelas: nº, vencimento (date, `min` = data do
  pedido) e valor (editáveis), rodapé com a soma. Soma diferente do total:
  rodapé em vermelho com a diferença e Salvar desabilitado. Prazo inválido:
  mensagem abaixo do campo. Mudar prazos, data do pedido ou total regera as
  linhas.
- **Detalhe do pedido**: no lugar de "Vencimento", **"Condição"** com
  `28/56 dias` (pedidos antigos: `30 dias`). O cartão Pagamento continua
  listando as parcelas do título e passa a mostrar o nº e o status de cada
  uma.
- **Recibo (PDF)** (`gerarReciboPdf`): pedido a prazo mostra a condição e a
  lista de parcelas (nº, vencimento, valor). Hoje o recibo não mostra
  vencimento nenhum.
- Relatório de vendas, painel e exportações: sem mudança (a situação do
  pagamento já é lida de todas as parcelas).

## Testes

- Funções puras: divisão com centavos na última (ex.: 100,00 em 3 →
  33,33/33,33/33,34); prazo 0; prazos fora de ordem, repetidos, negativos,
  não numéricos e acima de 60; condição a partir de datas ajustadas.
- Serviço (`pedidoVenda.test.ts`): pedido a prazo cria N parcelas com as
  datas e valores enviados e grava a condição; rejeita soma diferente do
  total, vencimento antes da data do pedido e datas fora de ordem; cancelar
  cancela todas as parcelas; à vista continua com uma parcela e baixa
  automática.
- Os testes existentes que usam `vencimento` passam a enviar `parcelas`.
- Recibo: o PDF de um pedido a prazo inclui as parcelas.

## Docs

- Ajuda, seção de pedido de venda em `content/ajuda/passo-a-passo.md`:
  prazos em dias, ajuste das linhas, regra da soma.
- Doc 08 do módulo: D-12 ganha a nova decisão com data (parcelamento por
  prazos em dias, até 60, centavos na última, condição derivada das datas).
- Docs 04 e 06 do módulo, como em "Dados".
- `docs/backlog.md`: remover o item.
- `docs/fases/fase-7-producao-estoque-vendas.md`: nota curta.

## Fora do escopo

- Prazo padrão por cliente (condição sugerida ao escolher o cliente) —
  **descartado:** conveniência; digitar `28/56` é rápido.
- Preservar ajustes manuais quando o total muda — **descartado:** regerar é
  mais previsível (decisão 7).
- Alterar parcelas depois de salvo pelo pedido — **descartado:** o
  financeiro já altera vencimento e renegocia parcela no título.
- Cartão parcelado e recebimento por operadora (prazo de repasse e taxa) —
  **→ backlog** (decisão do usuário, 2026-11-16: precisa ser tratado, sem
  urgência). Não é o parcelamento combinado com o cliente: o título seria
  contra a operadora, com cadastro de taxa e prazo e efeito na conciliação.
