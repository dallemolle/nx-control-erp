# Design — Fluxo de Caixa Estratégico (Fase 4c)

Status: Aprovado. Ainda não implementado.

## Contexto

A Fase 4 ("Fluxo de caixa") tem 3 sub-projetos. Os sub-projetos 1
("realizado", agrega `LancamentoBancario` conciliado) e 2 ("projetado",
agrega `Parcela` em aberto) já estão implementados e mesclados em
staging. Este documento cobre o sub-projeto 3: **"Fluxo de caixa
estratégico"** — uma projeção anual de 5 anos, em 3 cenários
(base/otimista/pessimista), com premissas macro editáveis
(crescimento, custos, CAPEX, endividamento, juros).

Diferente dos dois primeiros sub-projetos (puramente calculados sob
demanda, sem tabela nova), este precisa persistir dado editável pelo
usuário — as premissas de cada cenário não são derivadas de nenhum
dado transacional existente, são inseridas manualmente.

## Escopo por empresa, não por filial

Todo o resto do sistema (títulos, lançamentos, conciliação, cadastros) é
isolado por filial. Este sub-projeto é a primeira exceção deliberada:
planejamento estratégico de 5 anos é uma decisão de nível de empresa
(board-level), não de uma filial isolada — os cenários e premissas são
definidos **uma vez por empresa**, e a projeção consolida (soma) todas
as filiais da empresa. Decisão confirmada explicitamente com o usuário;
não é escopo por filial nesta nem em nenhuma iteração futura prevista.

## Simplificação de escopo (v1)

O escopo original em prosa
(`docs/fases/fase-4-fluxo-de-caixa.md`) lista 10 premissas: crescimento
de receita, margem, inflação, custos, despesas, CAPEX, endividamento,
taxas de juros, prazo médio de recebimento/pagamento, capital de giro.
Para a v1, simplificado para **5 premissas editáveis**, com o restante
explicitamente adiado (ver "Fora de escopo") — mesmo padrão de descope
já usado nos sub-projetos 1 e 2 desta fase:

1. `crescimentoReceita` — % ao ano, aplicado igual nos 5 anos (não há
   premissa por ano — decisão confirmada: uma taxa única).
2. `crescimentoCustos` — % ao ano; embute inflação (sem campo separado
   de "inflação" — evita ter 2 inputs que na prática se sobrepõem).
3. `capexPercentualReceita` — % da receita do próprio ano, não um valor
   fixo em R$ — escala naturalmente com o tamanho de cada cenário.
4. `novoEndividamentoAnual` — valor em R$, entrada de caixa por
   financiamento, constante todo ano.
5. `taxaJurosAnual` — % ao ano, incide sobre o saldo devedor acumulado
   (ver fórmula).

`margem` não é premissa de entrada — é uma métrica **derivada/exibida**
(`geracaoOperacional / receita`), calculada a partir de receita e custo
já projetados. Ter margem como input independente, junto de receita e
custo crescendo cada um por sua própria taxa, seria uma sobre-
especificação (as 3 coisas juntas podem se contradizer).

## Modelo de cálculo

Sem cache, sem materialização — a projeção é recalculada sob demanda a
partir do ano base (dados reais) + premissas do cenário (dado
persistido). Roda 3 vezes por chamada (uma por cenário), sempre a
partir do mesmo ano base.

### Ano base (ano 0)

Consolidado por empresa (soma de todas as filiais do usuário), a partir
dos **últimos 12 meses do fluxo de caixa realizado** (Fase 4a — reusa
`buscarSaldoEmCaixaAte`/a mesma fonte de `LancamentoBancario` conciliado
por filial, somando o resultado de cada filial da empresa):

- `receitaBase` = soma das entradas de caixa conciliadas dos últimos 12
  meses, todas as filiais.
- `custoBase` = soma das saídas de caixa conciliadas dos últimos 12
  meses, todas as filiais.
- `saldoCaixaBase` = saldo em caixa consolidado de hoje (soma de
  `buscarSaldoEmCaixaAte` de cada filial na data de hoje).

