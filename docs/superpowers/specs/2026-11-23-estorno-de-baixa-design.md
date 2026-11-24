# Estorno de baixa aprovada

Data: 2026-11-23 · Status: aprovada para implementação

Item 3 do [backlog](../../backlog.md), seção "Financeiro — lacunas achadas ao
escrever a ajuda contextual" ("Baixa aprovada não pode ser desfeita",
prioridade alta).

## Problema

Não existe estorno de baixa. `efetivarBaixa` (`src/server/services/baixa.ts`)
aprova a baixa, recalcula a parcela e cria o `LancamentoBancario`, e nada
desfaz isso. O lançamento também não pode ser excluído (item 6 do backlog).

Exemplo: a baixa de R$ 1.012,00 foi aprovada na conta errada. A conta certa
nunca recebe a saída, a errada fica com uma saída que o banco não tem, e a
diferença aparece na Tesouraria e na Conciliação sem solução. É dado errado
que o sistema não deixa corrigir.

## Decisões deste desenho

Todas foram escolhas do usuário.

1. **Marcar a baixa e apagar o lançamento.** A baixa ganha o status
   `ESTORNADO`, com motivo, quem e quando, e continua visível no histórico da
   parcela. O lançamento bancário que ela gerou é **apagado**, e a parcela é
   recalculada. Descartados:
   - Contra-lançamento: criaria duas linhas que o banco nunca teve, e elas
     ficariam não conciliadas para sempre. Dinheiro que saiu de verdade e
     voltou se resolve desconciliando e estornando.
   - Apagar a baixa, como faz o Desfazer repasse: a parcela perderia o
     histórico, que ficaria só na Auditoria, e o Financeiro não acessa a
     Auditoria.
2. **Lançamento conciliado bloqueia o estorno.** A pessoa desconcilia antes na
   Conciliação, como já acontece no Desfazer repasse e no cancelamento do
   pedido. Lançamento da conta Caixa nasce com `conciliado: true` mas sem grupo
   de conciliação. Por isso a checagem é pelo `grupoConciliacaoId`, e esse
   lançamento pode ser estornado.
3. **Quem pode: a permissão de aprovar** (`titulo:aprovar`, que é da
   Tesouraria e do Administrador). O motivo é obrigatório e o estorno vai para
   a auditoria.
4. **Segregação igual à da aprovação.** Com `Empresa.exigirAprovacaoPorOutro`
   ligada, quem **registrou** a baixa não pode estorná-la. Sem essa trava,
   alguém poderia registrar, ter a baixa aprovada por outra pessoa e depois
   estornar sozinho para esconder o pagamento.
5. **Baixa de repasse de cartão não é estornada.** Ela é desfeita em Repasses
   de cartão (Desfazer repasse), porque estornar só uma das duas baixas do par
   (bruto e taxa) quebraria o repasse.
6. **Baixa da venda à vista pode ser estornada.** É o caso "venda lançada na
   conta errada": a parcela do título a receber volta a ficar em aberto e a
   pessoa baixa de novo na conta certa. O pedido não muda.
7. **A parcela mostra só as baixas aprovadas e as estornadas.** As pendentes e
   as rejeitadas ficam para os itens 4 e 5 do backlog, que têm decisões
   próprias.

## Dados

Uma migration:

- O enum `StatusAprovacaoBaixa` ganha `ESTORNADO`.
- O model `Baixa` ganha:
  - `estornadoPorId String?`, com a relação `estornadoPor Usuario?
    @relation("BaixaEstornadaPor")`; o `Usuario` ganha o lado inverso;
  - `estornadoEm DateTime?`;
  - `motivoEstorno String?`.

Nenhum dado existente muda.

## Serviço: `estornarBaixa(sessao, baixaId, motivo)`

Fica em `src/server/services/baixa.ts`. Faz, nesta ordem:

1. `requirePermission(sessao.perfil, "titulo:aprovar")` e
   `requireAlteracaoFilial(sessao.podeAlterarFilial)`.
2. Motivo sem espaços nas pontas com pelo menos 3 caracteres; se não tiver:
   "Informe o motivo do estorno".
