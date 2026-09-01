# Design — Contas a Pagar/Receber (Títulos)

Status: Aprovado. Ainda não implementado — é o primeiro sub-projeto da
Fase 2 (ver `docs/fases/fase-2-financeiro.md`).

## Contexto

A Fase 2 ("Financeiro") cobre três áreas: Contas a Pagar, Contas a Receber
e Bancos/Tesouraria. São grandes demais para uma spec só, e a baixa de um
título deve gerar um lançamento bancário — há acoplamento, mas os modelos
de dados são distintos o suficiente para desenhar em dois sub-projetos
separados, cada um com seu próprio ciclo design → spec → plano:

1. **Títulos (Pagar + Receber)** — este documento.
2. **Tesouraria** (lançamentos bancários, saldo contábil vs bancário vs
   disponível) — sub-projeto seguinte, spec própria, ainda não iniciada. A
   `Baixa` deste design referencia `contaBancariaId` mas não cria nenhum
   lançamento ainda — é o gancho que o sub-projeto 2 vai consumir.

Contas a Pagar e Contas a Receber são estruturalmente idênticas (título,
parcela, datas, valores, status) — só mudam a contraparte (fornecedor vs
cliente) e o sentido do caixa. Por isso são um único sub-projeto e um único
modelo de dados, não dois espelhados.

Decisão de escopo: o MVP deste sub-projeto cobre **todo** o escopo original
da Fase 2 para Pagar/Receber em `docs/fases/fase-2-financeiro.md`,
incluindo importação em lote, anexos e aprovação de pagamento — nada foi
cortado para uma iteração futura.

## Modelo de dados

```prisma
enum TipoTitulo { PAGAR RECEBER }

enum StatusParcela {
  EM_ABERTO
  A_VENCER
  VENCIDO
  PARCIALMENTE_PAGO
  PAGO
  CANCELADO
  RENEGOCIADO
}

enum StatusAprovacaoBaixa { PENDENTE APROVADO REJEITADO }

model Titulo {
  id                    String     @id @default(uuid())
  filialId              String
  tipo                  TipoTitulo
  fornecedorId          String?
  clienteId             String?
  documento             String
  dataEmissao           DateTime
  dataCompetencia       DateTime
  categoriaFinanceiraId String
  centroCustoId         String?
  centroLucroId         String?
  safraId               String?
  projetoId             String?
  contaBancariaId       String?
  formaPagamento        String?
  ativo                 Boolean    @default(true)
  criadoEm              DateTime   @default(now())
  atualizadoEm          DateTime   @updatedAt

  filial              Filial               @relation(fields: [filialId], references: [id], onDelete: Cascade)
  fornecedor          Fornecedor?          @relation(fields: [fornecedorId], references: [id])
  cliente             Cliente?             @relation(fields: [clienteId], references: [id])
  categoriaFinanceira CategoriaFinanceira  @relation(fields: [categoriaFinanceiraId], references: [id])
  centroCusto         CentroCusto?         @relation(fields: [centroCustoId], references: [id])
  centroLucro         CentroLucro?         @relation(fields: [centroLucroId], references: [id])
  safra               Safra?               @relation(fields: [safraId], references: [id])
  projeto             Projeto?             @relation(fields: [projetoId], references: [id])
  contaBancaria       ContaBancaria?       @relation(fields: [contaBancariaId], references: [id])

  parcelas Parcela[]
  anexos   Anexo[]

  @@index([filialId])
  @@index([fornecedorId])
  @@index([clienteId])
  @@map("titulos")
}

model Parcela {
  id              String        @id @default(uuid())
  tituloId        String
  numero          Int
  dataVencimento  DateTime
  valorOriginal   Decimal       @db.Decimal(18, 2)
  valorAtualizado Decimal       @db.Decimal(18, 2)
  status          StatusParcela @default(EM_ABERTO)
  parcelaOrigemId String?
  criadoEm        DateTime      @default(now())
  atualizadoEm    DateTime      @updatedAt

  titulo        Titulo    @relation(fields: [tituloId], references: [id], onDelete: Cascade)
  parcelaOrigem Parcela?  @relation("RenegociacaoParcela", fields: [parcelaOrigemId], references: [id])
  renegociacoes Parcela[] @relation("RenegociacaoParcela")
  baixas        Baixa[]

  @@unique([tituloId, numero])
  @@index([tituloId])
  @@index([status])
  @@map("parcelas")
}

model Baixa {
  id              String               @id @default(uuid())
  parcelaId       String
  data            DateTime
  valorPago       Decimal              @db.Decimal(18, 2)
  valorJuros      Decimal              @default(0) @db.Decimal(18, 2)
  valorMulta      Decimal              @default(0) @db.Decimal(18, 2)
  valorDesconto   Decimal              @default(0) @db.Decimal(18, 2)
  contaBancariaId String
  usuarioId       String
  statusAprovacao StatusAprovacaoBaixa @default(PENDENTE)
  avaliadoPorId   String?
  avaliadoEm      DateTime?
  motivoRejeicao  String?
  criadoEm        DateTime             @default(now())

  parcela       Parcela       @relation(fields: [parcelaId], references: [id], onDelete: Cascade)
  contaBancaria ContaBancaria @relation(fields: [contaBancariaId], references: [id])
  usuario       Usuario       @relation(fields: [usuarioId], references: [id])

  @@index([parcelaId])
  @@map("baixas")
}

model Anexo {
  id           String   @id @default(uuid())
  tituloId     String
  url          String
  nomeArquivo  String
  tamanhoBytes Int
  usuarioId    String
  criadoEm     DateTime @default(now())

  titulo  Titulo  @relation(fields: [tituloId], references: [id], onDelete: Cascade)
  usuario Usuario @relation(fields: [usuarioId], references: [id])

  @@index([tituloId])
  @@map("anexos")
}
```

