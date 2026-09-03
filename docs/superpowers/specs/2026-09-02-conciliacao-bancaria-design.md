# Design — Conciliação bancária (Fase 3)

Status: Aprovado. Ainda não implementado.

## Contexto

Fase 2 está completa (2a Títulos + 2b Tesouraria). A Tesouraria deixou o
`LancamentoBancario` como registro de tudo que o sistema já sabe que
aconteceu na conta (manual, baixa aprovada, transferência), e um
`SaldoBancarioInformado` puramente manual pra comparar contra o saldo
contábil calculado. Não existe hoje nenhuma comparação linha a linha
contra o extrato real do banco — é exatamente isso que a Fase 3 cobre.

Decisões de escopo confirmadas com o usuário:

1. **Só OFX no MVP** (não CSV/Excel) — formato padrão dos bancos
   brasileiros, e cada transação já traz um ID único (`FITID`) que serve
   de chave de dedupe sem precisar inventar heurística.
2. **Linha do extrato sem correspondência pode virar lançamento
   direto na tela de conciliação** — fecha o ciclo (ex: tarifa bancária
   nunca lançada) sem sair pra Tesouraria e voltar.
3. **Tolerância de ±3 dias** na data para matching automático.
4. **Só conciliação 1:1 nesta fase** — consolidação/split (N:1) fica de
   fora; a `LinhaExtrato` tem `lancamentoBancarioId` `@unique`, então o
   próprio schema impede um lançamento ser reclamado duas vezes.

## Modelo de dados

Novo enum `StatusLinhaExtrato`:

```prisma
enum StatusLinhaExtrato {
  NAO_CONCILIADO
  SUGESTAO
  CONCILIADO
  DIVERGENCIA_VALOR
  DIVERGENCIA_DATA
  DUPLICADO
}
```

`LancamentoBancario` ganha um campo (migration de alteração, default
`false` pra linhas já existentes — nenhuma foi conciliada ainda):

```prisma
conciliado Boolean @default(false)
```

Dois models novos:

```prisma
model ExtratoImportado {
  id              String   @id @default(uuid())
  filialId        String
  contaBancariaId String
  nomeArquivo     String
  totalLinhas     Int
  linhasNovas     Int
  linhasIgnoradas Int
  usuarioId       String
  criadoEm        DateTime @default(now())

  filial        Filial         @relation(fields: [filialId], references: [id], onDelete: Cascade)
  contaBancaria ContaBancaria  @relation(fields: [contaBancariaId], references: [id])
  usuario       Usuario        @relation(fields: [usuarioId], references: [id])
  linhas        LinhaExtrato[]

  @@index([filialId])
  @@index([contaBancariaId])
  @@map("extratos_importados")
}

model LinhaExtrato {
  id                    String             @id @default(uuid())
  extratoImportadoId    String
  contaBancariaId       String
  data                  DateTime
  valor                 Decimal            @db.Decimal(18, 2)
  tipo                  TipoLancamento
  historico             String
  identificadorBancario String
  status                StatusLinhaExtrato @default(NAO_CONCILIADO)
  lancamentoBancarioId  String?            @unique
  criadoEm              DateTime           @default(now())

  extratoImportado   ExtratoImportado    @relation(fields: [extratoImportadoId], references: [id], onDelete: Cascade)
  contaBancaria      ContaBancaria       @relation(fields: [contaBancariaId], references: [id])
  lancamentoBancario LancamentoBancario? @relation(fields: [lancamentoBancarioId], references: [id])

  @@unique([contaBancariaId, identificadorBancario])
  @@index([contaBancariaId])
  @@index([status])
  @@map("linhas_extrato")
}
```

`@@unique([contaBancariaId, identificadorBancario])` **é** o mecanismo
de dedupe de importação — reimportar o mesmo arquivo (ou um período
sobreposto) nunca duplica linha; a `identificadorBancario` é o `FITID`
do OFX, único por conta no banco emissor.

`lancamentoBancarioId` `@unique` em `LinhaExtrato` é o que impõe
1:1 no schema — um `LancamentoBancario` só pode estar vinculado a uma
`LinhaExtrato` por vez.

Relações reversas a adicionar: `Filial.extratosImportados`,
`ContaBancaria.extratosImportados` + `ContaBancaria.linhasExtrato`,
`Usuario.extratosImportados`, `LancamentoBancario.linhaExtrato`
(reverso opcional do 1:1 acima).

## Parser de OFX

**Sem biblioteca nova** — nenhuma opção de parser OFX no npm está
ativamente mantida o suficiente pra valer a pena depender dela pra um
formato tão simples. OFX é um bloco de tags tipo `<TAG>valor` (uma por
linha, sem fechamento) dentro de `<STMTTRN>...</STMTTRN>`. Um parser
próprio (`src/server/services/ofxParser.ts`, função pura
`parseOfx(conteudo: string): LinhaOfx[]`) extrai por regex os blocos
`<STMTTRN>` e, de cada um, os campos `TRNTYPE` (CREDIT/DEBIT →
ENTRADA/SAIDA), `DTPOSTED` (`YYYYMMDDHHMMSS` → `Date`), `TRNAMT`
(`-150.00` → `150.00` + sinal já usado pro tipo), `FITID`, `NAME`/`MEMO`
(concatenados como histórico). Função pura, testável sem I/O — mesmo
espírito de `calcularStatusParcela`.

