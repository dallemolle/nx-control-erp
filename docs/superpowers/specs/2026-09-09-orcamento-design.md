# Design — Orçamento (Fase 5, sub-projeto 1)

Status: Aprovado. Ainda não implementado.

## Contexto

A Fase 5 ("Controladoria e orçamento") tem duas partes com dependência
natural entre si: **Orçamento** (este documento) e **Comparativos por
dimensão** (sub-projeto 2, ainda sem desenho técnico — fluxo de caixa
por centro de custo/lucro/safra, comparação entre safras). O sub-projeto
2 depende deste, porque a coluna "orçada" dos seus comparativos usa o
orçamento cadastrado aqui — por isso a ordem escolhida foi começar pelo
Orçamento.

Este documento cobre: cadastro de orçamento por categoria financeira e
mês/ano, comparativos orçado×realizado×projetado (valor, variação
absoluta e percentual), e alertas de estouro. Reaproveita diretamente o
que as Fases 2-4 já construíram: `CategoriaFinanceira` (Fase 1),
`Titulo`/`Parcela` em aberto (Fase 2, já usados no "projetado" — Fase
4b), e `LancamentoBancario` conciliado (Fase 3, já usado no "realizado"
— Fase 4a).

## Escopo desta v1 (reduzido do original em prosa)

O escopo original (`docs/fases/fase-5-controladoria.md`) descreve
"orçamento por categoria, centro de custo, centro de lucro, safra,
projeto". Esta v1 fica restrita a **orçamento por categoria financeira
apenas** — decisão confirmada com o usuário. Motivo: `LancamentoBancario`
(fonte do "realizado") só carrega `categoriaFinanceiraId` diretamente;
as outras dimensões (centro de custo/lucro, safra, projeto) só existem
em `Titulo`, exigindo joins adicionais que fogem do escopo desta
primeira entrega. Quebra por essas dimensões é exatamente o que o
sub-projeto 2 ("Comparativos por dimensão") já existe para cobrir.

## Achado técnico: `LancamentoBancario.categoriaFinanceiraId` não é
## confiável hoje para lançamentos gerados por baixa

`LancamentoBancario` já tem um campo `categoriaFinanceiraId` (opcional),
usado por lançamentos manuais (`lancamentoBancario.ts`) e por
lançamentos criados na conciliação (`conciliacao.ts`). Mas o caminho
mais comum de gerar um lançamento — **baixa aprovada de título**
(`aprovarBaixa` em `src/server/services/baixa.ts:102-114`) — cria o
`LancamentoBancario` **sem copiar** a categoria do título. Isso significa
que, hoje, a maior parte dos lançamentos reais provavelmente está sem
categoria, o que tornaria "realizado por categoria" incompleto.

**Correção** (parte deste sub-projeto, decisão confirmada): `aprovarBaixa`
passa a gravar `categoriaFinanceiraId: parcela.titulo.categoriaFinanceiraId`
no `LancamentoBancario` que cria. Mudança pequena e cirúrgica em
`baixa.ts` — cobre todo lançamento novo gerado por baixa a partir de
agora. Para dado histórico (lançamentos já criados antes desta correção,
sem categoria), a consulta do comparativo usa um fallback: se o
lançamento não tem `categoriaFinanceiraId` direto mas tem `baixaId`,
deriva a categoria via `lancamento.baixa.parcela.titulo.categoriaFinanceiraId`.
Sem migration de backfill — o fallback resolve isso na leitura.

## Modelo de dados

```prisma
model Orcamento {
  id                    String              @id @default(uuid())
  filialId              String
  categoriaFinanceiraId String
  ano                   Int
  mes                   Int // 1-12
  valor                 Decimal             @db.Decimal(18, 2)
  criadoEm              DateTime            @default(now())
  atualizadoEm          DateTime            @updatedAt

  filial              Filial              @relation(fields: [filialId], references: [id], onDelete: Cascade)
  categoriaFinanceira CategoriaFinanceira @relation(fields: [categoriaFinanceiraId], references: [id])

  @@unique([filialId, categoriaFinanceiraId, ano, mes])
  @@index([filialId])
  @@map("orcamentos")
}
```

Escopo por **filial** (não por empresa) — mesmo nível de isolamento de
`CategoriaFinanceira` e de tudo mais no sistema, exceto o Fluxo de Caixa
Estratégico (Fase 4c), que foi uma exceção deliberada e documentada.
`ano`/`mes` como colunas separadas (não uma `Date`) — mais simples de
indexar e agrupar, e não há necessidade de dia-do-mês.

Valor cadastrado **mês a mês** (decisão confirmada) — 12 linhas por
categoria por ano, refletindo sazonalidade real, comparável direto com
as granularidades mensais já existentes no realizado/projetado.

## Serviços (`src/server/services/orcamento.ts`)

Tipos:

```ts
export type LinhaComparativoOrcamento = {
  categoriaFinanceiraId: string;
  categoriaNome: string;
  tipoCategoria: "RECEITA" | "DESPESA";
  ano: number;
  mes: number;
  orcado: number;
  realizado: number;
  projetado: number;
  variacaoAbsolutaRealizado: number; // realizado - orcado
  variacaoPercentualRealizado: number | null; // null quando orcado === 0
  alerta: boolean; // só DESPESA; realizado + projetado > orcado
};
```

Funções:

- `listarOrcamento(sessao, ano)` — `requirePermission(sessao.perfil,
  "orcamento:ler")`; busca `Orcamento` da filial ativa pro ano pedido,
  uma linha por categoria×mês (categorias sem valor cadastrado aparecem
  com `orcado: 0`, não ficam ausentes — a grade de edição precisa das 12
  células por categoria mesmo vazias).