3. Numa transação, nesta ordem:
   - Lê a baixa da filial ativa, com os lançamentos e os repasses; baixa de
     outra filial não é encontrada.
   - O status tem que ser `APROVADO`; se não for: "Só baixas aprovadas podem
     ser estornadas".
   - Se a baixa é de um repasse (`repasseRecebimento` ou `repasseTaxa` não
     nulo), o estorno é recusado com "Esta baixa é de um repasse de cartão:
     use Desfazer repasse em Repasses de cartão".
   - Se algum lançamento da baixa tem `grupoConciliacaoId`, o estorno é
     recusado com "O lançamento desta baixa já foi conciliado. Desconcilie na
     Conciliação antes de estornar".
   - Segregação: com `exigeAprovacaoPorOutro(sessao.empresaId)` ligada e
     `baixa.usuarioId === sessao.usuarioId`, o estorno é recusado com "Quem
     registrou a baixa não pode estorná-la. Peça a outra pessoa com permissão
     de aprovação." Ela vem depois das outras checagens para que uma baixa de
     repasse ou conciliada mostre o motivo que de fato a impede.
   - Atualiza a baixa só se ela ainda estiver `APROVADO`
     (`updateMany({ where: { id, statusAprovacao: "APROVADO" } })`), com
     `statusAprovacao: "ESTORNADO"`, `estornadoPorId`, `estornadoEm: new
     Date()` e `motivoEstorno`. Se nada for atualizado, outro estorno chegou
     antes: "Esta baixa já foi estornada".
   - Apaga os lançamentos da baixa que continuam fora de conciliação
     (`deleteMany({ where: { baixaId, grupoConciliacaoId: null } })`). Se o
     número apagado for diferente do lido, alguém conciliou no meio: a
     transação é desfeita com a mesma mensagem de "já foi conciliado".
   - `recalcularEPersistirStatusParcela(parcelaId, tx)`.
   - Grava a auditoria: entidade `Baixa`, ação `ESTORNAR` (com o rótulo
     "Estornar" em `src/lib/auditoria/rotulos.ts`). No campo `anterior` vão
     `statusAprovacao: "APROVADO"` e os lançamentos apagados (id, conta, data,
     tipo, valor). No campo `novo` vão `statusAprovacao: "ESTORNADO"` e
     `motivoEstorno`.

### O que muda em outros lugares

- **Relatórios, projeção, dashboard, orçamento e status da parcela:** nada. Os
  que somam baixas filtram por `statusAprovacao: "APROVADO"`, e os que somam
  lançamentos não encontram mais o lançamento apagado.
