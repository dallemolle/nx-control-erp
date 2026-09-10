# Design — Fluxo de caixa por dimensão (Fase 5, sub-projeto 2a)

Status: Aprovado. Ainda não implementado.

## Contexto

A Fase 5 ("Controladoria e orçamento") tem dois sub-projetos. O
sub-projeto 1 (Orçamento, `docs/superpowers/specs/2026-09-09-orcamento-design.md`)
já está implementado e mesclado em `staging`. O sub-projeto 2, "Comparativos
por dimensão", tem duas partes de peso bem diferente:

- **2a (este documento)**: fluxo de caixa por centro de custo, por centro
  de lucro, por safra — realizado e projetado, sem orçado.
- **2b (ainda sem desenho técnico)**: comparação entre safras (orçado x
  realizado x projetado). Depende de estender o modelo de `Orcamento` pra
  aceitar safra como dimensão — o sub-projeto 1 documentou explicitamente
  que orçamento por centro de custo/lucro/safra/projeto ficaria "pro
  sub-projeto 2 ou uma iteração futura". Por isso 2b é desenhado só depois
  que 2a estiver pronto.

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
estava desatualizada em relação ao código atual.

**Decisões confirmadas com o usuário:**
- Não mexer no cadastro de `Titulo` pra tornar essas dimensões
  obrigatórias — fica opcional, com um bucket "Não classificado" pros
  títulos/lançamentos sem a dimensão preenchida.
- Não adicionar as 4 dimensões em `LancamentoBancario` (que resolveria o
  problema na raiz, mas exigiria migração + tocar em código já fechado de
  Fase 2b/3). A única fonte de "realizado por dimensão" é o caminho via
  baixa — um lançamento manual ou de conciliação sem baixa vinculada
  **sempre** cai em "Não classificado", não é uma limitação temporária de
  dado histórico como foi o caso da categoria financeira.
- A linha "Não classificado" **sempre aparece** na tela, mesmo com todos
  os valores zerados — mesma prática de mercado em ERPs (SAP CO, TOTVS
  Protheus, Sankhya) pra relatórios por centro de custo: a soma das linhas
  precisa sempre bater com o total geral do período (já exibido nas telas
  de Fluxo de Caixa Realizado/Projetado da Fase 4), então esconder a linha
  condicionalmente quebraria essa reconciliação visual e geraria
  desconfiança quando ela aparecesse "do nada".

## Escopo

- 3 dimensões: **Centro de custo, Centro de lucro, Safra**. Projeto fica
  de fora — a Fase 5 em prosa só cita essas 3 pra "fluxo de caixa por
  dimensão" (Projeto aparece só na seção de Orçamento).
- Cobre **realizado e projetado**, sem orçado (orçado por dimensão é
  sub-projeto 2b, restrito a safra, e ainda sem desenho).
- Centro de custo é hierárquico (`parentId`/`filhos`). **Sem rollup**: um
  centro de custo filho não soma no total do pai — cada centro de custo
  ativo é sua própria linha independente, mesmo padrão já usado pra
  categoria financeira no Orçamento (também hierárquica, também sem
  rollup).
- Uma dimensão por vez na tela, escolhida por um seletor — não uma visão
  cruzando as 3 simultaneamente.

## Modelo de dados

Nenhuma tabela nova, nenhuma migração — cálculo sob demanda a partir de
`LancamentoBancario` (realizado) e `Parcela` (projetado), mesmo espírito
das Fases 4a/4b.

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
  pela dimensão derivada via `lancamento.baixa?.parcela.titulo.<campo>`
  (chave `null` quando não há baixa ou o título não tem essa dimensão
  preenchida — o único caminho possível, ver "Achado técnico" acima).
