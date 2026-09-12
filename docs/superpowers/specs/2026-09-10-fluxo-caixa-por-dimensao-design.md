# Design — Fluxo de caixa por dimensão (Fase 5, sub-projeto 2a)

Status: Aprovado. Ainda não implementado.

## Contexto

A Fase 5 ("Controladoria e orçamento") tem dois sub-projetos. O
sub-projeto 1 (Orçamento, `docs/superpowers/specs/2026-09-09-orcamento-design.md`)
já está implementado e mesclado em `staging`. O sub-projeto 2, "Comparativos
por dimensão", tem duas partes de peso bem diferente:

- **2a (este documento)**: fecha um furo de dados que afeta o sistema
  todo (ver "Achado técnico" abaixo) e entrega fluxo de caixa por centro
  de custo, por centro de lucro, por safra — realizado e projetado, sem
  orçado.
- **2b (ainda sem desenho técnico)**: comparação entre safras (orçado x
  realizado x projetado). Depende de estender o modelo de `Orcamento` pra
  aceitar safra como dimensão — o sub-projeto 1 documentou explicitamente
  que orçamento por centro de custo/lucro/safra/projeto ficaria "pro
  sub-projeto 2 ou uma iteração futura". Por isso 2b é desenhado só depois
  que 2a estiver pronto, e usa o "realizado por safra" calculado aqui.

Este documento cobre exclusivamente o 2a.

## Achado técnico: `LancamentoBancario` não carrega nenhuma das 4 dimensões

Diferente da categoria financeira (Fase 5 sub-projeto 1), que já é gravada
diretamente em lançamentos manuais e de conciliação — só faltando no
caminho de baixa, corrigido ali —, `LancamentoBancario` **nunca** carregou
`centroCustoId`, `centroLucroId`, `safraId` ou `projetoId`, em nenhum
caminho de criação (`lancamentoBancario.ts`, `conciliacao.ts`, `baixa.ts`
— confirmado por leitura direta do código). A única forma de atribuir um
lançamento a uma dessas dimensões é indiretamente:
`lancamento.baixaId → parcela → titulo.<dimensão>`.

Confirmado também que `centroCustoId`/`centroLucroId`/`safraId`/
`projetoId` são **opcionais** em `Titulo` — nenhum é obrigatório no
cadastro (`src/lib/schemas/titulo.ts`), diferente do que a versão em
prosa da Fase 5 (`docs/fases/fase-5-controladoria.md`) descrevia
("já são obrigatórias em todo cadastro relevante"). Essa afirmação
estava desatualizada em relação ao código atual — decisão confirmada:
manter opcional, sem exigir a dimensão no cadastro de `Titulo`.

**Por que isso importa e por que corrigir agora:** diferente da categoria
(onde só o caminho de baixa tinha o problema, e o resto — manual/
conciliação — já funcionava), aqui **nenhum** caminho grava a dimensão em
`LancamentoBancario`. Um join em tempo de leitura via `baixa→parcela→titulo`
resolveria o caso de lançamento gerado por baixa, mas lançamentos manuais
e de conciliação não têm título/parcela nenhum pra derivar — pra esses,
não existe nenhuma forma de recuperar a dimensão depois do fato. Quanto
mais tempo o sistema operar sem capturar isso na origem, maior a janela de
dado histórico permanentemente não-classificável — e isso alimenta
diretamente o sub-projeto 2b (que depende de "realizado por safra").
**Decisão confirmada com o usuário: corrigir na origem agora**, antes de
2b, cobrindo as 4 dimensões (incluindo Projeto, mesmo sem um relatório
"por projeto" nesta entrega — mesmo padrão, custo marginal baixo, evita
reabrir essa mesma questão quando um relatório por projeto for pedido).

## Correção na origem — `LancamentoBancario` ganha as 4 dimensões

### Migração

Adicionar ao `model LancamentoBancario` em `prisma/schema.prisma`,
seguindo exatamente o padrão já existente de `categoriaFinanceiraId`:

```prisma
  centroCustoId String?
  centroLucroId String?
  safraId       String?
  projetoId     String?

  centroCusto CentroCusto? @relation(fields: [centroCustoId], references: [id])
  centroLucro CentroLucro? @relation(fields: [centroLucroId], references: [id])
  safra       Safra?       @relation(fields: [safraId], references: [id])
  projeto     Projeto?     @relation(fields: [projetoId], references: [id])
```