Pontos de design:

- `Titulo` é `filialId`-scoped (não `empresaId`) — vencimento, categoria e
  centro de custo são operações de uma filial específica, mesmo que
  `fornecedorId`/`clienteId` referenciem cadastros compartilhados por
  empresa (padrão já estabelecido no retrofit de filial da Fase 1: entidade
  empresa-scoped referenciada por entidade filial-scoped).
- `fornecedorId` é obrigatório (validação de aplicação, não constraint de
  banco) quando `tipo = PAGAR`; `clienteId`, quando `tipo = RECEBER`. O
  outro campo fica `null`.
- Cabeçalho (`Titulo`) e linha (`Parcela`) são sempre duas tabelas, mesmo
  para título à vista — que vira 1 `Titulo` + 1 `Parcela`, sem caso
  especial nem duplicação de campos de valor/vencimento em dois lugares.
- `saldo` da parcela **não é uma coluna** — é derivado
  (`valorAtualizado - soma(baixas com statusAprovacao = APROVADO).valorPago`),
  calculado nos services e exposto como campo computado para a UI.
- `valorAtualizado` existe separado de `valorOriginal` para suportar edição
  de vencimento/valor antes da baixa sem alterar o valor original
  histórico. Juros/multa/desconto aplicados numa baixa específica ficam
  registrados na própria `Baixa`, não alteram `valorAtualizado`.
- O efeito financeiro (abater saldo, transicionar status) só é aplicado
  quando `Baixa.statusAprovacao = APROVADO` — uma baixa `PENDENTE` não
  reduz o saldo da parcela.
- `Anexo.url` aponta para um blob no Vercel Blob (`@vercel/blob`); o arquivo
  em si não fica no Postgres.

## RBAC

Novas `Acao` em `src/server/auth/permissions.ts`, seguindo o padrão
existente de `cadastro:ler`/`cadastro:escrever`:

- `titulo:ler`
- `titulo:escrever` — criar/editar título, parcelar, alterar vencimento,
  cancelar, renegociar, importar, anexar.
- `titulo:baixar` — registrar uma baixa (fica `PENDENTE` até aprovação).
- `titulo:aprovar` — aprovar ou rejeitar uma baixa pendente.

| Perfil | ler | escrever | baixar | aprovar |
|---|---|---|---|---|
| ADMINISTRADOR | ✓ | ✓ | ✓ | ✓ |
| FINANCEIRO | ✓ | ✓ | ✓ | — |
| TESOURARIA | ✓ | — | ✓ | ✓ |
| GESTOR | ✓ | — | — | — |
| AUDITOR | ✓ | — | — | — |
| CONSULTA | ✓ | — | — | — |

FINANCEIRO cadastra e parcela títulos e pode registrar uma baixa, mas não
aprova a própria baixa — segregação de função. TESOURARIA não cadastra
título (não é dela lançar uma conta a pagar/receber), mas registra e
aprova baixas, incluindo as que ela mesma registrou (não há neste MVP uma
regra de "quem registrou não pode aprovar a própria baixa" — não foi
pedida e adicioná-la é YAGNI). ADMINISTRADOR acumula tudo, como já é
padrão nos outros cadastros.

