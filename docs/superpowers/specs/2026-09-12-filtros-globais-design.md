# Filtros globais combináveis — Fase 6, sub-projeto 6c

## Contexto

Fase 6 (Gestão) tem 4 peças distintas: Dashboard executivo (6a, já
implementado e mesclado em `staging`), Relatórios exportáveis (6b, já
implementado e mesclado), Filtros globais e Auditoria/aprovações. Este
documento desenha o terceiro: **Filtros globais combináveis**.

Escopo em prosa original: `docs/fases/fase-6-gestao.md`, seção "Filtros
globais" — empresa, filial, período, banco, conta bancária, centro de
custo, centro de lucro, safra, projeto, categoria, fornecedor, cliente,
status, tipo de movimento, combináveis simultaneamente em todas as telas
e relatórios relevantes; empresa sem filial selecionada consolida todas
as filiais do usuário naquela empresa.

### Por que decompor

O escopo cobre 13 dimensões × praticamente todas as telas financeiras do
sistema — grande demais para um único sub-projeto. Este documento desenha
o **mecanismo de filtros combináveis** (reaproveitável por qualquer tela
futura) e o aplica a uma tela de referência: **Contas a
pagar/receber**, hoje a única tela financeira sem nenhum filtro de UI.
Estender o mecanismo para as demais telas é wiring repetitivo — trabalho
futuro, não deste documento.

### Decisões já confirmadas com o usuário

1. **"Empresa sem filial selecionada consolida todas as filiais" fica
   fora do v1.** Essa troca exige tornar `SessaoAtiva.filialId` opcional
   — uma mudança no modelo de sessão/autenticação, não uma mudança de
   tela. Fica registrada no backlog como sub-projeto futuro.
2. **Tela de referência: Contas a pagar/receber** (`financeiro/
   contas-a-pagar` e `financeiro/contas-a-receber`) — hoje sem nenhum
   filtro (`listarTitulos` só aceita filial + tipo).
3. **8 dimensões no v1**, todas campo direto de `Titulo`/`Parcela`:
   categoria, contraparte (fornecedor ou cliente, conforme o tipo),
   centro de custo, centro de lucro, safra, projeto, status, período de
   vencimento. **Banco e conta bancária ficam fora do v1** (exigem um
   hop extra via `contaBancaria.bancoId`) — registrados no backlog.
   Empresa e filial não entram como filtro de UI porque já são o escopo
   fixo da sessão atual.
4. **Um valor por dimensão** (não multi-select) — mesmo padrão já usado em
   `conciliacao/filtro-status.tsx` e `fluxo-por-dimensao` (sentinela
   "todos" quando vazio). Múltiplos valores simultâneos por dimensão fica
   no backlog.
5. **Mecanismo: query string, um param por dimensão**, Server Component
   lê e valida, widget client reescreve a URL — extensão direta do padrão
   já estabelecido em `fluxo-por-dimensao` (3 filtros combináveis hoje) e
   `financeiro/fluxo-de-caixa` (período via `seletor-periodo.tsx`). Sem
   Context/Provider novo, sem serialização em um único param.
6. **O export (CSV/Excel) de contas a pagar/receber passa a respeitar os
   mesmos filtros da tela** — `ExportarLinks` propaga a `queryString`
   atual (mesmo mecanismo já usado pelo fluxo de caixa no sub-projeto
   6b), e a rota de export lê os mesmos params e monta o mesmo filtro.

## Seção 1 — Arquitetura do mecanismo de filtro

### O problema de fundo: filtro de título vs. filtro de parcela

A tabela de contas a pagar/receber lista por **título** — cada linha é um
título, com suas parcelas aninhadas embaixo (`titulo-table.tsx`). Das 8
dimensões do v1, 6 são campo direto de `Titulo` (categoria, contraparte,
centro de custo, centro de lucro, safra, projeto) — sem ambiguidade,
entram direto no `where` do Prisma. As outras 2 — **status** e
**período de vencimento** — são campo de `Parcela`, não de `Titulo`.

Além disso, `listarTitulos` já recalcula o status de cada parcela em
memória (`calcularStatusParcela`, a partir de vencimento + baixas
aprovadas) antes de persistir qualquer divergência com o valor gravado no
banco (`titulo.ts:107-130`) — filtrar direto na coluna `status` do banco
arriscaria usar um valor momentaneamente desatualizado (ex.: uma parcela
que venceu hoje mas ainda não foi recalculada).