Simplificação aceita: isso é caixa (o que já entrou/saiu do banco), não
resultado contábil (DRE) — consistente com o caráter cash-basis de toda
a Fase 4. Empresa nova ou sem 12 meses de histórico real terá
`receitaBase`/`custoBase` de zero ou parciais — comportamento aceito,
sem tratamento especial nesta v1.

### Projeção, ano a ano (N de 1 a 5), por cenário

```
receita[N]              = receita[N-1] × (1 + crescimentoReceita)
custoOperacional[N]     = custo[N-1] × (1 + crescimentoCustos)
capex[N]                = receita[N] × capexPercentualReceita
saldoDevedorAcumulado[N] = saldoDevedorAcumulado[N-1] + novoEndividamentoAnual
jurosSobreDivida[N]     = saldoDevedorAcumulado[N-1] × taxaJurosAnual

geracaoOperacional[N]   = receita[N] − custoOperacional[N]
geracaoLiquida[N]       = geracaoOperacional[N] − capex[N] + novoEndividamentoAnual − jurosSobreDivida[N]
saldoCaixa[N]           = saldoCaixa[N-1] + geracaoLiquida[N]

margemLiquida[N]        = geracaoOperacional[N] / receita[N]   (só exibição, não persiste, não é input)
```

`receita[0] = receitaBase`, `custo[0] = custoBase`,
`saldoCaixa[0] = saldoCaixaBase`, `saldoDevedorAcumulado[0] = 0` (não há
dívida "estratégica" pré-existente modelada — o endividamento real da
empresa hoje já está implícito no `saldoCaixaBase`, que vem do caixa
real).

**Simplificação assumida e documentada**: juros incidem sobre o saldo
devedor acumulado, sem nenhuma amortização de principal modelada (a
dívida só cresce, nunca é paga) — adequado para uma visão estratégica
direcional de 5 anos, não para um cronograma de dívida real. Se um dia
for necessário modelar amortização, é uma mudança isolada dentro da
função pura de cálculo (ver "Como isso facilita ajustes futuros").

### Como isso facilita ajustes futuros

O usuário confirmou que a fórmula acima ainda não foi validada com o
contador da empresa e que ajustes são esperados. A fórmula inteira vive
numa função pura, sem I/O (mesmo padrão de
`calcularPeriodosFluxoDeCaixa`/`calcularPeriodosFluxoDeCaixaProjetado`
dos sub-projetos 1/2) — trocar a matemática interna (mudar como o CAPEX
é calculado, adicionar amortização, mudar a base dos juros) é uma
mudança isolada nessa função + seus testes, sem tocar a busca de dados
nem a tela. Adicionar uma premissa nova exige uma coluna nova em
`CenarioEstrategico` + um campo no formulário + uso na função pura —
contido, mesmo padrão de esforço já visto nas fases anteriores. Trocar
o modelo inteiro (ex.: DRE completo com impostos) seria redesenho da
função pura, mas o encaixe com schema/tela/navegação already estabelecido
continua valendo.

## Modelo de dados

Um modelo novo, sem tabela de "premissas" separada — como os valores são
únicos por cenário (não variam por ano, decisão confirmada), ficam como
campos diretos. Histórico de alteração de premissas não precisa de
tabela própria: todo `update` já passa por `registrarAuditoria`
(`src/server/audit/registrar.ts`), que grava o diff de campos alterados
em `AuditLog` — o mesmo mecanismo usado por todo o resto do sistema.

```prisma
enum TipoCenarioEstrategico {
  BASE
  OTIMISTA
  PESSIMISTA
}

model CenarioEstrategico {
  id                     String                  @id @default(cuid())
  empresaId              String
  tipo                   TipoCenarioEstrategico
  crescimentoReceita     Decimal                 @db.Decimal(7, 4)
  crescimentoCustos      Decimal                 @db.Decimal(7, 4)
  capexPercentualReceita Decimal                 @db.Decimal(7, 4)
  novoEndividamentoAnual Decimal                 @db.Decimal(18, 2)
  taxaJurosAnual         Decimal                 @db.Decimal(7, 4)
  criadoEm               DateTime                @default(now())
  atualizadoEm           DateTime                @updatedAt

  empresa Empresa @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  @@unique([empresaId, tipo])
  @@index([empresaId])
}
```