Isolamento por filial: `titulo:escrever`, `titulo:baixar` e
`titulo:aprovar` passam pelo guard `requireAlteracaoFilial`/
`podeAlterarFilialAtiva` já existente (todas são escrita).

## Regras de negócio

### Status da parcela

Função pura `calcularStatusParcela(parcela, baixasAprovadas, hoje)` em
`src/server/services/parcela.ts`:

- `CANCELADO` e `RENEGOCIADO` são estados terminais setados só por ação
  explícita (`cancelarParcela`/`renegociarParcela`) — o cálculo automático
  nunca os sobrescreve.
- Caso contrário: `saldo = valorAtualizado - soma(baixasAprovadas.valorPago)`.
  - `saldo <= 0` → `PAGO`.
  - `0 < saldo < valorAtualizado` → `PARCIALMENTE_PAGO`.
  - `saldo === valorAtualizado` e `hoje > dataVencimento` → `VENCIDO`.
  - `saldo === valorAtualizado` e `dataVencimento` em até 7 dias → `A_VENCER`.
  - Caso contrário → `EM_ABERTO`.

A coluna `status` é persistida (permite `where: { status }` nas listagens)
e recalculada em toda escrita que afeta a parcela: criação, edição de
vencimento/valor, baixa aprovada/rejeitada, cancelamento, renegociação.
Não há job/cron para a transição por passagem pura do tempo (ex.:
`A_VENCER` → `VENCIDO` sem nenhuma escrita nesse meio-tempo); em vez disso,
`listarParcelas`/`listarTitulos` recalculam em memória para exibição e
persistem via `updateMany` em lote, silenciosamente, as linhas cujo status
calculado divergiu do armazenado, antes de retornar — um `status` no banco
pode ficar defasado por no máximo o intervalo entre duas leituras da tela,
nunca é usado para nada crítico (aprovação/baixa sempre recalculam saldo
a partir de `valorAtualizado` e `baixas`, não do campo `status`).

### Baixa e aprovação

`src/server/services/baixa.ts`:

1. `registrarBaixa(sessao, parcelaId, dados)` — exige `titulo:baixar`; cria
   `Baixa` com `statusAprovacao: PENDENTE`. Não altera `status` da parcela
   (saldo continua cheio).
2. `aprovarBaixa(sessao, baixaId)` — exige `titulo:aprovar`; seta
   `statusAprovacao: APROVADO`, `avaliadoPorId`/`avaliadoEm`; recalcula e
   persiste `status` da parcela.
3. `rejeitarBaixa(sessao, baixaId, motivo)` — exige `titulo:aprovar`; seta
   `statusAprovacao: REJEITADO`, `avaliadoPorId`/`avaliadoEm`,
   `motivoRejeicao: motivo`. Não afeta saldo/status da parcela — o registro
   fica como histórico e uma nova baixa pode ser registrada depois para a
   mesma parcela.

Toda transição passa por `registrarAuditoria` com `entidade: "Baixa"`.

### Renegociação

`src/server/services/renegociacao.ts`:
`renegociarParcela(sessao, parcelaId, novasParcelas[])` roda em uma
`$transaction`: marca a parcela original `RENEGOCIADO` (baixas existentes
preservadas como histórico; o saldo dela deixa de importar para o cálculo
de status, que é terminal), cria uma ou mais novas `Parcela` no mesmo
`Titulo` com `parcelaOrigemId` apontando para a original e `numero`
sequencial continuando a partir do maior `numero` já existente naquele
título.

### Importação em lote (CSV)

`src/server/services/importacaoTitulo.ts`, rota
`/financeiro/titulos/importar` (ação dentro das telas de contas a
pagar/receber, sem entrada própria na navegação):

1. `validarCsv(formData)` — parse do CSV (colunas: contraparte, documento,
   parcela, datas, valor, categoria, centro de custo/lucro, safra, projeto,
   conta bancária) e validação linha a linha com o mesmo schema Zod de
   `criarTitulo`. Retorna `{ linha, dados, erros }[]` para preview na UI.
   **Nenhuma escrita nesta etapa.**
2. `confirmarImportacao(sessao, linhasValidadas)` — grava tudo-ou-nada numa
   `$transaction`, chamando internamente o mesmo `criarTitulo` linha a
   linha (reaproveita validação e regra de negócio em vez de duplicar
   lógica de criação). Se qualquer linha falhar na gravação, a transação
   inteira é revertida.

### Anexos

