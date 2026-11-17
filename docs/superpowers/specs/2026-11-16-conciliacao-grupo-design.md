# Design — Conciliação em grupo (N:1 / 1:N / N:M)

Status: Aprovado. Ainda não implementado.

## Contexto

A conciliação da Fase 3 (`docs/superpowers/specs/2026-09-02-conciliacao-bancaria-design.md`)
só vincula 1 linha de extrato a 1 lançamento: `LinhaExtrato.lancamentoBancarioId`
é `@unique`. Casos reais que não cabem nisso:

- um PIX que quita duas parcelas (1 linha ↔ 2 lançamentos de baixa);
- duas transferências que pagam uma parcela (2 linhas ↔ 1 lançamento);
- um PIX de R$ 995 para parcelas de R$ 1.000, com R$ 5 de tarifa.

Hoje a única saída é `criarLancamentoDaLinha`, que duplica o valor já lançado
pelas baixas e distorce saldo e realizado. Item do `docs/backlog.md`
("Conciliação N:1 / 1:N").

Decisões confirmadas com o usuário:

1. **Só manual.** O automático (`processarLinhasPendentes`) continua 1:1.
   Busca de combinações (soma de subconjuntos) não entra.
2. **Soma exata, centavo a centavo.** Diferença se resolve lançando a diferença
   (ex.: tarifa) dentro do próprio grupo, não com tolerância.
3. **Modelo de grupo** (não tabela de vínculo com valor por par), com **N:M**
   permitido: qualquer número de linhas e de lançamentos, desde que as somas
   batam.

## Modelo de dados

Model novo:

```prisma
model GrupoConciliacao {
  id              String   @id @default(uuid())
  filialId        String
  contaBancariaId String
  usuarioId       String
  criadoEm        DateTime @default(now())

  filial        Filial               @relation(fields: [filialId], references: [id], onDelete: Cascade)
  contaBancaria ContaBancaria        @relation(fields: [contaBancariaId], references: [id])
  usuario       Usuario              @relation(fields: [usuarioId], references: [id])
  linhas        LinhaExtrato[]
  lancamentos   LancamentoBancario[]

  @@index([filialId])
  @@index([contaBancariaId])
  @@map("grupos_conciliacao")
}
```

- `LinhaExtrato`: remove `lancamentoBancarioId` (e a relação
  `lancamentoBancario`); adiciona `grupoConciliacaoId String?` +
  relação `grupoConciliacao GrupoConciliacao?` + `@@index([grupoConciliacaoId])`.
- `LancamentoBancario`: remove a relação reversa `linhaExtrato`; adiciona
  `grupoConciliacaoId String?` + relação + `@@index([grupoConciliacaoId])`.
- Relações reversas: `Filial.gruposConciliacao`,
  `ContaBancaria.gruposConciliacao`, `Usuario.gruposConciliacao`.
- `LancamentoBancario.conciliado` **fica** — é lido pelo realizado
  (`fluxoDeCaixa`, `fluxoDeCaixaEstrategico`, `fluxoDeCaixaPorDimensao`,
  `dashboardExecutivo`, `orcamento`, `relatorioFiscalGerencial`) e pela
  exportação da Tesouraria. Invariante: em conta que não é Caixa,
  `conciliado = true` ⇔ `grupoConciliacaoId != null`. Lançamentos de conta
  Caixa continuam nascendo `conciliado = true` sem grupo.

### Regras do grupo

Conferidas no serviço, dentro da transação que cria o grupo:

1. Pelo menos 1 linha e pelo menos 1 lançamento (o lançamento da diferença
   conta).
2. Todas as linhas e lançamentos são da mesma `contaBancariaId`, e a conta é da
   filial ativa.
3. Nenhum item já pertence a um grupo; lançamentos têm `conciliado = false`.
4. Σ linhas = Σ lançamentos, com sinal (ENTRADA positiva, SAIDA negativa),
   comparado em centavos inteiros.

Não há estado parcial: o grupo nasce completo (somas batendo) ou não nasce.
Por isso o realizado nunca vê "meio" 1:N.