**Decisão de semântica**: os filtros de parcela (status, período) são
aplicados **em memória, depois do recálculo que já existe**, com
semântica de existência — um título aparece na lista se **ao menos uma
parcela sua** casa com status **e** período de vencimento
simultaneamente (a mesma parcela precisa bater os dois, não uma parcela
pro status e outra pro período). As demais parcelas do título que aparece
continuam **todas** visíveis — o filtro decide quais títulos entram na
lista, não corta parcelas de dentro de um título já incluído. Isso mantém
a tabela exatamente como está hoje (um título com todas as suas
parcelas), só muda quais títulos aparecem.

### Tipos e assinatura do serviço

`src/server/services/titulo.ts` ganha:

```ts
export type FiltroTitulos = {
  categoriaId?: string;
  contraparteId?: string; // fornecedorId (tipo PAGAR) ou clienteId (tipo RECEBER)
  centroCustoId?: string;
  centroLucroId?: string;
  safraId?: string;
  projetoId?: string;
  status?: StatusParcela;
  vencimentoDe?: Date;
  vencimentoAte?: Date;
};
```

`listarTitulos` ganha um 3º parâmetro opcional:

```ts
export async function listarTitulos(
  filialId: string,
  tipo: TipoTitulo,
  filtros?: FiltroTitulos,
): Promise<TituloComParcelas[]>
```

- Os filtros de título (`categoriaId`, `contraparteId` mapeado para
  `fornecedorId`/`clienteId` conforme `tipo`, `centroCustoId`,
  `centroLucroId`, `safraId`, `projetoId`) entram direto no `where` do
  `prisma.titulo.findMany` — cada campo só é incluído no `where` se
  estiver definido (spread condicional, sem gerar `undefined` explícito
  no filtro do Prisma).
- Os filtros de parcela (`status`, `vencimentoDe`/`vencimentoAte`) são
  aplicados como uma etapa de filtro em memória, logo após o loop de
  recálculo de status que já existe — um título só entra no array de
  retorno se `titulo.parcelas.some(p => bateStatus(p) && bateVencimento(p))`
  (com `bateStatus`/`bateVencimento` sempre `true` quando o filtro
  correspondente não foi passado). `vencimentoDe`/`vencimentoAte` são
  independentes um do outro (só um dos dois pode estar presente — vira um
  intervalo aberto de um lado) e ambos inclusivos (`dataVencimento >=
  vencimentoDe` e `<= vencimentoAte`).
- Chamadas existentes de `listarTitulos(filialId, tipo)` (sem 3º
  argumento) continuam funcionando sem alteração — parâmetro opcional,
  sem breaking change.

### Componente de filtro

`src/app/(dashboard)/financeiro/_titulos/barra-de-filtros.tsx` (novo,
client component) — um `<Select>` por dimensão (categoria, contraparte,
centro de custo, centro de lucro, safra, projeto, status) + 2
`<Input type="date">` (vencimento de/até) + botão "Limpar filtros".
Recebe as listas de opções via props (as mesmas já buscadas em `page.tsx`
para o formulário de criação — nenhuma query nova) e o rótulo do filtro de
contraparte ("Fornecedor" ou "Cliente") como prop, já que o param na URL
é sempre `contraparte` independente do tipo.

Ao mudar qualquer campo, o componente monta o `URLSearchParams` completo
(todos os filtros atuais + o que mudou) e faz um único `router.push` —
evita que múltiplos `<Select>` disparando navegação em sequência se
pisem (mesma preocupação já resolvida em `fluxo-por-dimensao`, onde os 2
seletores escrevem na mesma URL sem conflito porque cada um só edita seu
próprio param preservando os demais).

Sentinela `"todos"` representa "sem filtro" nessa dimensão (mesmo padrão
de `conciliacao/filtro-status.tsx`) — ausência do param na URL e
`"todos"` são equivalentes.

### Query params

`?categoria=&contraparte=&centroCusto=&centroLucro=&safra=&projeto=&status=&vencimentoDe=&vencimentoAte=`

Todos opcionais e combináveis livremente. Datas em formato `YYYY-MM-DD`
(mesmo formato já usado por `dataValida`/`data-valida.ts` no fluxo de
caixa).

## Seção 2 — UI e wiring

