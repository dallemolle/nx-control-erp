# Comparação entre safras sem corte de data

Data: 2026-11-19 · Status: implementada (2026-11-19)

Item do [backlog](../../backlog.md) ("Realizado/projetado por safra ignora
lançamentos marcados fora da janela `dataInicio`/`dataFim`", Fase 5,
sub-projeto 2b). Revê uma decisão consciente da
[spec da comparação entre safras](2026-09-11-comparacao-safras-design.md):
a Hortitex lança compras e vendas marcadas com uma safra fora das datas dela
(confirmado pelo usuário em 2026-11-19), então o corte por data deixa o
número da safra errado.

## Problema

`listarComparativoSafras` (`src/server/services/orcamentoSafra.ts`) chama,
para cada safra, `buscarRealizadoPorDimensaoNoPeriodo` e
`buscarProjetadoPorDimensaoNoPeriodo` com `safra.dataInicio`/`safra.dataFim`.
Ficam de fora:

- lançamentos conciliados marcados com a safra (direto ou via o título da
  baixa) e datados antes do início ou depois do fim — um insumo de
  pré-safra, uma venda liquidada depois da colheita;
- parcelas em aberto de títulos da safra que vencem fora do período,
  inclusive as atrasadas.

Não há linha "Não classificado" para reconciliar: o custo ou a receita da
safra simplesmente aparece menor do que é.

## Decisões deste desenho

1. **A marcação manda, a data não.** Realizado = todo lançamento bancário
   conciliado (em conta ativa) marcado com a safra, em qualquer data.
   Projetado = toda parcela em aberto (`EM_ABERTO`, `A_VENCER`, `VENCIDO`,
   `PARCIALMENTE_PAGO`) de título marcado com a safra, em qualquer
   vencimento, com o mesmo saldo remanescente de hoje.
2. **Mesma regra de atribuição:** no realizado, vale a safra do próprio
   lançamento; sem ela, a do título da baixa (`direto ?? viaBaixa`).
3. **Só o total** (decisão do usuário): nenhuma coluna nova de "fora do
   período". O texto da tela e a ajuda dizem que a data não limita.
4. **As datas da safra continuam no cadastro** e na ordem da lista
   (`dataInicio desc`), só deixam de cortar os valores.
5. **Sem mudança** no orçado, no filtro Fiscal/Gerencial (continua filtrando
   realizado e projetado) e no relatório mensal de fluxo por dimensão, que
   segue com corte por mês.

## Serviço

### `fluxoDeCaixaPorDimensao.ts`

- O corpo de `buscarRealizadoPorDimensaoNoPeriodo` vira uma função interna
  `somarRealizadoPorDimensao(filialId, tipoDimensao, filtro, classificacao?)`,
  em que `filtro` é um `Prisma.LancamentoBancarioWhereInput` somado ao
  `where` fixo (`filialId`, `conciliado: true`, conta ativa, classificação).
  Idem para o projetado: `somarProjetadoPorDimensao(filialId, tipoDimensao,
  filtro, classificacao?)`, com `filtro` um `Prisma.ParcelaWhereInput`
  somado ao `where` fixo (título da filial e da classificação, status em
  aberto). A agregação (`direto ?? viaBaixa`, `saldoRemanescenteParcela`,
  `somar`) fica só nelas.
- `buscarRealizadoPorDimensaoNoPeriodo` e `buscarProjetadoPorDimensaoNoPeriodo`
  passam a chamar as internas com `{ data: { gte, lte } }` e
  `{ dataVencimento: { gte, lte } }` — sem mudança de comportamento.
- Novas `buscarRealizadoPorSafras(filialId, safraIds, classificacao?)` e
  `buscarProjetadoPorSafras(filialId, safraIds, classificacao?)`:
  - realizado: filtro `OR: [{ safraId: { in: safraIds } }, { safraId: null,
    baixa: { parcela: { titulo: { safraId: { in: safraIds } } } } }]` — o
    mesmo critério de `direto ?? viaBaixa`, sem trazer lançamentos de outras
    safras;
  - projetado: filtro `{ titulo: { safraId: { in: safraIds } } }`;
  - devolvem o mesmo `Map<string | null, TotaisPorDimensao>`, chaveado por
    `safraId`.
  - Com `safraIds` vazio devolvem um mapa vazio sem consultar o banco.

### `orcamentoSafra.ts`

- `listarComparativoSafras` busca as safras e os orçamentos como hoje e
  depois faz **uma** chamada de cada busca nova para todas as safras (em
  paralelo), em vez de duas por safra. O resto (montagem da linha, saldo
  líquido, orçado 0 quando não há orçamento) não muda.

## Tela e docs

- `comparacao-safras/page.tsx`: o texto passa a dizer que cada safra tem
  orçamento próprio e que realizado e projetado somam tudo o que está
  marcado com a safra, independentemente da data; realizado só com
  movimentações conciliadas, projetado com títulos em aberto.
- Ajuda, seção 4.3 de `content/ajuda/passo-a-passo.md`: a mesma explicação.
- Spec de 2026-09-11: nota no topo apontando para esta spec (a decisão de
  cortar pelo período foi revista em 2026-11-19).
- `docs/fases/fase-5-controladoria.md`: o item das "duas decisões
  conscientes" passa a dizer que a do período foi revista (2026-11-19) e só
  a do sinal do orçado segue no backlog; o item que descreve as funções
  "chamadas com o período próprio de cada safra" é atualizado.
- `docs/backlog.md`: remover o item.

## Testes

- **Integração (`orcamentoSafra.test.ts`)**, numa safra com período fixo:
  - lançamento conciliado marcado com a safra e datado antes do início e
    outro depois do fim entram no realizado;
  - lançamento sem safra própria cuja baixa vem de título da safra, datado
    fora do período, entra no realizado;
  - lançamento marcado com outra safra e lançamento não conciliado não
    entram;
  - parcela em aberto vencendo depois do fim e parcela vencida antes do
    início entram no projetado; parcela paga não entra.
- **Regressão:** os testes atuais de `orcamentoSafra.test.ts`,
  `classificacaoRelatorios.test.ts` (Fiscal + Gerencial = Todos na safra) e
  os do fluxo por dimensão passam sem alteração.

## Fora do escopo

- Coluna "fora do período" na comparação: **descartado** — decisão do
  usuário (só o total).
- Sinal do orçado (≥0) × realizado/projetado (líquido): **segue no
  backlog**, item próprio.
- Alerta de estouro na comparação entre safras: **segue no backlog**, item
  próprio.
