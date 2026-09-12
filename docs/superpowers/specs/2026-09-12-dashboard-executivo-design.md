# Dashboard executivo — Fase 6, sub-projeto 6a

## Contexto

Fase 6 (Gestão) é a última fase planejada do projeto e cobre 4 peças
distintas: Dashboard executivo, Relatórios exportáveis, Filtros globais e
Auditoria/aprovações. É grande o suficiente para decompor em sub-projetos
independentes, como já feito nas Fases 4 e 5. Este documento desenha o
primeiro: **Dashboard executivo**.

Escopo em prosa original: `docs/fases/fase-6-gestao.md`, seção "Dashboard
executivo".

### O que já existe hoje (levantado antes do desenho)

- `/` (`src/app/(dashboard)/page.tsx`): dashboard cadastral — só contagens
  (clientes, fornecedores, centros de custo/lucro, safras, contas
  bancárias, usuários). Nenhum indicador financeiro, nenhum gráfico.
  **Não é tocado por este sub-projeto** — continua como está, aberto a
  todos os perfis.
- Nenhuma biblioteca de gráficos existe no projeto hoje.
- O padrão de consolidação por empresa (somar todas as filiais de uma
  empresa) já existe em `buscarAnoBaseConsolidado`
  (`src/server/services/fluxoDeCaixaEstrategico.ts`): busca
  `prisma.filial.findMany({ where: { empresaId } })` e faz um loop
  somando o resultado de funções já existentes por filial. Este
  sub-projeto replica exatamente esse padrão.

### Decisões já confirmadas com o usuário

1. Indicadores + gráficos entram juntos nesta primeira versão (não
   dividido em v1 sem gráfico / v2 com gráfico).
2. Escopo consolidado por **empresa** (soma todas as filiais), não por
   filial ativa — mesmo padrão do Fluxo de caixa estratégico.
3. "Endividamento" e "necessidade de capital de giro" (da lista original
   da Fase 6) ficam de fora — não existe modelo de empréstimo/financiamento
   no sistema hoje.
4. "Saldo bancário" não é um indicador separado de "caixa disponível" —
   não existe um segundo conceito de saldo a nível de empresa no modelo de
   dados atual.