## Motor de matching (classificação por linha)

Função pura `classificarLinhaExtrato(linha, candidatos)` em
`src/server/services/conciliacao.ts` — `candidatos` é a lista de
`LancamentoBancario` da mesma `contaBancariaId` + mesmo `tipo`, dentro
de uma janela ampla de ±30 dias da data da linha (busca única no banco,
classificação em memória):

1. `exatos` = candidatos com `valor` igual e `data` dentro de ±3 dias e
   `conciliado === false`.
   - 1 candidato → **CONCILIADO** (vincula automaticamente).
   - 2+ candidatos → **SUGESTAO** (ambíguo, usuário escolhe).
2. Se `exatos` vazio: `jaConciliados` = mesmo critério de `exatos` mas
   `conciliado === true` → se houver algum, **DUPLICADO** (existe
   lançamento igual, mas já foi reclamado por outra linha — não deixa
   o usuário criar um lançamento novo achando que falta).
3. Se `jaConciliados` também vazio: `divergenciaValor` = candidatos com
   `data` dentro de ±3 dias, `conciliado === false`, `valor` diferente
   → exatamente 1 → **DIVERGENCIA_VALOR**.
4. Senão: `divergenciaData` = candidatos com `valor` igual,
   `conciliado === false`, fora de ±3 dias mas dentro da janela de
   ±30 dias → exatamente 1 → **DIVERGENCIA_DATA**.
5. Qualquer outro caso (nada encontrado, ou múltiplos candidatos de
   divergência) → **NAO_CONCILIADO**.

Retorna `{ status, lancamentoAutoVinculadoId }` — só preenchido quando
`status === "CONCILIADO"` (o único caso em que o algoritmo persiste um
vínculo). Nos demais casos (`SUGESTAO`, `DIVERGENCIA_VALOR`,
`DIVERGENCIA_DATA`, `DUPLICADO`) o(s) candidato(s) **não são
persistidos em lugar nenhum** — `lancamentoBancarioId` em `LinhaExtrato`
é `@unique`, então gravar ali um candidato ainda não confirmado
arriscaria colidir (duas linhas diferentes podem ter, cada uma, um
único candidato divergente que por coincidência é o mesmo lançamento).
A UI busca os candidatos desses casos sob demanda, ao abrir a linha,
via `buscarCandidatosDaLinha` (abaixo) — sempre a query "ao vivo", nunca
um valor congelado no banco.

## Serviços (`src/server/services/conciliacao.ts`)

Todos seguem o padrão já estabelecido: `requirePermission`,
`requireAlteracaoFilial`, validação de filial em toda referência,
`registrarAuditoria` em toda escrita.

- `importarExtratoOfx(sessao, contaBancariaId, arquivo: File)` — exige
  `conciliacao:escrever`; lê `arquivo.text()`, roda `parseOfx`, cria
  `ExtratoImportado` + `linhaExtrato.createMany({ data: [...],
  skipDuplicates: true })` (a constraint única cuida do resto);
  retorna `{ totalLinhas, linhasNovas, linhasIgnoradas }`. Guarda de
  tamanho de arquivo (mesmo padrão de `TAMANHO_MAXIMO_CSV` em
  `importacaoTitulo.ts`).
- `conciliarAutomaticamente(sessao, extratoImportadoId)` — exige
  `conciliacao:escrever`; busca as `LinhaExtrato` `NAO_CONCILIADO`
  desse extrato, roda `classificarLinhaExtrato` pra cada uma, aplica em
  lote dentro de `prisma.$transaction`: CONCILIADO grava
  `lancamentoBancarioId` + marca `LancamentoBancario.conciliado = true`
  + `registrarAuditoria`; os demais status só atualizam a linha (sem
  side-effect em `LancamentoBancario`).
- `listarLinhasExtrato(filialId, contaBancariaId?, status?)` — leitura;
  para linhas `CONCILIADO`, inclui o `LancamentoBancario` vinculado.
- `buscarCandidatosDaLinha(linhaExtratoId)` — leitura; reexecuta a
  mesma busca de candidatos (mesma `contaBancariaId` + `tipo`, janela
  de ±30 dias) usada por `classificarLinhaExtrato`, sem filtrar por
  `conciliado`, e devolve a lista completa pra UI montar o Select de
  "qual lançamento confirmar" em linhas `SUGESTAO`/`DIVERGENCIA_VALOR`/
  `DIVERGENCIA_DATA`/`DUPLICADO`/`NAO_CONCILIADO`. Nunca lê um valor
  persistido — sempre recalcula, porque o conjunto de candidatos pode
  mudar entre a rodada de conciliação automática e o momento em que o
  usuário abre a tela.