Percentuais guardados como fração decimal (`0.08` = 8% ao ano), mesma
convenção seria natural adotar já que o restante do schema usa
`Decimal` para todo valor monetário/percentual sensível a arredondamento
— nunca `Float`.

**Criação automática dos 3 cenários**: quando uma `Empresa` é criada
(`/empresas`), ela já nasce com os 3 `CenarioEstrategico` (BASE,
OTIMISTA, PESSIMISTA) com todas as premissas zeradas — mesmo padrão já
usado pela `Filial` "Matriz", que hoje já nasce automaticamente junto
com toda `Empresa` nova (Fase 1). Empresas já existentes no banco (as
duas fixtures de teste e a empresa de produção/seed) recebem os 3
cenários via uma migration de backfill, não só a partir de agora.

## Serviços (`src/server/services/fluxoDeCaixaEstrategico.ts`)

Tipos:

```ts
export type TipoCenarioEstrategico = "BASE" | "OTIMISTA" | "PESSIMISTA";

export type PremissasCenario = {
  crescimentoReceita: number;
  crescimentoCustos: number;
  capexPercentualReceita: number;
  novoEndividamentoAnual: number;
  taxaJurosAnual: number;
};

export type AnoProjetadoEstrategico = {
  ano: number; // 1 a 5
  receita: number;
  custoOperacional: number;
  capex: number;
  jurosSobreDivida: number;
  geracaoOperacional: number;
  geracaoLiquida: number;
  saldoCaixa: number;
  margemLiquida: number; // 0 se receita for 0, para não dividir por zero
};
```

Função pura (sem I/O, testável exaustivamente sem banco):

- `calcularProjecaoEstrategica(premissas: PremissasCenario, receitaBase: number, custoBase: number, saldoCaixaBase: number): AnoProjetadoEstrategico[]`
  — roda os 5 anos da fórmula acima, encadeando receita/custo/saldo de
  caixa/saldo devedor ano a ano; devolve exatamente 5 linhas.

Funções assíncronas:

- `buscarAnoBaseConsolidado(empresaId: string): Promise<{ receitaBase: number; custoBase: number; saldoCaixaBase: number }>`
  — busca as filiais da empresa (`prisma.filial.findMany({ where: { empresaId } })`),
  soma `buscarSaldoEmCaixaAte(filialId, hoje)` de cada uma para
  `saldoCaixaBase`, e soma entradas/saídas conciliadas dos últimos 12
  meses de cada filial (mesma fonte de `LancamentoBancario` já usada em
  `fluxoDeCaixa.ts`) para `receitaBase`/`custoBase`.
- `listarCenariosEstrategicos(sessao: SessaoAtiva): Promise<Record<TipoCenarioEstrategico, PremissasCenario & { id: string }>>`
  — `requirePermission(sessao.perfil, "planejamentoEstrategico:ler")`;
  busca os 3 `CenarioEstrategico` da empresa ativa.
- `listarProjecaoEstrategica(sessao: SessaoAtiva): Promise<Record<TipoCenarioEstrategico, AnoProjetadoEstrategico[]>>`
  — `requirePermission(sessao.perfil, "planejamentoEstrategico:ler")`;
  busca o ano base uma vez (`buscarAnoBaseConsolidado`) e os 3 cenários,
  roda `calcularProjecaoEstrategica` para cada um, devolve os 3
  resultados.
- `atualizarPremissasCenario(sessao: SessaoAtiva, tipo: TipoCenarioEstrategico, premissas: PremissasCenario): Promise<void>`
  — `requirePermission(sessao.perfil, "planejamentoEstrategico:escrever")`
  (sem `requireAlteracaoFilial` — ver "Permissões" abaixo); valida que o
  `CenarioEstrategico` pertence à empresa ativa da sessão antes de
  atualizar; grava via `registrarAuditoria`.

## Permissões