5. 2 dos 5 gráficos originais ("Orçado x Realizado" por categoria, "Fluxo
   de caixa por dimensão") saem do escopo: `CategoriaFinanceira`,
   `CentroCusto`, `CentroLucro` e `Safra` são cadastrados por filial, sem
   identidade em comum entre filiais para agregar — não há hoje uma forma
   correta de somar "esta categoria" ou "este centro de custo" entre
   filiais diferentes. Registrado em `docs/backlog.md` para quando o
   sub-projeto de Filtros globais (ou um cadastro compartilhado entre
   filiais) existir.
6. Acesso restrito — mesmo tier do Fluxo de caixa estratégico
   (`ADMINISTRADOR`/`GESTOR`/`AUDITOR`), não os 6 perfis: dado consolidado
   de empresa inteira soma filiais que o usuário pode não ter acesso
   individual concedido.
7. Rota nova (`/dashboard-executivo`), não a `/` atual — evita condicionar
   o conteúdo da home por perfil.

## Seção 1 — Indicadores

Todos consolidados por empresa (loop por filial, somando o resultado de
funções já existentes — nenhuma query nova duplicando lógica já
existente):

| # | Indicador | Fonte |
|---|---|---|
| 1 | Caixa disponível | soma de `buscarSaldoEmCaixaAte(filial.id, hoje)` (`fluxoDeCaixa.ts`) |
| 2 | Contas a pagar em aberto | soma do saldo remanescente (`saldoRemanescenteParcela`, `fluxoDeCaixaProjetado.ts`) de `Parcela` `PAGAR` em status aberto (`EM_ABERTO`/`A_VENCER`/`VENCIDO`/`PARCIALMENTE_PAGO`) |
| 3 | Contas a receber em aberto | mesma lógica, `RECEBER` |
| 4 | Inadimplência | soma do saldo remanescente de `Parcela` `RECEBER` especificamente `VENCIDO` |
| 5 | Geração de caixa (mês atual) | entradas − saídas conciliadas do mês corrente (`groupBy` por `tipo`, mesmo padrão de `buscarAnoBaseConsolidado`) |
| 6 | Obrigações próximos 7 dias | soma do saldo remanescente de `Parcela` `PAGAR` com `dataVencimento` entre hoje e hoje+7 |
| 7 | Obrigações próximos 30 dias | mesma lógica, janela de 30 dias |
| 8 | Recebimentos esperados (30 dias) | mesma lógica do indicador 7, `RECEBER` |
| 9 | Saldo projetado (30 dias) | calculado em memória: indicador 1 + indicador 8 − indicador 7 (não precisa reusar o serviço de projeção de 12 meses inteiro) |

Fora de escopo (backlog): endividamento, necessidade de capital de giro
(sem modelo de dados hoje).

## Seção 2 — Gráficos

3 gráficos, todos consolidados por empresa, todos com um eixo que **não**
é preso a uma filial (tempo, ou faixa de dias):

1. **Entradas x Saídas** — série dos últimos 6 meses,
   `{ mes: string, entradas: number, saidas: number }[]`. Mesma agregação
   mensal de `buscarAnoBaseConsolidado` (groupBy por `tipo`, por filial,
   somado), repetida por mês em vez de uma janela de 1 ano só.
2. **Evolução do saldo** — `{ mes: string, saldo: number }[]` dos últimos
   6 meses. Chama `buscarSaldoEmCaixaAte(filial.id, fimDoMes)` para cada
   um dos 6 meses, somado entre filiais — reaproveita a função tal como
   está, sem precisar encadear saldo mês a mês (diferente do Fluxo de
   caixa projetado, que precisa da cadeia porque projeta o futuro; aqui é
   só o passado já conciliado, recalculável a qualquer ponto no tempo).
3. **Aging de contas a pagar/receber** —
   `{ faixa: "0-30" | "31-60" | "61-90" | "90+", contasAPagar: number, contasAReceber: number }[]`,
   soma do saldo remanescente de parcelas vencidas, agrupado por dias de
   atraso a partir de `dataVencimento` (referência: hoje).

Fora de escopo (backlog): "Orçado x Realizado" por categoria e "Fluxo de
caixa por dimensão", consolidados por empresa — ver decisão 5 acima.

Biblioteca nova: `recharts`, via o componente `chart` do shadcn/ui
(`npx shadcn add chart` — gera `src/components/ui/chart.tsx`, wrapper
sobre `recharts` já com tema claro/escuro integrado ao design system
existente).

## Seção 3 — Arquitetura

- **Rota**: `/dashboard-executivo` — nova, não a `/` atual (que continua
  como está, aberta a todos os perfis).
- **Permissão nova**: `dashboardExecutivo:ler`, concedida a
  `ADMINISTRADOR`/`GESTOR`/`AUDITOR` (mesmo tier de
  `planejamentoEstrategico:ler`, mas ação própria — são features
  diferentes que só coincidem no nível de sensibilidade).
- **Serviço novo**: `src/server/services/dashboardExecutivo.ts`:

```ts
export type IndicadoresExecutivos = {
  caixaDisponivel: number;
  contasAPagarEmAberto: number;
  contasAReceberEmAberto: number;
  inadimplencia: number;
  geracaoDeCaixaMesAtual: number;
  obrigacoes7Dias: number;
  obrigacoes30Dias: number;
  recebimentosEsperados30Dias: number;
  saldoProjetado30Dias: number;
};

export type PontoEntradasSaidas = { mes: string; entradas: number; saidas: number };
export type PontoEvolucaoSaldo = { mes: string; saldo: number };
export type FaixaAging = "0-30" | "31-60" | "61-90" | "90+";
export type PontoAging = { faixa: FaixaAging; contasAPagar: number; contasAReceber: number };

export type GraficosExecutivos = {
  entradasSaidas: PontoEntradasSaidas[];
  evolucaoSaldo: PontoEvolucaoSaldo[];
  aging: PontoAging[];
};

export async function buscarIndicadoresExecutivos(sessao: SessaoAtiva): Promise<IndicadoresExecutivos>;
export async function buscarGraficosExecutivos(sessao: SessaoAtiva): Promise<GraficosExecutivos>;
```

Ambas as funções: `requirePermission(sessao.perfil, "dashboardExecutivo:ler")`,
depois `prisma.filial.findMany({ where: { empresaId: sessao.empresaId } })`
e loop por filial reaproveitando as funções já existentes citadas nas
Seções 1 e 2, somando os resultados em memória.

- **Sem cache, sem tabela nova** — calculado sob demanda a cada acesso à
  página, mesma filosofia do resto do sistema (Fluxo de caixa, Orçamento,
  Fluxo de caixa estratégico).

## Seção 4 — UI e dados

- `src/app/(dashboard)/dashboard-executivo/page.tsx` — server component:
  `requireSessaoAtiva()` + `requirePermission(sessao.perfil,
  "dashboardExecutivo:ler")`, chama `buscarIndicadoresExecutivos` e
  `buscarGraficosExecutivos` em paralelo (`Promise.all`), renderiza:
  - Grid de 9 cards de indicador (mesmo componente `Card` já usado na `/`
    atual).
  - 3 gráficos abaixo, cada um em seu componente client:
    `entradas-saidas-chart.tsx`, `evolucao-saldo-chart.tsx`,
    `aging-chart.tsx`.
- Nova seção "Gestão" em `src/app/(dashboard)/nav-items.ts` (a Fase 6 é
  justamente isso):
  ```ts
  {
    titulo: "Gestão",
    itens: [
      { href: "/dashboard-executivo", label: "Dashboard executivo", permitido: ["ADMINISTRADOR", "GESTOR", "AUDITOR"] },
    ],
  },
  ```

## Arquivos afetados (resumo)

- `src/server/auth/permissions.ts` — nova ação `dashboardExecutivo:ler`,
  concedida a `ADMINISTRADOR` (já é `"TODAS"`), `GESTOR`, `AUDITOR`.
- `src/server/services/dashboardExecutivo.ts` (novo).
- `src/components/ui/chart.tsx` (novo, gerado via shadcn/ui) +
  dependência `recharts` no `package.json`.
- `src/app/(dashboard)/dashboard-executivo/page.tsx` (novo) +
  `entradas-saidas-chart.tsx`, `evolucao-saldo-chart.tsx`,
  `aging-chart.tsx` (novos, client components).
- `src/app/(dashboard)/nav-items.ts` — nova seção "Gestão".
- `docs/backlog.md` — já atualizado nesta sessão com os 2 gráficos fora
  de escopo.