### Migration

Uma migration, SQL escrito à mão:

1. Cria `grupos_conciliacao` e as colunas `grupoConciliacaoId` em
   `linhas_extrato` e `lancamentos_bancarios` (FKs + índices).
2. Para cada `linhas_extrato` com `lancamentoBancarioId` não nulo: cria um
   grupo (`filialId` e `contaBancariaId` da conta da linha, `usuarioId` do
   `extratos_importados` que trouxe a linha, `criadoEm` = agora) e preenche
   `grupoConciliacaoId` na linha e no lançamento.
3. Remove `lancamentoBancarioId` (e seu índice único) de `linhas_extrato`.

Os vínculos 1:1 existentes viram grupos 1+1; nada se perde.

## Serviços (`src/server/services/conciliacao.ts`)

### Função pura

Em `src/lib/conciliacaoGrupo.ts` (não no serviço, que importa o prisma), para
ser usada também pelo dialog no cliente:

```ts
export function diferencaDoGrupo(
  linhas: { valor: number; tipo: "ENTRADA" | "SAIDA" }[],
  lancamentos: { valor: number; tipo: "ENTRADA" | "SAIDA" }[],
): number // centavos, com sinal: Σ linhas − Σ lançamentos
```

O serviço converte `Prisma.Decimal` com `Number()` antes de chamar.

`0` = grupo fecha. Positivo = o banco tem mais que o sistema → o lançamento da
diferença é uma ENTRADA de `|diferença|`. Negativo → SAIDA. Conversão para
centavos com arredondamento (`Math.round(valor * 100)`) para não acumular erro
de ponto flutuante.

### Núcleo

`conciliarEmGrupo(sessao, { linhaIds, lancamentoIds, lancamentoDiferenca? })`

- `requirePermission(conciliacao:escrever)`, mais `lancamento:escrever` quando
  há `lancamentoDiferenca`; `requireAlteracaoFilial`.