- `salvarValorOrcamento(sessao, categoriaFinanceiraId, ano, mes, valor)`
  — `requirePermission(sessao.perfil, "orcamento:escrever")`; `upsert`
  por `[filialId, categoriaFinanceiraId, ano, mes]` (mesmo padrão
  idempotente já usado em `CenarioEstrategico`, Fase 4c — evita
  race conditions numa grade onde várias células podem salvar quase ao
  mesmo tempo); grava via `registrarAuditoria`.
- `buscarRealizadoPorCategoria(filialId, ano, mes)` — soma
  `LancamentoBancario.valor` (`conciliado: true`, `contaBancaria: {
  ativo: true }`, `data` dentro do mês) agrupado por categoria, com o
  fallback via `baixa.parcela.titulo.categoriaFinanceiraId` descrito
  acima quando `categoriaFinanceiraId` for nulo mas `baixaId` existir.
- `buscarProjetadoPorCategoria(filialId, ano, mes)` — soma
  `Parcela.valorAtualizado` menos baixas aprovadas (mesma lógica de
  `saldoRemanescenteParcela`, Fase 4b), filtrado por status em aberto
  (`EM_ABERTO`/`A_VENCER`/`VENCIDO`/`PARCIALMENTE_PAGO`) e
  `dataVencimento` dentro do mês, agrupado por `Titulo.categoriaFinanceiraId`.
- `listarComparativoOrcamento(sessao, ano)` — `requirePermission(sessao.perfil,
  "orcamento:ler")`; junta as 3 fontes (orçado, realizado, projetado) por
  categoria×mês, calcula variação e `alerta`, devolve
  `LinhaComparativoOrcamento[]`.

## Alerta de estouro

Só para categorias `DESPESA` — ultrapassar o orçado numa categoria
`RECEITA` é uma notícia boa, não um estouro. Dispara quando
`realizado + projetado > orcado` (decisão confirmada: soma o que já foi
gasto com o que já está em aberto pra pagar, não só o já gasto) — alerta
antecipado, avisa antes do mês fechar, não só constata depois.

## Permissões

**2 ações novas**, mesmo padrão de `titulo:ler`/`:escrever`: `orcamento:ler`
(todos os 6 perfis) e `orcamento:escrever` (ADMINISTRADOR + FINANCEIRO —
mesmo grupo que já cadastra títulos e categorias). Diferente da Fase 4c:
aqui `requireAlteracaoFilial` **se aplica normalmente** — este recurso é
por filial, segue o padrão usado por título/lançamento/conciliação, não
a exceção do estratégico.

## UI e rotas

Nova seção de navegação **"Controladoria"** (a Fase 5 se chama
"Controladoria e orçamento" — merece sua própria seção em vez de afundar
dentro de "Financeiro", e abre espaço pro sub-projeto 2 e a Fase 6 mais
adiante) → `/controladoria/orcamento`.

- Seletor de ano.
- **Grade de edição**: linhas = categorias financeiras (ativas) da
  filial, colunas = 12 meses do ano selecionado, células = valor orçado
  (editável só para quem tem `orcamento:escrever`; somente leitura pros
  demais perfis, mesmo padrão de somente-leitura já usado no Fluxo de
  Caixa Estratégico).
- **Comparativo**: mesma grade categoria×mês, mas mostrando
  orçado/realizado/projetado/variação; categorias `DESPESA` com
  `alerta: true` recebem destaque visual (mesmo padrão de badge +
  destructive já usado nos sub-projetos da Fase 4).

## Testes

`src/server/services/orcamento.test.ts`:

- Integração (Postgres real, fixture `financeiroTestFixtures.ts`):
  `salvarValorOrcamento` faz upsert corretamente (cria na primeira
  chamada, atualiza na segunda, sem duplicar); recusa perfil sem
  `orcamento:escrever` (ex.: TESOURARIA); `buscarRealizadoPorCategoria`
  soma lançamentos com categoria direta E lançamentos gerados por baixa
  sem categoria direta (fallback via `baixa.parcela.titulo`) — teste
  explícito pro fallback, é a pegadinha real deste sub-projeto;
  `buscarProjetadoPorCategoria` só considera parcelas em aberto, mesmos
  status do Fase 4b; `listarComparativoOrcamento` calcula variação
  percentual como `null` quando orçado é zero (não lança/não retorna
  `Infinity`); alerta dispara só pra categoria `DESPESA` com
  `realizado + projetado > orçado`, nunca para `RECEITA`; escopo de
  filial (orçamento de outra filial não vaza).
- `src/server/services/baixa.test.ts` (arquivo já existente, Fase 2b):
  novo teste — `aprovarBaixa` copia `categoriaFinanceiraId` do título pro
  `LancamentoBancario` criado.

## Depende de

- Fase 1 (`CategoriaFinanceira`).
- Fase 2 (`Titulo`/`Parcela` como fonte do projetado).
- Fase 3 (`LancamentoBancario` conciliado como fonte do realizado).

## Alimenta

- Fase 5, sub-projeto 2 ("Comparativos por dimensão" — usa o orçamento
  cadastrado aqui como coluna "orçada").
- Fase 6 (relatórios de orçado x realizado, dashboards).

## Fora de escopo (explicitamente adiado)

- Orçamento por centro de custo, centro de lucro, safra ou projeto —
  fica pro sub-projeto 2 ou uma iteração futura deste sub-projeto.
- Valor orçado anual dividido automaticamente — só mês a mês nesta v1.
- Alerta de meta de receita não atingida (o inverso do estouro de
  despesa) — fora de escopo, "estouro" aqui é só sobre despesa.
- Migration de backfill pra categorizar lançamentos históricos gerados
  por baixa — resolvido via fallback na leitura, não em dado persistido.
- Consolidação por empresa — este sub-projeto é por filial.