`adicionarAnexo(sessao, tituloId, arquivo)` — exige `titulo:escrever`; sobe
o arquivo via `put()` do `@vercel/blob`, grava o metadado em `Anexo`.
`removerAnexo(sessao, anexoId)` — apaga o blob e a linha. Sem versionamento
de arquivo (reenviar substitui, não empilha versões).

### Juros, multa e desconto

Lançamento manual no momento da baixa — a `Baixa` grava
`valorJuros`/`valorMulta`/`valorDesconto` usados naquele pagamento
específico. Não há motor de cálculo automático por fórmula/dias de atraso
nesta fase; cada empresa pode ter regra própria de acréscimo (juros
simples, composto, pro-rata) e modelar isso agora seria prematuro sem um
caso concreto.

## UI e rotas

Novo grupo de navegação "Financeiro" (fora de "Cadastros"):

```ts
{ titulo: "Financeiro", itens: [
  { href: "/financeiro/contas-a-pagar", label: "Contas a pagar" },
  { href: "/financeiro/contas-a-receber", label: "Contas a receber" },
  { href: "/financeiro/aprovacoes", label: "Aprovações pendentes", permitido: ["ADMINISTRADOR", "TESOURARIA"] },
]}
```

- `/financeiro/contas-a-pagar` e `/financeiro/contas-a-receber` reaproveitam
  o mesmo componente parametrizado por `tipo: "PAGAR" | "RECEBER"` — mesma
  tabela, mesmo dialog de criar/editar, só muda o filtro de
  `listarTitulos(filialId, { tipo })` e o label da coluna de contraparte
  (fornecedor vs cliente).
- Tabela por título, com expansão de linha mostrando as parcelas. Dialog de
  criar/editar título inclui um sub-formulário de parcelas (array),
  reaproveitando o padrão `useActionState` + `FormState` já usado nos 9
  cadastros da Fase 1.
- A ação de baixa abre um dialog a partir da linha da parcela (não do
  título): valor, data, juros/multa/desconto, conta bancária.
- `/financeiro/aprovacoes` lista `Baixa` com `statusAprovacao: PENDENTE`,
  com ações Aprovar/Rejeitar — só visível a quem tem `titulo:aprovar`,
  seguindo o padrão já implementado de esconder (não apenas desabilitar)
  ações sem permissão.
- Importação de CSV é uma ação dentro das telas de contas a pagar/receber
  ("Importar CSV"), não uma rota própria na navegação.

## Testes

Vitest com Postgres real, sem mock — mesmo padrão de
`categoriaFinanceira.test.ts`:

- `titulo.test.ts` — criar título com parcelas, isolamento por filial,
  `podeAlterarFilial = false` bloqueia escrita.
- `parcela.test.ts` — `calcularStatusParcela` como função pura, cobrindo
  cada status e as bordas de `A_VENCER` (7 dias) e `VENCIDO`.
- `baixa.test.ts` — baixa pendente não afeta saldo; aprovação recalcula
  status; rejeição não afeta saldo; perfil sem `titulo:aprovar` não
  aprova.
- `renegociacao.test.ts` — parcela original vira `RENEGOCIADO`; novas
  parcelas linkadas via `parcelaOrigemId` com numeração sequencial
  correta.
- `importacaoTitulo.test.ts` — linha inválida barra a importação inteira
  (tudo-ou-nada); linhas válidas criam título completo.

## Impacto nos docs de fase

- `docs/fases/fase-2-financeiro.md`: status passa de "Planejada" para "Em
  andamento" quando a implementação começar; seção "Contas a pagar"/"Contas
  a receber" ganha referência a este design.
- `docs/fases/README.md`: linha da Fase 2 atualizada quando a implementação
  começar.

## Fora de escopo

- **Tesouraria/lançamentos bancários reais** (saldo contábil vs bancário vs
  disponível) — sub-projeto 2, spec própria futura. A `Baixa` referencia
  `contaBancariaId` mas não cria nenhuma movimentação de fato.
- Cálculo automático de juros/multa por fórmula (fica manual, ver acima).
- Conciliação bancária — já é Fase 3 separada no roadmap
  (`docs/fases/README.md`).
- Regra de segregação "quem registrou a baixa não pode aprová-la" — não
  modelada neste MVP.
- Multi-moeda por título — `Titulo`/`Parcela` não têm campo de moeda
  próprio; assumem a moeda da `ContaBancaria` vinculada (que já tem
  `moeda`, default `"BRL"`, desde a Fase 1). Título sem `contaBancariaId`
  definida assume a moeda padrão da empresa (`Empresa.moedaPadrao`).
