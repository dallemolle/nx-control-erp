# Proteções da API v1: paginação, limite de requisições e validade da chave

Data: 2026-11-17 · Status: implementada (2026-11-17)

Item do [backlog](../../backlog.md) ("API REST — robustez"), vindo do fora do
escopo da spec da [API REST v1](2026-09-15-api-rest-automacao-design.md)
(paginação, rate limiting e expiração de chave).

## Problema

- `GET /api/v1/titulos` e `GET /api/v1/lancamentos-bancarios` devolvem a
  lista inteira da filial. Com o uso, a resposta cresce sem limite: fica
  lenta e pode estourar o tempo da função na Vercel.
- Não há limite de requisições por chave. Uma chave vazada ou um agente em
  laço não têm freio.
- As chaves não expiram, só são revogadas à mão.

## Decisões deste desenho

1. **Paginação sempre ligada, com formato novo** (decisão do usuário: nenhum
   cliente usa esses `GET` ainda). A resposta passa a ser
   `{ "itens": [...], "proximoCursor": "<id>" | null }`.
2. **Limite de 60 requisições por minuto por chave**, somando todas as
   rotas (`GET` e `POST`), em janela fixa de 1 minuto. O valor é uma
   constante no código, igual para todas as chaves.
3. **O contador fica na própria linha da chave** (`api_keys`). Toda
   requisição já faz um `UPDATE` nessa linha para gravar `ultimoUsoEm`, e o
   incremento entra nesse mesmo `UPDATE`. O custo extra é zero, nada cresce
   e não precisa de limpeza. Requisições simultâneas da mesma chave ficam em
   fila no lock da linha, então a contagem fica certa. Em memória não
   funcionaria, porque cada instância serverless teria o próprio contador.
   Redis seria um serviço externo a mais para um agente só.
4. **Validade opcional, escolhida numa lista** na criação: Sem validade
   (padrão), 30 dias, 90 dias, 1 ano. As chaves existentes ficam sem
   validade.

## Dados

Migração aditiva em `ApiKey` (`api_keys`):

```prisma
expiraEm            DateTime?
/// Início (truncado no minuto) da janela do limite de requisições.
janelaLimiteEm      DateTime?
requisicoesNaJanela Int       @default(0)
```

## 1. Paginação

**Onde:** `GET /titulos` e `GET /lancamentos-bancarios`.

**Parâmetros:**

- `?limite=`: inteiro de 1 a 500, padrão 100. Valor ausente ou vazio usa o
  padrão. Qualquer outra coisa (não inteiro, 0, acima de 500) devolve `422`
  com `campos: ["limite"]`.
- `?cursor=`: o `proximoCursor` da página anterior. Ausente devolve a
  primeira página. Um cursor que não é um registro daquela filial (no caso
  de títulos, também do mesmo `tipo`) devolve `422` com
  `campos: ["cursor"]`.
- Os filtros existentes (`?tipo=`, `?classificacao=`) continuam iguais. O
  cliente repete os filtros em toda página.

**Ordenação estável:** passa a ter `id` como desempate, para nenhum item
pular ou repetir entre páginas:

- títulos: `[{ criadoEm: "desc" }, { id: "desc" }]`;
- lançamentos: `[{ data: "desc" }, { id: "desc" }]`.

O desempate vale também para as telas, que chamam os mesmos serviços. A
ordem visível não muda, salvo empates.

**Mecânica:** novo módulo `src/server/services/paginacao.ts`:

- `type Paginacao = { limite: number; cursor?: string }`;
- `class CursorInvalidoError extends Error`;
- `montarPagina(linhas, limite)`: recebe `limite + 1` linhas e devolve
  `{ itens: linhas.slice(0, limite), proximoCursor }`. `proximoCursor` é o
  `id` do último item quando sobrou a linha extra, senão `null`.

Funções irmãs, para que cada função tenha um tipo de retorno só:
`listarTitulosPaginado(filialId, tipo, filtros, paginacao)` e
`listarLancamentosPaginado(filialId, opcoes, paginacao)`. Elas reaproveitam
o `where`, o `include` e (nos títulos) o recálculo de status das funções
atuais, extraídos para helpers internos. `listarTitulos`/`listarLancamentos`
(usadas pelas telas) continuam devolvendo o array, sem mudança de contrato.

A versão paginada:

- se houver cursor, confere com `findFirst` que ele pertence à filial (e,
  nos títulos, ao `tipo`), senão lança `CursorInvalidoError`;
- busca com `take: limite + 1`, `cursor: { id }` e `skip: 1`, e devolve
  `montarPagina(...)`;
- nos títulos, recalcula o status das parcelas só sobre a página.

**Rota:** helper `paginacaoDaQuery(url)` em `executarRotaApi.ts`, ao lado de
`classificacaoDaQuery`, que valida `limite` e lê `cursor`.
`executarRotaApi` mapeia `CursorInvalidoError` para
`422 { erro: "Cursor inválido para esta listagem", campos: ["cursor"] }`.

**Fica igual:** as rotas de cadastros de apoio (`/fornecedores`,
`/clientes`, `/categorias-financeiras` etc.) continuam devolvendo array (ver
fora do escopo).

## 2. Limite de requisições

**Onde:** `requireSessaoApi` (`src/server/api/sessaoApi.ts`), no lugar do
`update` de `ultimoUsoEm`, depois das checagens da chave (inválida,
revogada, expirada, usuário inativo) e antes da checagem da filial. Chave
inválida ou expirada não consome limite. Requisição com filial errada
consome, porque a chave é válida.

**Incremento atômico** (`$queryRaw`, relógio do banco para todas as
instâncias concordarem):