E o relacionamento inverso (`lancamentosBancarios LancamentoBancario[]`)
nos models `CentroCusto`, `CentroLucro`, `Safra` e `Projeto`. Migração
puramente aditiva — 4 colunas novas opcionais, 4 novas FKs em tabelas já
existentes, sem `ALTER`/`DROP` de coluna existente.

### `criarLancamentoManual` (`src/server/services/lancamentoBancario.ts`)

`LancamentoManualFormValues` (`src/lib/schemas/lancamentoBancario.ts`)
ganha `centroCustoId`, `centroLucroId`, `safraId`, `projetoId` — mesmo
formato opcional já usado por `categoriaFinanceiraId`
(`z.string().trim().optional().or(z.literal(SEM_VALOR))`). A tela de
lançamento manual ganha 4 seletores novos (mesmo componente/padrão visual
já usado pro seletor de categoria financeira), todos opcionais.
`criarLancamentoManual` normaliza os 4 campos com o mesmo
`normalizarOpcional` já usado pra categoria, e valida que cada id
informado pertence à filial ativa (mesmo padrão de
`validarReferenciasDoTitulo` em `titulo.ts` — evita vazamento
cross-tenant).

### `criarLancamentoDaLinha` (`src/server/services/conciliacao.ts`)

A assinatura `dados: { descricao: string; categoriaFinanceiraId: string |
null }` ganha os mesmos 4 campos (`string | null` cada). A tela de
conciliação (o formulário que já pergunta a categoria financeira ao
confirmar uma linha do extrato sem título correspondente) ganha os
mesmos 4 seletores. Mesma validação de pertencimento à filial.

### `aprovarBaixa` (`src/server/services/baixa.ts`)

Já copia `categoriaFinanceiraId` do título (fix do sub-projeto 1). Passa
a copiar também `centroCustoId`, `centroLucroId`, `safraId`, `projetoId`
do mesmo `parcela.titulo` já carregado na transação — nenhuma consulta
nova, mesmo padrão exato do fix já existente.

### Dado histórico (antes desta correção)

Sem migração de backfill — resolvido por fallback na leitura, mesmo
padrão já estabelecido para categoria financeira no sub-projeto 1: as
funções de leitura (abaixo) usam o campo direto quando presente, e caem
pra `lancamento.baixa?.parcela.titulo.<dimensão>` quando o campo direto é
nulo mas há uma baixa vinculada. Lançamento manual/conciliação anterior a
esta correção, sem baixa, permanece em "Não classificado" — não há como
recuperar essa informação retroativamente, pois nunca foi capturada.

## Escopo (relatório desta entrega)

- Relatório cobre 3 dimensões: **Centro de custo, Centro de lucro,
  Safra**. Projeto ganha o campo/captura de dados (acima), mas não tem
  relatório "fluxo de caixa por projeto" nesta entrega — a Fase 5 em
  prosa só pede "por centro de custo, por centro de lucro, por safra".
- Cobre **realizado e projetado**, sem orçado (orçado por dimensão é
  sub-projeto 2b, restrito a safra, e ainda sem desenho).
- Centro de custo é hierárquico (`parentId`/`filhos`). **Sem rollup**: um
  centro de custo filho não soma no total do pai — cada centro de custo
  ativo é sua própria linha independente, mesmo padrão já usado pra
  categoria financeira no Orçamento (também hierárquica, também sem
  rollup).
- Uma dimensão por vez na tela, escolhida por um seletor — não uma visão
  cruzando as 3 simultaneamente.

## Modelo de dados (tipos do relatório)

```ts
export type TipoDimensao = "CENTRO_CUSTO" | "CENTRO_LUCRO" | "SAFRA";

export type LinhaFluxoPorDimensao = {
  dimensaoId: string | null; // null = "Não classificado"
  dimensaoNome: string;      // "Não classificado" quando dimensaoId é null
  ano: number;
  mes: number;
  entradasRealizadas: number;
  saidasRealizadas: number;
  entradasProjetadas: number;
  saidasProjetadas: number;
};
```

## Serviços (`src/server/services/fluxoDeCaixaPorDimensao.ts`)

