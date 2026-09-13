# Auditoria — filtros e paginação — Fase 6, sub-projeto 6d

## Contexto

Fase 6 (Gestão) tem 4 peças: Dashboard executivo (6a), Relatórios
exportáveis (6b) e Filtros globais (6c) — todos já implementados e
mesclados em `staging`. Este documento desenha o quarto e último:
**Auditoria completa e aprovações**.

Escopo em prosa original: `docs/fases/fase-6-gestao.md`, seção "Auditoria
completa e aprovações" — (1) estender a cobertura de `AuditLog` para todas
as operações das Fases 2-5 (baixa, conciliação/desconciliação, aprovação,
alteração de vencimento); (2) workflow de aprovação de pagamentos
(cadastro → aprovação → programação → pagamento → conciliação).

### Por que o escopo real é bem mais estreito que a prosa sugere

Um levantamento do código antes de desenhar esta spec mudou o quadro:

1. **As 4 operações citadas já geram `AuditLog` hoje.** `registrarBaixa`/
   `aprovarBaixa`/`rejeitarBaixa` (`baixa.ts`), `confirmarConciliacaoManual`/
   `desconciliar`/`criarLancamentoDaLinha` (`conciliacao.ts`) e
   `alterarVencimentoParcela` (`titulo.ts`) já chamam `registrarAuditoria`.
   Não há gap de instrumentação nessas operações.
2. **O único ramo sem auditoria é uma classificação automática, não uma
   ação de usuário.** Dentro de `processarLinhasPendentes`
   (`conciliacao.ts`), o ramo que só marca uma `LinhaExtrato` como
   `SUGESTAO`/`DIVERGENCIA_VALOR`/`DIVERGENCIA_DATA`/`DUPLICADO` (sem
   vincular nenhum `LancamentoBancario`) não audita — e por design, não
   deveria: é conceitualmente igual a `recalcularEPersistirStatusParcela`,
   que o projeto já decidiu explicitamente não auditar por ser derivado,
   não uma ação de usuário. **Não é um gap a corrigir.**
3. **O "workflow de aprovação de pagamentos" de 5 passos não existe, e
   implementá-lo ao pé da letra seria uma mudança de comportamento real**
   (hoje `aprovarBaixa` funde aprovação e pagamento num só passo — o
   `LancamentoBancario` nasce dentro da própria aprovação; "programação"
   não existe em lugar nenhum do schema). Decisão confirmada com o
   usuário: **não tocar nisso agora** — desacoplar aprovação de pagamento
   sem um pedido de negócio explícito é risco desproporcional ao ganho.
4. **O gap real e visível está na tela `/auditoria`**: busca fixa dos 200
   registros mais recentes da empresa, sem nenhum filtro de UI, sem
   paginação — e a página consulta `prisma` diretamente, quebrando a
   convenção do resto do projeto (toda outra tela passa por uma função de
   `src/server/services/`).

Este sub-projeto, portanto, entrega **filtros e paginação para a tela de
auditoria**, corrigindo de passagem a inconsistência de acesso direto ao
Prisma. O workflow de aprovação/pagamento fica fora do escopo,
registrado no backlog.

## Seção 1 — Arquitetura

- **Novo `src/server/services/auditoria.ts`** — a tela `/auditoria`
  deixa de consultar `prisma` direto; passa a chamar:

  ```ts
  export type FiltroAuditoria = {
    entidade?: string;
    acao?: string;
    usuarioId?: string;
    filialId?: string;
    dataDe?: Date;
    dataAte?: Date;
  };

  export async function listarAuditoria(
    sessao: SessaoAtiva,
    filtro: FiltroAuditoria,
    pagina: number,
  ): Promise<{ logs: LogComRelacoes[]; totalPaginas: number }>;
  ```

  `requirePermission(sessao.perfil, "auditoria:ler")` internamente
  (mesma checagem redundante já feita na página, seguindo o padrão do
  resto do projeto). `where` sempre fixa `empresaId: sessao.empresaId`
  (nunca filtra por filial na sessão — a tela já mostra todas as filiais
  da empresa por padrão, e o filtro de filial é opcional, não uma troca
  de escopo de sessão). `TAMANHO_PAGINA = 50`, `skip = (pagina - 1) * 50`.
  `totalPaginas = Math.ceil(total / TAMANHO_PAGINA)`, calculado via
  `Promise.all([prisma.auditLog.findMany(...), prisma.auditLog.count(...)])`
  com o mesmo `where` nos dois.
  `dataDe`/`dataAte` são inclusivos, início-do-dia/fim-do-dia
  respectivamente (`>=`/`<=`) — mesma lição já aprendida no sub-projeto
  de Filtros globais (6c), aplicada desde já aqui.

- **Fonte das opções de cada filtro** — tratamento diferente por
  dimensão, porque `entidade`/`acao` são strings livres (sem enum) e
  `filial`/`usuário` são cadastros reais:
  - `entidade`, `acao`: `prisma.auditLog.findMany({ where: { empresaId }, distinct: ["entidade"], select: { entidade: true }, orderBy: { entidade: "asc" } })` (e o mesmo para `acao`) — reflete exatamente o que já foi gravado, sem lista pra manter manualmente.
  - `usuarioId`: `prisma.auditLog.findMany({ where: { empresaId, usuarioId: { not: null } }, distinct: ["usuarioId"], select: { usuarioId: true } })` para coletar os ids, depois `prisma.usuario.findMany({ where: { id: { in: ids } }, orderBy: { nome: "asc" } })` para os nomes — dois passos, evita a interação entre `distinct` e `orderBy` numa relação.
  - `filialId`: **diferente dos outros 3** — vem do cadastro completo, `prisma.filial.findMany({ where: { empresaId }, orderBy: { nome: "asc" } })`, não de valores distintos já logados. É um cadastro de verdade (FK), não um campo livre — a lista deve mostrar toda filial da empresa, mesmo uma que ainda não gerou nenhum log.

