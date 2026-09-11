# Comparação entre safras — Fase 5, sub-projeto 2b

## Contexto

Fase 5 (Controladoria e orçamento) foi dividida em dois sub-projetos.
Sub-projeto 1 (Orçamento por categoria financeira) e sub-projeto 2a
(Fluxo de caixa por dimensão — centro de custo/lucro/safra) já estão
implementados e mesclados em `staging`. Este documento desenha o
sub-projeto 2b: **comparação entre safras**, cobrindo orçado × realizado
× projetado por safra (atual, anteriores e planejadas).

Escopo em prosa original: `docs/fases/fase-5-controladoria.md`, seção
"Comparativos por dimensão" — "comparação entre safras (atual,
anteriores, orçada, realizada, projetada)".

### Por que não reaproveitar `Orcamento` como está

`Orcamento` (sub-projeto 1) tem `categoriaFinanceiraId` como FK
obrigatória e uma grade mensal (`@@unique([filialId,
categoriaFinanceiraId, ano, mes])`). Orçar por safra não se encaixa
nesse modelo por dois motivos:

1. Tornar `categoriaFinanceiraId` opcional e adicionar `safraId` opcional
   na mesma tabela criaria ambiguidade (qual dimensão vale quando as duas
   estão preenchidas? quando nenhuma está?).
2. Uma safra tem período próprio (`Safra.dataInicio`/`dataFim`), que pode
   atravessar a virada do ano civil (ex.: safra de outubro a maio). Uma
   grade "por mês/ano civil" não corresponde ao ciclo real do negócio.

Por isso, o orçamento por safra é um **valor único por safra** (não
mensal), em uma tabela nova e dedicada.

### Decisões já confirmadas com o usuário

1. Orçamento por safra é um valor único (sem grade mensal).
2. "Safra atual" = toda safra com `status = EM_ANDAMENTO` (pode haver mais
   de uma).
3. Todas as safras `ENCERRADO` aparecem na comparação, sem limite fixo de
   quantidade.
4. Safras `PLANEJADO` também entram na comparação (orçado visível mesmo
   antes de a safra começar; realizado/projetado tendem a ser zero).
5. Sem alerta de estouro nesta versão — não pedido no escopo original
   (diferente do sub-projeto 1). Registrado em `docs/backlog.md` para
   retomada futura.
6. "Realizado" por safra segue a mesma regra já estabelecida em
   `fluxoDeCaixaPorDimensao.ts`: só conta lançamento bancário com
   `conciliado: true` — dinheiro de uma baixa só é "realizado" depois da
   conciliação bancária, não no momento da aprovação.

## Seção 1 — Modelo de dados

Tabela nova e dedicada, `OrcamentoSafra`, com um valor total por safra
(sem mês, sem ano civil — a safra já delimita seu próprio período via
`dataInicio`/`dataFim`):

```prisma
model OrcamentoSafra {
  id           String   @id @default(uuid())
  filialId     String
  safraId      String
  valor        Decimal  @db.Decimal(18, 2)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  filial Filial @relation(fields: [filialId], references: [id], onDelete: Cascade)
  safra  Safra  @relation(fields: [safraId], references: [id])

  @@unique([filialId, safraId])
  @@index([filialId])
  @@map("orcamentos_safra")
}
```

`Filial` e `Safra` ganham a back-relation correspondente
(`orcamentosSafra OrcamentoSafra[]`), seguindo o padrão já usado para
`Orcamento`/`CategoriaFinanceira`. Nova migração Prisma
(`add_orcamento_safra` ou nome equivalente).

## Seção 2 — Serviços

### Refatoração de `fluxoDeCaixaPorDimensao.ts` (extração, sem duplicar query)

Hoje `buscarRealizadoPorDimensao`/`buscarProjetadoPorDimensao` só aceitam
`(filialId, tipoDimensao, ano, mes)` — um mês por vez, via
`inicioDoMes`/`fimDoMes`. A comparação entre safras precisa do total do
**período inteiro da safra** (`dataInicio`→`dataFim`), não mês a mês.

Em vez de escrever uma query nova e paralela (duplicando a lógica de
campo-direto + fallback via baixa), extrai-se o corpo de cada função para
uma versão parametrizada por intervalo de datas; as funções `(ano, mes)`
que já existem — e que o sub-projeto 2a já usa em produção — passam a ser
wrappers finos que calculam `inicioDoMes`/`fimDoMes` e delegam:

```ts
// fluxoDeCaixaPorDimensao.ts — assinaturas novas (extraídas)
export async function buscarRealizadoPorDimensaoNoPeriodo(
  filialId: string,
  tipoDimensao: TipoDimensao,
  inicio: Date,
  fim: Date,
): Promise<Map<string | null, TotaisPorDimensao>>

export async function buscarProjetadoPorDimensaoNoPeriodo(
  filialId: string,
  tipoDimensao: TipoDimensao,
  inicio: Date,
  fim: Date,
): Promise<Map<string | null, TotaisPorDimensao>>

// Assinaturas existentes (mantidas, agora wrappers finos):
export async function buscarRealizadoPorDimensao(filialId, tipoDimensao, ano, mes) {
  return buscarRealizadoPorDimensaoNoPeriodo(filialId, tipoDimensao, inicioDoMes(ano, mes), fimDoMes(ano, mes));
}
export async function buscarProjetadoPorDimensao(filialId, tipoDimensao, ano, mes) {
  return buscarProjetadoPorDimensaoNoPeriodo(filialId, tipoDimensao, inicioDoMes(ano, mes), fimDoMes(ano, mes));
}
```

O corpo de cada `*NoPeriodo` é idêntico ao corpo atual das funções
`(ano, mes)` (mesmo `include`, mesmo direct-field-first + fallback via
baixa em `buscarRealizadoPorDimensaoNoPeriodo`, mesmo sem-fallback em
`buscarProjetadoPorDimensaoNoPeriodo`), só troca o filtro `data`/
`dataVencimento` de `{ gte: inicioDoMes(ano, mes), lte: fimDoMes(ano, mes) }`
para `{ gte: inicio, lte: fim }`. Nenhuma chamada nova e paralela é criada
— é a mesma regra de negócio, com o corte de tempo generalizado. O
comportamento de `/controladoria/fluxo-por-dimensao` (2a) não muda: os
mesmos números, calculados pelo mesmo caminho de código, agora um nível
de indireção adiante.

### Serviço novo — `src/server/services/orcamentoSafra.ts`

Mesma forma de `orcamento.ts` (sub-projeto 1), adaptada para valor único
por safra em vez de grade mensal:

```ts
export type LinhaComparativoSafra = {
  safraId: string;
  safraNome: string;
  status: StatusSafraProjeto;
  orcado: number;
  realizado: number;
  projetado: number;
  variacaoAbsolutaRealizado: number;
  variacaoPercentualRealizado: number | null;
};

export function montarLinhaComparativoSafra(
  safraId: string,
  safraNome: string,
  status: StatusSafraProjeto,
  orcado: number,
  realizado: number,
  projetado: number,
): LinhaComparativoSafra {
  const variacaoAbsolutaRealizado = realizado - orcado;
  const variacaoPercentualRealizado = orcado === 0 ? null : variacaoAbsolutaRealizado / orcado;
  return { safraId, safraNome, status, orcado, realizado, projetado, variacaoAbsolutaRealizado, variacaoPercentualRealizado };
}

export async function salvarValorOrcamentoSafra(
  sessao: SessaoAtiva,
  safraId: string,
  valor: number,
): Promise<void> {
  requirePermission(sessao.perfil, "orcamento:escrever");
  requireAlteracaoFilial(sessao.podeAlterarFilial);

  const safra = await prisma.safra.findFirst({ where: { id: safraId, filialId: sessao.filialId } });
  if (!safra) throw new Error("Safra não pertence à filial ativa");

  const chave = { filialId_safraId: { filialId: sessao.filialId, safraId } };
  const anterior = await prisma.orcamentoSafra.findUnique({ where: chave });

  const orcamentoSafra = await prisma.orcamentoSafra.upsert({
    where: chave,
    create: { filialId: sessao.filialId, safraId, valor },
    update: { valor },
  });

  await registrarAuditoria({
    empresaId: sessao.empresaId,
    filialId: sessao.filialId,
    usuarioId: sessao.usuarioId,
    entidade: "OrcamentoSafra",
    entidadeId: orcamentoSafra.id,
    acao: anterior ? "ATUALIZAR" : "CRIAR",
    anterior: anterior ? { valor: Number(anterior.valor) } : null,
    novo: { valor },
  });
}

export async function listarComparativoSafras(
  sessao: SessaoAtiva,
): Promise<LinhaComparativoSafra[]> {
  requirePermission(sessao.perfil, "orcamento:ler");

  // Todos os status entram (PLANEJADO, EM_ANDAMENTO, ENCERRADO — decisão
  // 3 e 4 acima), sem limite de quantidade. `ativo: true` segue o mesmo
  // convention de `listarValoresDimensao` (2a) — uma safra desativada não
  // aparece como item comparável nesta tela de gestão (diferente do
  // relatório de fluxo por dimensão, que precisa reconciliar com um total
  // já exibido e por isso não pode esconder valores de dimensões
  // inativas; aqui não há esse total compartilhado a reconciliar).
  const safras = await prisma.safra.findMany({
    where: { filialId: sessao.filialId, ativo: true },
    orderBy: { dataInicio: "desc" },
  });

  const orcamentos = await prisma.orcamentoSafra.findMany({ where: { filialId: sessao.filialId } });

  const linhas: LinhaComparativoSafra[] = [];
  for (const safra of safras) {
    const [realizadoPorSafra, projetadoPorSafra] = await Promise.all([
      buscarRealizadoPorDimensaoNoPeriodo(sessao.filialId, "SAFRA", safra.dataInicio, safra.dataFim),
      buscarProjetadoPorDimensaoNoPeriodo(sessao.filialId, "SAFRA", safra.dataInicio, safra.dataFim),
    ]);
    const orcamento = orcamentos.find((o) => o.safraId === safra.id);
    const r = realizadoPorSafra.get(safra.id) ?? { entradas: 0, saidas: 0 };
    const p = projetadoPorSafra.get(safra.id) ?? { entradas: 0, saidas: 0 };

    linhas.push(
      montarLinhaComparativoSafra(
        safra.id,
        safra.nome,
        safra.status,
        orcamento ? Number(orcamento.valor) : 0,
        r.entradas - r.saidas,
        p.entradas - p.saidas,
      ),
    );
  }
  return linhas;
}
```