- `buscarRealizadoPorDimensao(filialId, tipoDimensao, ano, mes): Promise<Map<string | null, { entradas: number; saidas: number }>>`
  — soma `LancamentoBancario` (`conciliado: true`, `contaBancaria: { ativo:
  true }`, `data` dentro do mês) agrupado por `tipo` (ENTRADA/SAÍDA) e
  pela dimensão: `lancamento.<campo>Id ?? lancamento.baixa?.parcela.titulo.<campo>Id
  ?? null` — campo direto primeiro (lançamentos criados após a correção
  na origem), fallback via baixa pra dado histórico, `null` ("Não
  classificado") quando nenhum dos dois existe. Mesmo formato exato de
  `buscarRealizadoPorCategoria` (Orçamento, sub-projeto 1).
- `buscarProjetadoPorDimensao(filialId, tipoDimensao, ano, mes): Promise<Map<string | null, { entradas: number; saidas: number }>>`
  — soma `Parcela` em aberto (mesmos status do Fase 4b:
  `EM_ABERTO`/`A_VENCER`/`VENCIDO`/`PARCIALMENTE_PAGO`) com
  `dataVencimento` dentro do mês, via `saldoRemanescenteParcela`
  (reuso direto de `./fluxoDeCaixaProjetado`), agrupado por `titulo.tipo`
  (RECEBER→entradas projetadas, PAGAR→saídas projetadas) e por
  `titulo.<campo>` (chave `null` quando ausente — aqui não há fallback
  porque a parcela projetada só existe através do título, que já é a
  fonte direta).
- `listarValoresDimensao(filialId, tipoDimensao): Promise<{ id: string; nome: string }[]>`
  — lista os valores ativos da dimensão na filial (`CentroCusto`,
  `CentroLucro` ou `Safra` com `ativo: true`), viram uma linha cada, mesmo
  sem nenhuma movimentação no mês (linha com zeros — mesmo princípio já
  usado no Orçamento pra categoria ativa sem orçamento cadastrado).
- `listarFluxoDeCaixaPorDimensao(sessao, tipoDimensao, ano, mes): Promise<LinhaFluxoPorDimensao[]>`
  — `requirePermission(sessao.perfil, "titulo:ler")`; orquestra as 3
  funções acima; monta uma linha por valor de `listarValoresDimensao`
  mais **sempre** uma linha final `dimensaoId: null, dimensaoNome: "Não
  classificado"` (mesmo zerada — mesma prática de mercado em ERPs como
  SAP CO, TOTVS Protheus e Sankhya pra relatórios por centro de custo: a
  soma das linhas precisa sempre bater com o total geral do período já
  exibido nas telas de Fluxo de Caixa Realizado/Projetado da Fase 4, e
  esconder a linha condicionalmente quebraria essa reconciliação visual).
  É a única função de leitura que a UI usa, evitando o mesmo problema de
  fetch duplicado/condição de corrida já identificado nas Fases 4c e 5
  sub-projeto 1.

## Permissões

Nenhuma ação nova pro relatório — reaproveita `titulo:ler` (já concedida
aos 6 perfis), mesmo padrão do Fluxo de Caixa Projetado (Fase 4b). Os
seletores novos de dimensão nas telas de lançamento manual e conciliação
não mudam permissão nenhuma — continuam atrás de `lancamento:escrever`/
`conciliacao:escrever`, já existentes.

## UI e rotas

### Relatório (novo)

Nova rota `/controladoria/fluxo-por-dimensao`, entrada adicional na
seção de navegação "Controladoria" (a mesma criada pro Orçamento),
junto ao item "Orçamento".

- Seletor de dimensão: Centro de custo / Centro de lucro / Safra. Trocar
  a dimensão reseta a lista de linhas (cada dimensão tem seu próprio
  conjunto de valores) e refaz a consulta.
- Seletor de ano/mês navegável (mesmo componente do Orçamento,
  `SeletorAnoMes`, ou uma adaptação dele).
- Tabela: linhas = valores da dimensão selecionada + "Não classificado"
  (sempre presente), colunas = Entradas realizadas, Saídas realizadas,
  Entradas projetadas, Saídas projetadas, Saldo — onde
  `Saldo = (entradasRealizadas + entradasProjetadas) - (saidasRealizadas + saidasProjetadas)`,
  a geração de caixa líquida da linha somando o que já aconteceu com o
  que ainda está em aberto pra vencer no mês.

### Telas existentes (editadas)

- **Lançamento manual** (`src/app/(dashboard)/financeiro/tesouraria/`, o
  formulário que chama `criarLancamentoManual`): 4 seletores novos
  (centro de custo, centro de lucro, safra, projeto), todos opcionais,
  mesmo padrão visual do seletor de categoria financeira já existente
  ali.
- **Conciliação** (o formulário que chama `criarLancamentoDaLinha`):
  mesmos 4 seletores novos, mesma posição relativa ao seletor de
  categoria já existente.

## Testes

### Correção na origem

- `src/server/services/lancamentoBancario.test.ts`: `criarLancamentoManual`
  grava as 4 dimensões quando informadas; aceita omissão (todas opcionais);
  recusa dimensão que não pertence à filial ativa (4 casos, um por
  dimensão).
- `src/server/services/conciliacao.test.ts`: `criarLancamentoDaLinha`
  grava as 4 dimensões quando informadas.
- `src/server/services/baixa.test.ts`: `aprovarBaixa` copia as 4
  dimensões do título pro lançamento gerado (estende o teste já existente
  que cobre `categoriaFinanceiraId`).

### Relatório (`src/server/services/fluxoDeCaixaPorDimensao.test.ts`,
integração, Postgres real, fixture `financeiroTestFixtures.ts` estendida
conforme necessário pra criar centro de custo/centro de lucro/safra de
teste):