- **Módulo de URL dedicado** — `src/app/(dashboard)/auditoria/filtro-auditoria-url.ts` (não reaproveita `filtro-titulos-url.ts` do sub-projeto 6c — campos completamente diferentes):
  ```ts
  export function filtroAuditoriaDaUrl(get: (campo: string) => string | undefined): FiltroAuditoria;
  export function paginaDaUrl(get: (campo: string) => string | undefined): number; // >= 1, default 1, qualquer valor inválido/não numérico cai em 1
  ```

  (Diferente do módulo equivalente do sub-projeto 6c, não há
  `queryStringDoFiltro` aqui — lá ele existia para propagar os filtros
  pro link de export; esta tela não tem export, então esse export seria
  código morto sem consumidor.)
  Mesmos princípios de robustez do sub-projeto 6c: nenhum valor
  inválido/malformado lança erro, sempre cai no "sem filtro"/"página 1".

## Seção 2 — UI

- `src/app/(dashboard)/auditoria/page.tsx` (reescrita): lê os 7 params da
  URL (`entidade`, `acao`, `usuarioId`, `filialId`, `dataDe`, `dataAte`,
  `pagina`), monta `FiltroAuditoria` + número de página, chama
  `listarAuditoria`. Busca as 4 listas de opções em paralelo
  (`Promise.all`). Renderiza `<BarraDeFiltrosAuditoria>` entre o
  cabeçalho e a tabela, a tabela com a nova coluna **Filial**
  (`log.filial?.nome ?? "—"`, posicionada entre "Usuário" e "Entidade"),
  e `<Paginacao>` abaixo da tabela.
- `src/app/(dashboard)/auditoria/barra-de-filtros.tsx` (novo, client) —
  4 `<Select>` (entidade, ação, usuário, filial, sentinela `SEM_VALOR` =
  "todos"/"todas") + 2 `<Input type="date">` (data de/até). Ao mudar
  qualquer filtro, a URL é reescrita preservando os demais filtros **e
  resetando `pagina` para 1** (evita cair numa página vazia/fora do
  intervalo do novo resultado filtrado). Botão "Limpar filtros" volta
  para a URL sem nenhum param (implicitamente página 1).
- `src/app/(dashboard)/auditoria/paginacao.tsx` (novo, client) —
  "Anterior" / "Página X de Y" / "Próximo", preservando todos os filtros
  atuais da URL, desabilitado nos limites (`pagina <= 1` desabilita
  Anterior; `pagina >= totalPaginas` desabilita Próximo).
- Texto do cabeçalho da página atualizado (deixa de dizer "Últimas 200
  alterações", já que agora há paginação real).

## Seção 3 — Testes

**Puros (sem banco)**, em `filtro-auditoria-url.test.ts`: casos de
robustez de `filtroAuditoriaDaUrl` (sentinela, valor ausente, nunca
lança erro) e de `paginaDaUrl` (ausente → 1, `"0"`/negativo/não-numérico
→ 1, valor válido → o número). Em `barra-de-filtros.test.ts`:
`construirUrlComFiltro` (mesmos 4 casos do sub-projeto 6c, mais o caso
novo: mudar um filtro sempre remove o param `pagina` da URL, mesmo que
já estivesse em `"3"`). Em `paginacao.test.ts`: `construirUrlComPagina`
(página 1 remove o param; página > 1 seta o param; preserva os demais
params da URL).

**Integração (Postgres real)**, em `auditoria.test.ts`, fixture
`financeiroTestFixtures.ts` (mais um segundo usuário/filial dentro da
mesma fixture para exercitar os filtros de usuário/filial — nenhuma
fixture nova):
- `listarAuditoria` filtra por `entidade`, `acao`, `usuarioId`,
  `filialId` e por `dataDe`/`dataAte` (inclusivo, mesmo teste de
  fronteira do sub-projeto 6c), cada um isoladamente.
- Dois filtros combinados = interseção, não união.
- Paginação: criar mais de 50 logs, confirmar que a primeira página tem
  50, a segunda tem o restante, `totalPaginas` bate, e as duas páginas
  não se repetem (nenhum id em comum).
- Escopo por empresa: log de outra empresa nunca aparece, mesmo com um
  filtro que combinaria com ele (mesma lição do sub-projeto 6c, testada
  aqui desde o início).

## Arquivos afetados (resumo)

- `src/server/services/auditoria.ts` (novo).
- `src/server/services/auditoria.test.ts` (novo).
- `src/app/(dashboard)/auditoria/filtro-auditoria-url.ts` (novo).
- `src/app/(dashboard)/auditoria/filtro-auditoria-url.test.ts` (novo).
- `src/app/(dashboard)/auditoria/barra-de-filtros.tsx` (novo).
- `src/app/(dashboard)/auditoria/barra-de-filtros.test.ts` (novo).
- `src/app/(dashboard)/auditoria/paginacao.tsx` (novo).
- `src/app/(dashboard)/auditoria/paginacao.test.ts` (novo).
- `src/app/(dashboard)/auditoria/page.tsx` (reescrita — deixa de
  consultar `prisma` direto).
- `docs/backlog.md` — registrar o workflow de aprovação/pagamento de 5
  passos (desacoplar aprovação de pagamento, adicionar "programação")
  como trabalho futuro, condicionado a um pedido de negócio explícito.