```sql
UPDATE api_keys SET
  "ultimoUsoEm" = now() AT TIME ZONE 'UTC',
  "requisicoesNaJanela" = CASE
    WHEN "janelaLimiteEm" = date_trunc('minute', now() AT TIME ZONE 'UTC')
      THEN "requisicoesNaJanela" + 1
    ELSE 1 END,
  "janelaLimiteEm" = date_trunc('minute', now() AT TIME ZONE 'UTC')
WHERE id = $1
RETURNING "requisicoesNaJanela", "janelaLimiteEm", now() AT TIME ZONE 'UTC' AS agora
```

As colunas de `api_keys` são camelCase sem `@map` e `TIMESTAMP(3)` sem fuso,
gravadas pelo Prisma em UTC. Por isso o SQL usa `now() AT TIME ZONE 'UTC'`,
que não depende do fuso da sessão do banco.

- Se `requisicoesNaJanela > 60` (constante
  `LIMITE_REQUISICOES_POR_MINUTO`), lança
  `ErroLimiteRequisicoes(segundosParaLiberar)`, com
  `segundosParaLiberar = ceil(janelaLimiteEm + 60s − agora)`, mínimo 1.
- Requisições bloqueadas continuam incrementando o contador. Não tem efeito
  prático numa janela fixa, porque o contador volta para 1 na virada.
- `executarRotaApi` responde
  `429 { erro: "Limite de 60 requisições por minuto atingido. Tente de novo em N s." }`
  com o header `Retry-After: N`.
- O `429` acontece antes do handler e da idempotência. Um `POST` bloqueado
  não grava nada, nem reserva a `Idempotency-Key`.

## 3. Validade da chave

**Serviço** (`apiKey.ts`):

- `gerarChave(sessao, usuarioId, nome, validadeDias: 30 | 90 | 365 | null)`
  grava `expiraEm = agora + validadeDias × 24 h` (ou `null`).
- `listarChaves` passa a selecionar `expiraEm`.

**Autenticação:** em `requireSessaoApi`, depois de "revogada":
`expiraEm !== null && expiraEm <= agora` lança
`ApiAuthError(401, "Chave de API expirada")`.

**Action** (`usuarios/actions.ts`, `gerarChaveAction`): lê o campo
`validade` (`""` → `null`, `"30"`, `"90"`, `"365"`). Qualquer outro valor
devolve "Validade inválida".

**Tela** (`chaves-api-dialog.tsx`):

- No formulário "Nova chave", um select **Validade** com Sem validade
  (padrão), 30 dias, 90 dias e 1 ano.
- Na lista, cada chave mostra "Expira em dd/mm/aaaa" ou "Sem validade". Se
  já passou, mostra "Expirada" (como hoje mostra "Revogada").
- O botão **Revogar** some também para chave expirada, porque ela não
  funciona mais.

## Testes

- **`paginacao.ts`:** `montarPagina` com menos, exatamente e mais que
  `limite` linhas.
- **Serviços:** `listarTitulosPaginado`/`listarLancamentosPaginado`
  percorrem tudo sem repetir nem pular, inclusive com empate de
  `criadoEm`/`data`. Cursor de outra filial ou de outro `tipo` lança
  `CursorInvalidoError`. `listarTitulos`/`listarLancamentos` continuam
  devolvendo o array.
- **Rotas** (`titulos/route.test.ts`, `lancamentos-bancarios/route.test.ts`):
  formato `{ itens, proximoCursor }`, segunda página pelo cursor,
  `proximoCursor: null` no fim, `422` para `limite` (0, 501, `abc`) e para
  cursor inválido.
- **`sessaoApi`:** a 60ª requisição na janela passa e a 61ª dá
  `ErroLimiteRequisicoes` com segundos entre 1 e 60. A janela anterior
  (manipulando `janelaLimiteEm` no banco) zera o contador. Chave expirada dá
  `401 "Chave de API expirada"`, e chave com `expiraEm` futuro passa.
- **`executarRotaApi`:** `ErroLimiteRequisicoes` vira `429` com
  `Retry-After`, e `CursorInvalidoError` vira `422`.
- **`apiKey`:** `gerarChave` com `validadeDias` grava `expiraEm` correto, e
  com `null` deixa vazio.

## Docs

- `docs/api-v1.md`:
  - tabela de autenticação ganha "Chave expirada → 401";
  - tabela de erros ganha "Limite de requisições → 429 (com
    `Retry-After`)";
  - nova seção "Limite de requisições";
  - `GET /titulos` e `GET /lancamentos-bancarios` descrevem `limite`,
    `cursor` e o formato da resposta, com um exemplo de laço por páginas;
  - o passo 1 ("Gerar uma chave") cita a validade.
- `docs/backlog.md`: remover a seção "API REST — robustez".
- Spec da API v1: marcar paginação, rate limiting e expiração de chave do
  fora do escopo como **feito (esta spec)**.
- Ajuda das telas: não fala de chaves de API hoje, então nada a mudar.

## Fora do escopo

- Paginação nas rotas de cadastros de apoio — **descartado:** são tabelas
  pequenas (uma linha por fornecedor, categoria, conta…) e o agente usa a
  lista inteira para conferir nomes e códigos.
- Limite configurável por chave — **descartado:** hoje há um agente só; a
  constante muda num commit se precisar.
- Limite por IP ou antes da autenticação — **descartado:** a chave tem
  256 bits, então adivinhar por força bruta é inviável, e a Vercel já
  protege a borda.
- Aviso de chave perto de expirar e renovar a validade de uma chave
  existente — **descartado:** a lista mostra a validade; para trocar,
  gera-se uma chave nova e revoga-se a antiga.
- Filtros extras nos `GET` (período, status) — **descartado:** sem pedido.
- Expiração das chaves de idempotência — continua no item de idempotência
  do backlog, que não é deste trabalho.