- `buscarRealizadoPorDimensao`: lançamento com a dimensão gravada
  diretamente soma na chave correta (caminho novo, pós-correção);
  lançamento sem campo direto mas com baixa cujo título tem a dimensão
  soma na chave correta via fallback (simula dado histórico, mesmo
  padrão de teste já usado no Orçamento — zera o campo direto após criar,
  simulando um registro anterior à correção); lançamento sem dimensão
  nenhuma (nem direto, nem via baixa) soma na chave `null`; escopo de
  filial (lançamento de outra filial não vaza).
- `buscarProjetadoPorDimensao`: só considera parcelas em aberto, mesmos
  status do Fase 4b; separação RECEBER/PAGAR no mesmo mês; escopo de
  filial.
- `listarValoresDimensao`: retorna valores ativos da dimensão mesmo sem
  movimentação; não retorna valores inativos.
- `listarFluxoDeCaixaPorDimensao`: monta uma linha por valor ativo mais
  a linha "Não classificado" **sempre presente**, mesmo com tudo zerado;
  centro de custo filho não soma no total do pai (sem rollup); as 3
  dimensões (`CENTRO_CUSTO`, `CENTRO_LUCRO`, `SAFRA`) produzem conjuntos
  de linhas independentes entre si.

## Depende de

- Fase 1 (`CentroCusto`, `CentroLucro`, `Safra`, `Projeto` já modelados).
- Fase 2 (`Titulo`/`Parcela` como fonte do projetado e das dimensões).
- Fase 2b/3 (`lancamentoBancario.ts`/`conciliacao.ts` — telas editadas
  nesta entrega pra capturar as dimensões na origem).
- Fase 3 (`LancamentoBancario` conciliado como fonte do realizado).
- Fase 4b (`saldoRemanescenteParcela`, reuso direto).

## Alimenta

- Fase 5, sub-projeto 2b ("Comparação entre safras" — usa o realizado e
  projetado por safra calculados aqui como parte do comparativo, agora
  sem a janela de dado permanentemente não-classificável que existiria
  se a correção na origem tivesse ficado pra depois).
- Fase 6 (relatórios e dashboards por dimensão, incluindo por projeto,
  já com o dado sendo capturado desde esta entrega).

## Fora de escopo (explicitamente adiado)

- Orçamento por dimensão (centro de custo, centro de lucro ou safra) —
  fica pro sub-projeto 2b (só safra) ou uma iteração futura (demais
  dimensões).
- Comparação entre safras (atual/anteriores/orçada/realizada/projetada)
  — sub-projeto 2b, desenho técnico separado.
- Relatório "fluxo de caixa por Projeto" — o dado passa a ser capturado
  nesta entrega, mas a tela de relatório fica pra quando for pedida.
- Rollup hierárquico de centro de custo (filho somando no pai).
- Tornar as 4 dimensões obrigatórias no cadastro de `Titulo`.
- Migração de backfill pra classificar lançamentos históricos sem baixa
  — resolvido por fallback na leitura pro caso via baixa; sem baixa, não
  há dado pra recuperar.
- Visão cruzando as 3 dimensões simultaneamente numa única tabela.
