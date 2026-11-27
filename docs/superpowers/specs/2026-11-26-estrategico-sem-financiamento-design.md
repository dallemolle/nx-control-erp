# Ano-base do estratégico sem empréstimos e aportes

Data: 2026-11-26 · Status: aprovado, a implementar

Item 63 do [backlog](../../backlog.md), seção "Financeiro — lacunas achadas ao
escrever a ajuda contextual" ("Ano-base do estratégico conta empréstimos e
aportes como receita").

## Problema

`buscarAnoBaseConsolidado` (`src/server/services/fluxoDeCaixaEstrategico.ts`)
soma por sentido todas as entradas e saídas conciliadas dos últimos 12 meses
(sem transferências desde 2026-11-26): toda entrada vira `receitaBase` e toda
saída vira `custoBase`. Empréstimo recebido e aporte de sócio inflam a
receita; a amortização do empréstimo infla o custo. Um custeio de
R$ 100.000,00 recebido em março aumenta a receita do ano-base em
R$ 100.000,00, e a projeção de 5 anos cresce essa "receita" todo ano. O
modelo já trata dívida nova à parte (premissa `novoEndividamentoAnual`), então
o empréstimo do passado conta duas vezes no raciocínio.

A Hortitex lança empréstimos e aportes **com categoria própria** (do tipo
RECEITA, e a amortização numa de DESPESA). As categorias só têm os tipos
RECEITA e DESPESA: basear o cálculo só no tipo da categoria não tiraria o
empréstimo da receita.

## Regra

1. A categoria financeira ganha a marca **Não operacional** (empréstimo,
   aporte, amortização). Padrão: desmarcada.
2. A categoria de um lançamento é a dele (`categoriaFinanceiraId`) ou, se
   vazia e o lançamento vier de baixa, a do título da baixa — a mesma regra de
   `buscarRealizadoPorCategoria` (`orcamento.ts`).
3. No ano-base (conciliados, últimos 12 meses, sem transferências, conta
   ativa, filiais ativas, filtro fiscal/gerencial — como hoje):
   - **Receita** = entradas − saídas nas categorias de RECEITA operacionais.
   - **Custo** = saídas − entradas nas categorias de DESPESA operacionais.
   - Lançamentos em categoria **não operacional** e lançamentos **sem
     categoria** ficam fora da receita e do custo; os totais (entradas e
     saídas de cada grupo) voltam à parte para a tela avisar.
4. O saldo de partida não muda (o dinheiro do empréstimo está no caixa).

Exemplo: em 12 meses, vendas R$ 220.000,00 (RECEITA), insumos R$ 90.000,00
(DESPESA), devolução de adubo R$ 200,00 (ENTRADA em Insumos), custeio
R$ 100.000,00 (ENTRADA em "Empréstimos", não operacional), parcela do custeio
R$ 20.000,00 (SAÍDA em "Amortização", não operacional), tarifa R$ 50,00 (SAÍDA
sem categoria). Ano-base: receita R$ 220.000,00; custo R$ 89.800,00; fora:
R$ 100.000,00 de entradas e R$ 20.000,00 de saídas não operacionais, R$ 50,00
de saídas sem categoria.

## Decisões deste desenho

- **Marca na categoria, não novo tipo** (escolha do usuário entre marca, tipo
  FINANCIAMENTO e nome). Um terceiro tipo quebraria os filtros de título a
  pagar/receber, Orçamento e API, que esperam RECEITA/DESPESA.
- **Lançamento no sentido contrário abate da categoria** (escolha do usuário):
  devolução lançada como entrada em despesa reduz o custo; estorno lançado
  como saída em receita reduz a receita.
- **Sem categoria fica fora da base, com aviso** (escolha do usuário).
- **A marca é por categoria**, sem herança da categoria pai: cada categoria
  marcada é decidida no próprio cadastro (a hierarquia é só de organização).

## Componentes

### Banco — `prisma/schema.prisma` + migration

- `CategoriaFinanceira.naoOperacional Boolean @default(false)`.

### Cadastro de categorias

- Schema `src/lib/schemas/categoriaFinanceira.ts`: `naoOperacional:
  z.boolean()` com default `false`.