- `confirmarConciliacaoManual(sessao, linhaExtratoId,
  lancamentoBancarioId)` — exige `conciliacao:escrever`; valida que o
  lançamento pertence à mesma `contaBancariaId` da linha e está
  `conciliado: false`; grava o vínculo, marca status CONCILIADO, marca
  `LancamentoBancario.conciliado = true`, tudo em transação;
  `registrarAuditoria` (entidade `"Conciliacao"`, acao `"CONCILIAR"`).
- `desconciliar(sessao, linhaExtratoId)` — exige `conciliacao:escrever`;
  reverte: `lancamentoBancarioId = null`, status volta pra
  `NAO_CONCILIADO`, `LancamentoBancario.conciliado = false`, em
  transação; `registrarAuditoria` (acao `"DESCONCILIAR"`).
- `criarLancamentoDaLinha(sessao, linhaExtratoId, dados: {descricao,
  categoriaFinanceiraId?})` — exige `conciliacao:escrever` **e**
  `lancamento:escrever`; dentro de uma transação, cria um
  `LancamentoBancario` (`origem: "MANUAL"`, `data`/`valor`/`tipo`
  copiados da linha, `conciliado: true`) e já vincula a linha
  (`status: "CONCILIADO"`, `lancamentoBancarioId`); um único
  `registrarAuditoria` cobrindo a criação+conciliação.

## Permissões

Novas ações `conciliacao:ler`/`conciliacao:escrever`, mesmo padrão de
`lancamento:*`: `TESOURARIA` ganha as duas; `FINANCEIRO`, `GESTOR`,
`AUDITOR`, `CONSULTA` ganham só leitura; `ADMINISTRADOR` já tem tudo.
Novo helper `podeEscreverConciliacao(perfil, podeAlterarFilial)`.

## UI e rotas

Nova entrada de nav "Conciliação" → `/financeiro/conciliacao` (sem
`permitido`, todo perfil tem `conciliacao:ler`).

- Botão "Importar extrato (OFX)" por conta bancária → dialog com
  `<input type="file" accept=".ofx">`, passa o `File` direto pra uma
  server action (mesmo padrão de `adicionarAnexoAction`, não
  `arquivo.text()` client-side como o importador de CSV de Títulos,
  porque aqui o parse é 100% server-side). Ao confirmar, a action já
  encadeia `importarExtratoOfx` + `conciliarAutomaticamente` numa
  chamada só — mostra o resumo (novas/ignoradas/conciliadas
  automaticamente) ao final.
- Lista de `LinhaExtrato` da filial, com filtro por status (Select
  simples). Cada linha mostra data/valor/histórico/status (badge) e:
  - **CONCILIADO**: referência ao lançamento vinculado + botão
    "Desconciliar".
  - **SUGESTAO/DIVERGENCIA_VALOR/DIVERGENCIA_DATA**: o(s) lançamento(s)
    candidato(s) (via `buscarCandidatosDaLinha`) lado a lado pra
    comparação, um Select só com os candidatos `conciliado: false` pra
    escolher qual confirmar + botão "Confirmar", e um botão "Criar
    lançamento a partir desta linha" (abre um dialog pequeno só com
    descrição + categoria financeira opcional, já que data/valor/tipo
    vêm da própria linha).
  - **DUPLICADO**: mostra o lançamento já conciliado que bateu
    valor+data, só como contexto (não é uma opção selecionável — tentar
    confirmá-lo falharia, `confirmarConciliacaoManual` exige
    `conciliado: false`). Ação disponível é só "Criar lançamento a
    partir desta linha", pra quando o usuário confirma que é mesmo um
    movimento à parte.
  - **NAO_CONCILIADO**: só o botão "Criar lançamento a partir desta
    linha".

## Testes

- `ofxParser.test.ts`: parsing de uma amostra de OFX extrai
  `FITID`/valor/data/histórico/tipo corretamente; `TRNAMT` negativo vira
  `SAIDA`, positivo vira `ENTRADA`.
- `conciliacao.test.ts` (função pura `classificarLinhaExtrato`, sem
  banco): um caso por branch do algoritmo — exato único → CONCILIADO;
  exato múltiplo → SUGESTAO; só já-conciliado → DUPLICADO; divergência
  de valor único → DIVERGENCIA_VALOR; divergência de data único →
  DIVERGENCIA_DATA; nada → NAO_CONCILIADO.
- `conciliacao.test.ts` (camada de serviço, com banco): reimportar o
  mesmo OFX não duplica linha (dedupe por FITID); confirmar/desconciliar
  atualiza `LancamentoBancario.conciliado` corretamente; não deixa
  vincular um lançamento já `conciliado: true`; `criarLancamentoDaLinha`
  cria e concilia atomicamente; conta de outra filial rejeitada;
  `FINANCEIRO` não consegue escrever (só ler).

## Fora de escopo (explicitamente adiado)

- CSV/Excel de extrato — só OFX nesta fase.
- Conciliação N:1/1:N (consolidação/split) — schema já impede via
  `@unique`, fica pra uma fase futura se necessário.
- Matching por similaridade textual de histórico/nome — o algoritmo
  usa só valor+data+conta+tipo, sem NLP/fuzzy-matching.
- Alertas ou dashboard de "quanto está conciliado" — só a lista de
  linhas com filtro por status.