Notas:
- `realizado`/`projetado` de uma safra são o **saldo líquido** (entradas −
  saídas) do período da safra — não faz sentido de negócio orçar entradas
  e saídas separadamente por safra aqui (diferente do relatório 2a, que
  mostra as duas colunas separadas para leitura de fluxo de caixa).
- Sem `salvarValoresOrcamentoDoAno`-equivalente: como é um único valor por
  safra (não 12 valores), não há necessidade do padrão de persistência
  atômica multi-linha usado em `orcamento.ts`. Uma chamada de
  `salvarValorOrcamentoSafra` por safra editada é suficiente.
- `listarComparativoSafras` faz uma consulta por safra (não em lote) —
  aceitável porque o número de safras por filial é tipicamente pequeno
  (unidades, não centenas); se isso mudar, otimizar fica para uma
  iteração futura.

## Seção 3 — Permissões

Reaproveita as permissões já existentes do sub-projeto 1 — mesmo domínio
de negócio (orçamento), outra dimensão:

- `orcamento:ler` — leitura do comparativo entre safras (todos os 6
  perfis).
- `orcamento:escrever` — gravar o valor orçado de uma safra em
  `OrcamentoSafra` (FINANCEIRO + ADMINISTRADOR).

Nenhuma ação de permissão nova é criada.

## Seção 4 — Alertas

Nenhum alerta nesta versão. O escopo original não pede um, e a tela é
primariamente informativa (comparação lado a lado). Ponto registrado em
`docs/backlog.md` para uma iteração futura, caso se queira destacar
estouro por safra com o mesmo padrão do sub-projeto 1.

## Seção 5 — UI e rotas

Nova rota `/controladoria/comparacao-safras`, mesmo padrão estrutural de
`orcamento/` e `controladoria/fluxo-por-dimensao/`:

- `page.tsx` — server component. `requireSessaoAtiva()` +
  `requirePermission(sessao.perfil, "orcamento:ler")`. Chama
  `listarComparativoSafras(sessao)`. Tabela: Safra | Status | Orçado |
  Realizado | Projetado | Variação (realizado − orçado, com sinal). Sem
  seletor de ano/mês (a lista já cobre todas as safras relevantes de uma
  vez, por design).
- Edição do orçado por safra: um formulário simples por linha (input de
  valor + botão salvar, via Server Action chamando
  `salvarValorOrcamentoSafra`), visível só quando
  `podeEscreverOrcamento(sessao.perfil, sessao.podeAlterarFilial)` for
  `true` — mesmo helper de `permissions.ts` já usado em `orcamento/`. Sem
  grade mensal: um único campo por linha, diferente da tela de Orçamento
  por categoria.
- Nova entrada em `src/app/(dashboard)/nav-items.ts`, em "Controladoria",
  ao lado de "Fluxo de caixa por dimensão":
  ```ts
  { href: "/controladoria/comparacao-safras", label: "Comparação entre safras" }
  ```

## Arquivos afetados (resumo)

- `prisma/schema.prisma` — novo `model OrcamentoSafra` + back-relations em
  `Filial`/`Safra`; nova migração.
- `src/server/services/fluxoDeCaixaPorDimensao.ts` — extrair
  `buscarRealizadoPorDimensaoNoPeriodo`/`buscarProjetadoPorDimensaoNoPeriodo`;
  `buscarRealizadoPorDimensao`/`buscarProjetadoPorDimensao` passam a
  delegar.
- `src/server/services/orcamentoSafra.ts` (novo).
- `src/app/(dashboard)/controladoria/comparacao-safras/page.tsx` (novo) +
  componente(s) de edição inline do orçado.
- `src/app/(dashboard)/nav-items.ts` — nova entrada.
- `docs/backlog.md` — já criado nesta sessão, item de alerta já
  registrado.