- **`recepcaoFruto.ts`:** as duas consultas que hoje contam "baixa que não é
  `REJEITADO`" passam a contar `statusAprovacao: { in: ["PENDENTE",
  "APROVADO"] }`. Sem isso, uma baixa estornada travaria a exclusão da
  recepção sem motivo.
- **`situacaoParaCancelar` e `cancelarPedido` (`pedidoVenda.ts`):** nada. A
  contagem de "outras baixas" já é por `PENDENTE` e `APROVADO`. Com a baixa
  automática estornada, o cancelamento apaga a baixa como hoje, e o
  `deleteMany` dos lançamentos não encontra nada.
- **Parcela cancelada ou renegociada:** o estorno é permitido (o lançamento
  errado precisa sair). A parcela continua cancelada ou renegociada, porque
  `calcularStatusParcela` preserva esses dois status.
- **`resumirBaixasDaParcela` (`avisosDaBaixa.ts`):** nada, porque ele só olha
  `APROVADO` e `PENDENTE`.

## Tela: Contas a pagar e Contas a receber

As duas telas usam `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx`.

### Dados

- `listarTitulos` (`src/server/services/titulo.ts`) já carrega as baixas das
  parcelas. O `include` das baixas é ampliado com:
  - `contaBancaria` (com `banco`), para o nome da conta;
  - `usuario`, `avaliadoPor` e `estornadoPor`, com o nome de cada um;
  - os `lancamentos`, só com `grupoConciliacaoId`;
  - `repasseRecebimento` e `repasseTaxa`, só com o `id`.
- `titulosParaCliente` (`_titulos/titulos-para-cliente.ts`) passa a mandar em
  cada parcela a lista `baixas`, só com as `APROVADO` e as `ESTORNADO`, em
  ordem de data. Cada baixa leva:
  - `id`, `data`, `status`, `valorPago`, `valorJuros`, `valorMulta` e
    `valorDesconto` (em `number`);
  - `conta` (texto pronto, com `nomeDaContaBancaria`);
  - `registradaPor` e `aprovadaPor`;
  - `estornadaPor`, `estornadaEm` e `motivoEstorno`;
  - `conciliada` (algum lançamento em grupo de conciliação) e `deRepasse`.

### Sublista de baixas

Embaixo da linha de cada parcela que tem baixa aprovada ou estornada vem uma
linha "Baixas", com uma entrada por baixa:

- data · conta · **valor pago**, e só os ajustes diferentes de zero ("+ juros
  R$ 12,00", "+ multa …", "− desconto …");
- "registrada por Maria · aprovada por João";
- à direita, uma destas três coisas:
  - o botão **Estornar**, para quem tem `podeAprovarBaixa`, em baixa aprovada
    que não está conciliada e não é de repasse;
  - "Conciliada: desconcilie antes de estornar", em baixa conciliada;
  - "Repasse de cartão: desfaça em Repasses de cartão", em baixa de repasse.

  Quem não pode aprovar não vê nenhuma das três.

A baixa estornada aparece com texto esmaecido, o selo "Estornada" e uma linha
a mais: "estornada por João em 23/11/2026 14:05: conta errada" (data e hora
no horário de Brasília, com `formatarDataHora`). Ela não tem ações.

A segregação não esconde o botão. Ela é conferida no servidor, e a mensagem
aparece no diálogo, como na tela de Aprovações pendentes.

### Diálogo de estorno

Fica num arquivo novo, `_titulos/estornar-dialog.tsx`, no padrão de
`baixa-dialog.tsx` e `renegociar-dialog.tsx`. Tem:

- resumo: "Baixa de 15/10/2026 · Conta Banco do Brasil 1234-5 · R$ 1.012,00";
- aviso: "O lançamento sai da conta Banco do Brasil 1234-5 e a parcela volta a
  ficar em aberto. A baixa continua no histórico como estornada.";
- campo **Motivo**, obrigatório;
- botões Cancelar e **Estornar baixa** (variante `destructive`).

A server action `estornarBaixaAction` fica em `_titulos/actions.ts`, no padrão
das outras: chama o serviço, revalida as rotas de Contas a pagar e a receber,
e em caso de erro devolve a mensagem para o diálogo.

## Ajuda

- **Roteiro novo `estornar-baixa`** em `src/ajuda/contas-a-pagar/roteiros.ts`
  e `src/ajuda/contas-a-receber/roteiros.ts`, depois do `pagar-parcela` /
  `receber-parcela`:
  - quando usar: conta errada, valor errado, pagamento que não aconteceu;
  - quem pode: Tesouraria e Administrador, e não quem registrou a baixa se a
    empresa exige aprovação por outra pessoa;
  - passos: abrir o título, localizar a baixa na parcela, clicar em Estornar,
    informar o motivo, confirmar;
  - os dois bloqueios (conciliada e repasse) e o que fazer em cada um;
  - "E depois?": o lançamento sumiu da Tesouraria, a parcela voltou a ficar
    em aberto, e o próximo passo é registrar a baixa de novo com os dados
    certos.
- **Cenas compartilhadas** (`src/ajuda/_titulos/cenas`): a cena da lista
  passa a mostrar a sublista de baixas na parcela do exemplo, e entra uma cena
  nova com o diálogo de estorno. Os alvos novos são registrados como os
  existentes.
- **`src/ajuda/aprovacoes/roteiros.ts`** (`aprovar-baixa`): a dica do passo
  "Confira o valor" e o "E depois?" deixam de dizer "não pode ser desfeita".
  Passam a dizer que, se algo estiver errado, o melhor é rejeitar; e que uma
  baixa aprovada por engano pode ser estornada na parcela, em Contas a pagar
  ou a receber, enquanto não estiver conciliada.
- O `pagar-parcela` / `receber-parcela`, no "E depois?", ganha uma frase:
  baixa aprovada errada é estornada na própria parcela.
- `roteiros.test.ts` dos três módulos é atualizado para os roteiros e alvos
  novos.

## Testes

- **Serviço `estornarBaixa`** (teste com banco, no padrão de `baixa.test.ts`):
  - caminho feliz: o lançamento é apagado, a baixa fica `ESTORNADO` com quem,
    quando e motivo, a parcela vai de PAGO para em aberto (e de PAGO para
    PARCIALMENTE_PAGO quando sobra outra baixa aprovada), e a auditoria
    `ESTORNAR` traz o lançamento apagado;
  - baixa `PENDENTE`, `REJEITADO` ou já `ESTORNADO` é recusada;
  - segregação ligada: quem registrou é recusado e outra pessoa consegue;
    segregação desligada: quem registrou consegue;
  - lançamento em grupo de conciliação é recusado;
  - conta Caixa (`conciliado: true` sem grupo) é estornada;
  - baixa de repasse é recusada;
  - venda à vista: o estorno da baixa automática abre a parcela, e depois o
    pedido ainda pode ser cancelado;
  - parcela cancelada continua cancelada depois do estorno;
  - baixa de outra filial não é encontrada;
  - motivo vazio ou só com espaços é recusado;
  - perfil sem `titulo:aprovar` (Financeiro) é recusado.
- **`recepcaoFruto`:** baixa estornada no título não impede excluir a
  recepção.
- **`titulosParaCliente`:** só passam as baixas aprovadas e estornadas, com os
  valores convertidos e as flags `conciliada` e `deRepasse` certas.
- **Ajuda:** os testes de roteiro existentes, com os roteiros novos.
- **Navegador:** estornar uma baixa em conta de banco e uma em Caixa; ver o
  bloqueio de uma conciliada; ver a segregação; conferir a Tesouraria e a
  parcela depois do estorno.

## Fora do escopo

- Mostrar na parcela as baixas pendentes e as rejeitadas, com o motivo.
  **Destino:** backlog (itens 4 e 5, que já estão lá).
- Contra-lançamento para dinheiro que saiu e voltou (devolução).
  **Destino:** descartado (desconciliar e estornar resolve, e a devolução
  entra como lançamento próprio quando aparecer no extrato).
- Estorno pela API. **Destino:** descartado (a API só registra baixa
  pendente, em `POST /api/v1/baixas`; aprovar e estornar são decisões de
  quem confere, feitas na tela).
- Editar uma baixa aprovada (trocar a conta ou a data sem estornar).
  **Destino:** descartado (estornar e registrar de novo deixa o rastro
  completo e passa de novo pela aprovação).
- Excluir lançamento manual e transferência. **Destino:** backlog (item 6,
  que já está lá).

## Ao concluir

- Backlog: item 3 com **Status:** feito na branch `feat/estorno-de-baixa`, no
  padrão do item 2.
- Memória de prioridade do backlog: próximo item é o 4.