- `financeiro/contas-a-pagar/page.tsx` e `financeiro/contas-a-receber/
  page.tsx`: leem os 8 params de `searchParams`, validam (reaproveitando
  o padrão de validação leve já usado nas outras telas — um param
  inválido ou desconhecido é tratado como ausente, nunca lança erro),
  montam `FiltroTitulos`, passam pro `listarTitulos`. `<BarraDeFiltros>`
  entra entre o cabeçalho da página e `<ContasClientePanel>`, recebendo
  as mesmas listas de opções (`opcoes.categorias`, `opcoes.contrapartes`
  etc.) já buscadas para o formulário de criação.
- O `<Select>` de contraparte mostra "Fornecedor"/"Cliente" conforme a
  página, mas o param na URL é sempre `contraparte` nas duas — mantém a
  rota de export compartilhável entre os dois tipos sem branch extra.
- `ExportarLinks` ganha a prop `queryString` nas duas páginas, repassando
  `new URLSearchParams(await searchParams).toString()` (mesmo padrão já
  usado em `fluxo-de-caixa/page.tsx` para propagar `granularidade`/
  `data` ao export) — o link de export passa a levar os filtros atuais
  da tela.
- `financeiro/contas-a-pagar/export/route.ts` e `.../contas-a-receber/
  export/route.ts`: passam a ler os mesmos 8 params da URL da requisição,
  montar o mesmo `FiltroTitulos`, e chamar
  `listarTitulos(sessao.filialId, tipo, filtros)` em vez de sem filtro.
- Estado vazio: quando o filtro não retorna nenhum título, a tabela
  mostra "Nenhum título encontrado para os filtros selecionados" —
  mensagem distinta do vazio "sem títulos cadastrados" que já existe hoje
  quando não há filtro nenhum ativo.
- `contas-client-panel.tsx` e `titulo-table.tsx` não mudam — continuam só
  recebendo `titulos` já filtrados pelo server, sem saber que existe
  filtro.

## Seção 3 — Testes

**Puros (sem banco)**, em `titulo.test.ts` ou arquivo novo dedicado à
lógica de filtro:
- Filtro de parcela por existência: nenhum filtro (tudo `undefined`)
  inclui todos os títulos; só `status`; só período; status e período
  juntos (a mesma parcela precisa bater os dois — um título com uma
  parcela vencida em agosto e outra em dia em setembro não deve aparecer
  ao filtrar por `status=VENCIDO&vencimentoDe=setembro`); título com
  múltiplas parcelas onde só uma bate ainda aparece (com todas as
  parcelas visíveis, não só a que bateu).

**Integração (Postgres real)**, fixture existente
`financeiroTestFixtures.ts`:
- Cada uma das 6 dimensões de título (categoria, contraparte, centro de
  custo, centro de lucro, safra, projeto) filtra corretamente sozinha.
- Duas dimensões combinadas (ex.: categoria + status) resultam na
  interseção, não na união.
- Filtro que não bate com nada devolve lista vazia (sem erro).
- Escopo de filial não vaza: título de outra filial nunca aparece, mesmo
  quando os valores do filtro combinam com ele.
- Rota de export com filtro: `?formato=csv&status=VENCIDO` no export
  devolve só as linhas de títulos com parcela vencida — mesmo filtro que
  a tela aplicaria.

## Arquivos afetados (resumo)

- `src/server/services/titulo.ts` (editar: novo tipo `FiltroTitulos`,
  novo parâmetro opcional em `listarTitulos`).
- `src/server/services/titulo.test.ts` (editar: novos casos de filtro).
- `src/app/(dashboard)/financeiro/_titulos/barra-de-filtros.tsx` (novo).
- `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`,
  `.../contas-a-receber/page.tsx` (editar: ler params, montar filtro,
  renderizar `<BarraDeFiltros>`, propagar `queryString` pro
  `ExportarLinks`).
- `src/app/(dashboard)/financeiro/contas-a-pagar/export/route.ts`,
  `.../contas-a-receber/export/route.ts` (editar: ler os mesmos params,
  aplicar o mesmo filtro).
- `docs/backlog.md` — registrar: consolidação por empresa (mudança de
  sessão), banco/conta bancária como filtro, multi-select por dimensão,
  extensão do mecanismo para as demais telas (fluxo de caixa, dashboard
  executivo, conciliação etc.) como trabalho futuro sobre o mesmo
  mecanismo.