- `buscarProjetadoPorDimensao(filialId, tipoDimensao, ano, mes): Promise<Map<string | null, { entradas: number; saidas: number }>>`
  — soma `Parcela` em aberto (mesmos status do Fase 4b:
  `EM_ABERTO`/`A_VENCER`/`VENCIDO`/`PARCIALMENTE_PAGO`) com
  `dataVencimento` dentro do mês, via `saldoRemanescenteParcela`
  (reuso direto de `./fluxoDeCaixaProjetado`), agrupado por `titulo.tipo`
  (RECEBER→entradas projetadas, PAGAR→saídas projetadas) e por
  `titulo.<campo>` (chave `null` quando ausente).
- `listarValoresDimensao(filialId, tipoDimensao): Promise<{ id: string; nome: string }[]>`
  — lista os valores ativos da dimensão na filial (`CentroCusto`,
  `CentroLucro` ou `Safra` com `ativo: true`), viram uma linha cada, mesmo
  sem nenhuma movimentação no mês (linha com zeros — mesmo princípio já
  usado no Orçamento pra categoria ativa sem orçamento cadastrado).
- `listarFluxoDeCaixaPorDimensao(sessao, tipoDimensao, ano, mes): Promise<LinhaFluxoPorDimensao[]>`
  — `requirePermission(sessao.perfil, "titulo:ler")`; orquestra as 3
  funções acima; monta uma linha por valor de `listarValoresDimensao`
  mais **sempre** uma linha final `dimensaoId: null, dimensaoNome: "Não
  classificado"` (mesmo zerada). É a única função de leitura que a UI
  usa, evitando o mesmo problema de fetch duplicado/condição de corrida
  já identificado nas Fases 4c e 5 sub-projeto 1.

## Permissões

Nenhuma ação nova. Reaproveita `titulo:ler` (já concedida aos 6 perfis),
mesmo padrão do Fluxo de Caixa Projetado (Fase 4b) — é leitura, mesma
sensibilidade dos dados já expostos nas telas de fluxo de caixa
existentes.

## UI e rotas

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

## Testes

`src/server/services/fluxoDeCaixaPorDimensao.test.ts` (integração,
Postgres real, fixture `financeiroTestFixtures.ts` estendida conforme
necessário pra criar centro de custo/centro de lucro/safra de teste):

- `buscarRealizadoPorDimensao`: lançamento gerado por baixa de um título
  com a dimensão preenchida soma na chave correta; lançamento sem baixa
  (manual/conciliação) soma na chave `null`; lançamento com baixa mas
  cujo título não tem a dimensão preenchida também soma em `null`;
  escopo de filial (lançamento de outra filial não vaza).
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

- Fase 1 (`CentroCusto`, `CentroLucro`, `Safra` já modelados).
- Fase 2 (`Titulo`/`Parcela` como fonte do projetado e das dimensões).
- Fase 3 (`LancamentoBancario` conciliado como fonte do realizado).
- Fase 4b (`saldoRemanescenteParcela`, reuso direto).

## Alimenta

- Fase 5, sub-projeto 2b ("Comparação entre safras" — usa o realizado e
  projetado por safra calculados aqui como parte do comparativo).
- Fase 6 (relatórios e dashboards por dimensão).

## Fora de escopo (explicitamente adiado)

- Orçamento por dimensão (centro de custo, centro de lucro ou safra) —
  fica pro sub-projeto 2b (só safra) ou uma iteração futura (demais
  dimensões).
- Comparação entre safras (atual/anteriores/orçada/realizada/projetada)
  — sub-projeto 2b, desenho técnico separado.
- Fluxo de caixa por Projeto — não faz parte do escopo em prosa desta
  parte da Fase 5.
- Rollup hierárquico de centro de custo (filho somando no pai).
- Tornar as 4 dimensões obrigatórias no cadastro de `Titulo`.
- Adicionar as 4 dimensões em `LancamentoBancario` — resolveria a
  limitação do "Não classificado" na raiz, mas fica pra uma iteração
  futura caso se mostre necessário na prática.
- Visão cruzando as 3 dimensões simultaneamente numa única tabela.