- Serviço `src/server/services/categoriaFinanceira.ts`: grava o campo em
  criar e atualizar; auditoria inclui o campo em `anterior` e `novo`.
- Diálogo `src/app/(dashboard)/cadastros/categorias/categoria-financeira-dialog-form.tsx`:
  caixa "Não operacional" com a explicação "Empréstimos, aportes de sócio e
  amortização de dívida. Ficam fora da receita e do custo do Fluxo de caixa
  estratégico."
- Lista `src/app/(dashboard)/cadastros/categorias/page.tsx`: selo
  "Não operacional" na linha.
- API `GET /categorias-financeiras` (`src/app/api/v1/categorias-financeiras/route.ts`):
  devolve `naoOperacional`; `docs/api-v1.md` atualizado.

### Cálculo — `src/server/services/fluxoDeCaixaEstrategico.ts`

- Função pura `somarAnoBase(lancamentos)` (em `src/lib/financeiro/anoBaseEstrategico.ts`, junto com
  `textoForaDaBase`, que monta o aviso; a ajuda usa as mesmas funções no navegador) que recebe
  `{ tipo, valor, categoria: { tipo, naoOperacional } | null }[]` e devolve
  `{ receitaBase, custoBase, foraDaBase }`, com
  `foraDaBase = { naoOperacional: { entradas, saidas }, semCategoria: { entradas, saidas } }`.
- `buscarAnoBaseConsolidado` busca os lançamentos da janela com a categoria
  própria e a do título da baixa (`select` só dos campos necessários), resolve
  a categoria pela regra 2 e chama `somarAnoBase`. Devolve também
  `foraDaBase`.
- `listarProjecaoEstrategica` devolve `foraDaBase` junto com cenários e
  projeções.

### Tela — `src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico/page.tsx`

- Aviso (mesmo estilo dos avisos da tela) quando algum total de `foraDaBase`
  for diferente de zero, listando só as partes não zeradas:
  "Ficaram fora do ano-base: R$ 100.000,00 de entradas e R$ 20.000,00 de
  saídas em categorias não operacionais; R$ 50,00 de saídas sem categoria."
  Para lançamentos sem categoria, sugere classificar na Tesouraria.
- Texto do cabeçalho: o ano-base é a receita e o custo por categoria (sem
  categorias não operacionais), não mais "o fluxo de caixa realizado".

### Ajuda

- `src/ajuda/fluxo-de-caixa-estrategico/roteiros.ts` (e cenas, se mostrarem o
  ano-base): o passo "Receita e Custo partem dos últimos 12 meses" passa a
  explicar receita/custo por categoria, a devolução que abate, a marca não
  operacional (a amortização de dívida antiga também sai: o modelo só tem a
  dívida nova das premissas) e o aviso do que ficou fora; sai o texto que
  dizia que empréstimos entram como receita.
- `src/ajuda/categorias/index.tsx`: explica a caixa "Não operacional".

## Fora do escopo

- Fluxo realizado, projetado, dashboard e fluxo por dimensão — descartado:
  ali o empréstimo é dinheiro que entrou de fato e deve aparecer.
- Exportação do estratégico (CSV/Excel/PDF) — descartado: a planilha traz os
  anos projetados, não o ano-base; o aviso fica na tela.
- Sentido do lançamento no Orçamento — já é o item 15 do backlog; aqui o
  sentido é tratado só no estratégico.
- Marcar automaticamente as categorias existentes — descartado: não há como
  saber pelo nome; a ajuda e o aviso orientam a marcar.

## Testes

- `somarAnoBase` (unidade): exemplo da regra; devolução abate; estorno de
  receita abate; não operacional fora; sem categoria fora; tudo zero.
- `buscarAnoBaseConsolidado` (integração): categoria só no título da baixa;
  categoria não operacional; sem categoria; transferência fora; filtro
  fiscal/gerencial; duas filiais; ajustar os testes existentes que lançam
  sem categoria.
- Serviço de categoria: criar/atualizar com `naoOperacional`, auditoria.
- API de categorias devolve o campo.
- Conferência no navegador: marcar uma categoria, ver o aviso e os números no
  estratégico.

## Depois do deploy

Na Hortitex, alguém precisa marcar as categorias de empréstimo, aporte e
amortização; até lá elas continuam entrando na receita e no custo.