- `lancamentoDiferenca` (opcional) recebe os mesmos campos de
  `criarLancamentoDaLinha`: `descricao`, `categoriaFinanceiraId`,
  `centroCustoId`, `centroLucroId`, `safraId`, `projetoId`,
  `classificacaoFiscal?`, `tipoComprovante?` — com as mesmas validações
  (`validarDimensoesDaFilial`, `garantirComprovanteValido`). **Valor e tipo
  não vêm do cliente**: o servidor calcula com `diferencaDoGrupo` sobre os
  itens marcados; `data` = a maior data entre as linhas do grupo. Se a
  diferença for 0 e vier `lancamentoDiferenca`, rejeita ("não há diferença a
  lançar").
- Valida as regras do grupo (seção acima). `linhaIds`/`lancamentoIds` sem
  repetição; ids desconhecidos ou de outra filial/conta rejeitam.
- Numa `prisma.$transaction(async (tx) => …)`:
  1. cria o lançamento da diferença (`origem: "MANUAL"`, `conciliado: true`),
     se houver;
  2. cria o `GrupoConciliacao`;
  3. `tx.linhaExtrato.updateMany({ where: { id: { in }, grupoConciliacaoId: null }, data: { grupoConciliacaoId, status: "CONCILIADO" } })`;
  4. `tx.lancamentoBancario.updateMany({ where: { id: { in }, grupoConciliacaoId: null, conciliado: false }, data: { grupoConciliacaoId, conciliado: true } })`;
  5. se alguma contagem afetada for menor que a esperada → lança
     "Algum item foi conciliado por outra pessoa; recarregue a tela"
     (a transação desfaz tudo).
- Auditoria única: entidade `"GrupoConciliacao"`, `entidadeId` = id do grupo,
  ação `"CONCILIAR_GRUPO"`, `novo` = `{ linhaIds, lancamentoIds,
  lancamentoDiferencaId, totalLinhas, totalLancamentos }`.

O vínculo (passos 2–5) fica num helper interno
`vincularEmGrupo(tx, { filialId, contaBancariaId, usuarioId, linhaIds, lancamentoIds })`
reaproveitado pelas funções abaixo.

### Funções existentes

Assinaturas não mudam; todas passam a usar `vincularEmGrupo`:

- `processarLinhasPendentes` (automático): grupo 1+1. Auditoria continua
  `"Conciliacao"`/`"CONCILIAR_AUTOMATICO"`, com `grupoConciliacaoId` no `novo`.
- `confirmarConciliacaoManual(linha, lançamento)`: grupo 1+1. Mensagem
  "Esta linha já está conciliada" passa a olhar `grupoConciliacaoId`.
- `criarLancamentoDaLinha`: cria o lançamento e um grupo 1+1, na mesma
  transação.
- `desconciliar(linhaId)`: **desfaz o grupo inteiro** da linha — todas as
  linhas do grupo voltam a `NAO_CONCILIADO` com `grupoConciliacaoId = null`,
  todos os lançamentos voltam a `conciliado = false` com
  `grupoConciliacaoId = null`, o grupo é apagado. Em transação. Auditoria
  `"Conciliacao"`/`"DESCONCILIAR"` com `anterior` = composição desfeita
  (`linhaIds`, `lancamentoIds`).

O lançamento da diferença e o criado por `criarLancamentoDaLinha` **não** são
apagados ao desconciliar — são lançamentos reais (tarifa etc.), como hoje.

### Leituras

- `listarLinhasExtrato`: `include` troca `lancamentoBancario` por
  `grupoConciliacao: { include: { lancamentos: true, _count: { select: { linhas: true } } } }`.
- `buscarCandidatosParaGrupo(sessao, linhaId)` (nova): valida que a linha é da
  filial ativa e não tem grupo; devolve
  `{ linhaPartida, linhas, lancamentos }`, onde `linhas` são as outras linhas
  sem grupo da mesma conta e `lancamentos` os lançamentos sem grupo e
  `conciliado = false` da mesma conta, **ambos os tipos**, com `data` dentro de
  ±`JANELA_BUSCA_DIAS` da linha de partida, ordenados por data.
- `buscarCandidatosDaLinha` (select 1:1): sem mudança.

### Outros pontos que leem o vínculo

- `pedidoVenda.situacaoParaCancelar`: troca a contagem de `linhaExtrato` por
  `lancamentoBancario.count({ where: { baixaId, grupoConciliacaoId: { not: null } } })`.
  Mensagem igual.
- Exportação (`/financeiro/conciliacao/export`): coluna "Lançamento vinculado"
  junta as descrições dos lançamentos do grupo com `"; "`.
- Fixtures de teste (`financeiroTestFixtures`, `producaoTestFixtures`): apagar
  `grupoConciliacao` da filial antes de linhas e lançamentos.
- API `POST /api/v1/extratos/importar`: sem mudança de contrato.

## Tela (`/financeiro/conciliacao`)

### Linha pendente

(NAO_CONCILIADO, SUGESTAO, DIVERGENCIA_VALOR, DIVERGENCIA_DATA, DUPLICADO)
Mantém o select 1:1 + "Confirmar" e "Criar lançamento a partir desta linha".
Novo botão **"Conciliar em grupo"** abre o dialog abaixo.

### Dialog "Conciliar em grupo"

```
┌ Conciliar em grupo ───────────────────────────────────────┐
│ Linhas do extrato                                         │
│ [x] 12/11  PIX RECEBIDO FULANO              + R$ 995,00   │ ← partida, fixa
│ [ ] 13/11  PIX RECEBIDO FULANO              + R$ 500,00   │
│                                                           │
│ Lançamentos                                               │
│ [x] 12/11  Baixa NF 123 parc. 1/2           + R$ 500,00   │
│ [x] 12/11  Baixa NF 123 parc. 2/2           + R$ 500,00   │
│ [ ] 10/11  Tarifa pacote                    − R$  30,00   │
│                                                           │
│ Linhas: + R$ 995,00   Lançamentos: + R$ 1.000,00          │
│ Diferença: − R$ 5,00                                      │
│ [ ] Lançar a diferença (saída de R$ 5,00)                 │
│     Descrição [__________]  Categoria [▾]  (mais campos…) │
│                                                           │
│                              [Cancelar]  [Conciliar]      │
└───────────────────────────────────────────────────────────┘
```

- Listas carregadas por `buscarCandidatosParaGrupo` ao abrir; valores exibidos
  com sinal.
- Totais e diferença recalculados no cliente a cada marcação (mesma
  `diferencaDoGrupo` de `src/lib/conciliacaoGrupo.ts`); o servidor confere de
  novo.
- "Lançar a diferença" só aparece com diferença ≠ 0. Marcado, mostra os campos
  do dialog "Criar lançamento" (descrição, classificação, categoria,
  dimensões) — extraídos de `criar-lancamento-dialog-form.tsx` para um
  componente comum usado pelos dois dialogs.
- **Conciliar** habilita com ≥ 1 lançamento marcado (ou a diferença marcada) e
  diferença zerada considerando a diferença lançada.
- Erro do servidor aparece no próprio dialog; sucesso fecha e revalida a
  página.

### Linha conciliada

- Grupo 1+1: igual a hoje (descrição do lançamento + "Desconciliar").
- Grupo maior: "Grupo: N linhas · M lançamentos" + descrições dos lançamentos
  em lista curta. "Desconciliar" pede confirmação: "Desfaz o grupo inteiro:
  N linhas e M lançamentos voltam a pendentes."

## Testes

- Unitários (`src/lib/conciliacaoGrupo.test.ts`, sem banco): `diferencaDoGrupo` com
  entradas e saídas misturadas, centavos (`0.1 + 0.2`), grupo vazio de um
  lado.
- Serviço (com banco):
  - N:1, 1:N e N:M fecham, marcam linhas CONCILIADO e lançamentos
    `conciliado = true`.
  - Soma diferente é rejeitada.
  - Lançamento da diferença criado com valor/tipo calculados pelo servidor e
    data da linha mais recente; rejeitado quando a diferença é 0; exige
    `lancamento:escrever`.
  - Rejeita item de outra conta, de outra filial ou já em grupo.
  - `desconciliar` desfaz o grupo inteiro e apaga o grupo.
  - Testes 1:1 atuais (automático, manual, criar a partir da linha,
    desconciliar) continuam passando.
  - `situacaoParaCancelar` bloqueia quando o lançamento da baixa automática
    está num grupo.
  - Perfil sem `conciliacao:escrever` não concilia.
- Migration: vínculo 1:1 preexistente vira grupo 1+1 (conferido aplicando a
  migration num banco com dados de exemplo).
- Conferência no navegador: N:1 com diferença lançada, 1:N, desconciliar
  grupo.

## Documentação

- `content/ajuda/passo-a-passo.md`: seção de conciliação explica "Conciliar em
  grupo" e o lançamento da diferença.
- `docs/fases/fase-3-conciliacao.md`: "Conciliação N:1/1:N" sai do fora de
  escopo, com referência a esta spec.
- `docs/backlog.md`: remove o item "Conciliação N:1 / 1:N"; o item de cartão
  passa a citar a conciliação em grupo como pronta.

## Fora do escopo

- Sugestão automática de grupos (mesmo dia somando o valor da linha, ou soma
  de subconjuntos). — **descartado:** o usuário escolheu só manual; a soma de
  subconjuntos acha combinações por coincidência. Reavaliar se o uso mostrar
  muitos grupos repetitivos.
- Tolerância de valor no grupo. — **descartado:** a diferença vira lançamento,
  que é o registro correto.
- Conciliação parcial ao longo do tempo (lançamento "60% conciliado"). —
  **descartado:** o grupo nasce completo; não há caso no backlog que precise.
- Editar um grupo existente (incluir/tirar item). — **descartado:**
  desconciliar e montar de novo cobre, sem estado intermediário.