**2 ações novas**: `planejamentoEstrategico:ler` (todos os 6 perfis,
mesmo padrão universal de leitura de `titulo:ler`/`lancamento:ler`) e
`planejamentoEstrategico:escrever` (só `ADMINISTRADOR` — já tem `"TODAS"`
— e `GESTOR`, adicionado ao seu conjunto de permissões; primeira
permissão de escrita do perfil GESTOR em todo o sistema).

**Sem `requireAlteracaoFilial`** na escrita — essa checagem é sobre
acesso de alteração a uma filial específica (`UsuarioEmpresaFilial.
podeAlterar`), e este recurso é por empresa, não por filial. Segue o
mesmo padrão já usado por `empresa:gerenciar`/`usuario:gerenciar`
(ações de escopo de empresa que também não passam por esse gate).

## UI e rotas

Nova entrada de nav "Fluxo de caixa estratégico" →
`/financeiro/fluxo-de-caixa-estrategico` (sem `permitido` — todo perfil
tem `planejamentoEstrategico:ler`).

- Seletor de cenário (Base / Otimista / Pessimista).
- Formulário das 5 premissas do cenário selecionado — campos editáveis
  só para quem tem `planejamentoEstrategico:escrever` (ADMINISTRADOR/
  GESTOR); demais perfis veem os mesmos valores em modo leitura.
- Tabela: colunas Ano 1 a Ano 5, linhas Receita / Custo operacional /
  CAPEX / Juros / Geração líquida / Saldo de caixa / Margem líquida —
  para o cenário selecionado.
- Sem gráfico nesta v1 (só tabela) — mesma decisão de manter a
  superfície mínima já tomada nos sub-projetos 1/2.

## Testes

`src/server/services/fluxoDeCaixaEstrategico.test.ts`:

- Pura (sem banco): `calcularProjecaoEstrategica` — devolve exatamente 5
  anos; encadeia receita/custo/saldo de caixa corretamente ano a ano;
  saldo devedor acumula `novoEndividamentoAnual` todo ano sem
  amortização; juros incidem sobre o saldo devedor do ano ANTERIOR (não
  o do próprio ano); `margemLiquida` não lança erro quando `receitaBase`
  é 0 (retorna 0, não `NaN`/`Infinity`); premissas todas zeradas
  reproduz o ano base nos 5 anos sem crescimento nenhum.
- Integração (Postgres real): `buscarAnoBaseConsolidado` soma
  corretamente os últimos 12 meses de 2 filiais da mesma empresa (não
  soma uma filial de outra empresa); `listarCenariosEstrategicos`/
  `listarProjecaoEstrategica` escopam por empresa ativa da sessão;
  `atualizarPremissasCenario` recusa perfil sem
  `planejamentoEstrategico:escrever` (ex.: FINANCEIRO); um cenário de
  uma empresa não pode ser atualizado por sessão de outra empresa (usar
  `id` do cenário sem checar `empresaId` seria uma falha de isolamento —
  teste explícito pra isso).

## Depende de

- Fase 4a (fluxo de caixa realizado — fonte do ano base).
- Fase 1 (Empresa/Filial — consolidação por empresa).

## Fora de escopo (explicitamente adiado)

- Prazo médio de recebimento/pagamento (DSO/DPO) e capital de giro como
  premissas — exigem modelar descasamento de caixa no tempo, um
  sub-projeto à parte.
- Amortização de dívida (principal pago ao longo do tempo) — v1 assume
  juros apenas, saldo devedor só cresce.
- Premissas variáveis por ano (5 valores por premissa em vez de 1) —
  decisão confirmada: taxa única aplicada aos 5 anos.
- Cenários customizáveis além dos 3 fixos (base/otimista/pessimista) —
  decisão confirmada: sempre esses 3, sem criar/nomear cenários novos.
- Gráficos/visualização — só tabela nesta v1.
- Consolidação/comparação com o orçamento (Fase 5, ainda não desenhada).
- Reconstrução de cadeia de anos "invisíveis" fora da janela — não se
  aplica aqui (a janela é sempre os mesmos 5 anos a partir de hoje, sem
  navegação de período, diferente dos sub-projetos 1/2).
