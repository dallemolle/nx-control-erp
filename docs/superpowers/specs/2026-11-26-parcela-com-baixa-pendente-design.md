# Parcela com baixa pendente não é cancelada nem renegociada

Data: 2026-11-26 · Status: implementada (2026-11-26)

Itens 59 e 60 do [backlog](../../backlog.md), seção "Financeiro — lacunas
achadas ao escrever a ajuda contextual" ("Cancelar ou renegociar parcela com
baixa pendente" e "Repasse de cartão trava parcelas sem ordem").

## Problema

**59.** `cancelarParcela` (`src/server/services/titulo.ts`) e
`renegociarParcela` (`src/server/services/renegociacao.ts`) não olham as baixas
pendentes da parcela. Exemplo: a baixa da parcela 1 espera aprovação; alguém
cancela a parcela; depois a Tesouraria aprova a baixa e sai o lançamento
bancário de uma parcela cancelada. A aprovação (`efetivarBaixa`,
`src/server/services/baixa.ts`) também não confere o status da parcela.

Além disso, `renegociarParcela` não confere o status de jeito nenhum: só a
tela esconde o botão (aparece só em VENCIDO). Pela action, dá para renegociar
uma parcela paga, cancelada ou já renegociada e criar dívida nova.

**60.** `confirmarRepasses` (`src/server/services/repasseCartao.ts`) trava as
parcelas com `SELECT id FROM parcelas WHERE id IN (...) FOR UPDATE` sem
`ORDER BY`. Duas confirmações com parcelas em comum, em ordem diferente, podem
travar uma a outra (deadlock) e o Postgres aborta uma delas com erro.

Cancelar pedido de venda (`situacaoParaCancelar`, `pedidoVenda.ts`) e excluir
recepção (`verificarCancelamento`, `recepcaoFruto.ts`) já recusam quando há
baixa pendente ou aprovada no título: não mudam.

## Regra

- Parcela com baixa **pendente** não pode ser cancelada nem renegociada.
  Mensagem: "Esta parcela tem uma baixa aguardando aprovação: R$ X de
  dd/mm/aaaa, registrada por Fulano. Aprove ou rejeite essa baixa antes de
  cancelar." (ou "antes de renegociar").
- Só parcela **em aberto** (EM_ABERTO, A_VENCER, VENCIDO, PARCIALMENTE_PAGO) é
  renegociada. Mensagem: "Esta parcela está paga/cancelada/renegociada e não
  pode ser renegociada".
- Baixa de parcela **cancelada ou renegociada** não é aprovada. Mensagem: "A
  parcela desta baixa foi cancelada. Rejeite a baixa." (ou "renegociada").
- Cancelar e renegociar travam a parcela (`FOR UPDATE`) dentro de uma
  transação, como `registrarBaixa` já faz: um registro de baixa e um
  cancelamento ao mesmo tempo ficam em fila e o segundo vê o primeiro.

## Decisões deste desenho

- **Bloquear, não rejeitar junto** (escolha do usuário): é a regra que pedido
  e recepção já usam, e ninguém rejeita uma baixa sem olhar o comprovante.
- **Recusa na aprovação também**: rede de segurança para pendências antigas
  (criadas antes desta regra) e para qualquer caminho que escape. A venda à
  vista usa `efetivarBaixa` numa parcela recém-criada e não é afetada.
- **Status conferido no servidor para renegociar**: a tela já restringe; o
  servidor passa a garantir.

## Componentes

### Serviços

- `src/server/services/baixa.ts`:
  - nova função exportada `garantirSemBaixaPendente(tx, parcelaId, acao:
    "cancelar" | "renegociar")`, que reaproveita a busca e a mensagem que
    `registrarBaixa` já monta para `BaixaPendenteError` (mesmo formato:
    valor, data, quem registrou), trocando o fim pela ação. Lança
    `BaixaPendenteError`.
  - `efetivarBaixa`: depois de ler a parcela, se o status for CANCELADO ou
    RENEGOCIADO, lança `BaixaParcelaFechadaError` com a mensagem da regra.
- `src/server/services/titulo.ts`, `cancelarParcela`: transação; `SELECT ...
  FOR UPDATE` na parcela; relê o status (estados terminais como hoje);
  `garantirSemBaixaPendente(tx, id, "cancelar")`; atualiza; auditoria dentro
  da transação.
- `src/server/services/renegociacao.ts`, `renegociarParcela`: transação
  interativa no lugar da transação em lote; `FOR UPDATE`; status precisa estar
  em aberto (mesma lista de `STATUS_QUE_ACEITAM_BAIXA`, exportada de
  `baixa.ts`); `garantirSemBaixaPendente(tx, id, "renegociar")`; depois o que
  já faz hoje (marca RENEGOCIADO, cria as novas parcelas), auditoria dentro da
  transação.
- `src/server/services/repasseCartao.ts`, `confirmarRepasses`: `ORDER BY id`
  no `SELECT ... FOR UPDATE`, com comentário (ordem fixa evita deadlock entre
  confirmações simultâneas).

### Tela

- `src/app/(dashboard)/financeiro/_titulos/titulo-table.tsx`: "Renegociar" e
  "Cancelar" não aparecem quando `parcela.temBaixaPendente` (o campo já existe
  e já esconde o "Baixar"). O texto "Baixa aguardando aprovação" continua.
- A action de renegociar já devolve a mensagem do serviço ao diálogo. A de
  cancelar é um formulário sem retorno: a recusa só acontece numa corrida
  (botão visível, baixa registrada no mesmo instante) e cai na página de erro;
  aceito pela raridade (o botão some quando há pendente).

### Aprovações

- `src/lib/financeiro/avisosDaBaixa.ts`: `DadosAvisoBaixa` ganha
  `statusParcela?: string`. Novo `TipoAvisoBaixa` `PARCELA_FECHADA`, primeiro
  da lista, com o texto "Parcela cancelada: rejeite esta baixa" ou "Parcela
  renegociada: rejeite esta baixa". Com ele, os avisos de valor (paga,
  parcial, acima do saldo) não aparecem, porque não fazem sentido numa
  parcela fechada.
- `src/app/(dashboard)/financeiro/aprovacoes/page.tsx` passa o status da
  parcela (já vem em `listarBaixasPendentes`, que inclui a parcela).

## Ajuda e documentos

- `src/ajuda/contas-a-pagar/roteiros.ts` e `src/ajuda/contas-a-receber/roteiros.ts`,
  roteiros `cancelar-parcela` e `renegociar`: dica de que, com baixa
  aguardando aprovação, Cancelar e Renegociar não aparecem; aprove ou rejeite
  a baixa antes.
- `src/ajuda/aprovacoes/roteiros.ts`: se o roteiro `entender-avisos` lista os
  avisos, acrescentar "Parcela cancelada/renegociada: rejeite a baixa".
- `docs/backlog.md`: itens 59 e 60 ganham "Status: feito".
- A API (`/api/v1/baixas`) só registra baixas: sem mudança em `docs/api-v1.md`.

## Testes

- `baixa.test.ts` ou `titulo.test.ts` (banco): cancelar com pendente → erro
  com a mensagem; sem pendente → CANCELADO.
- `renegociacao` (banco): com pendente → erro; parcela PAGO → erro; em aberto
  sem pendente → funciona como hoje.
- `baixa.test.ts` (banco): pendente antiga em parcela cancelada (cancelada por
  update direto no teste) → aprovar recusa, nenhum lançamento criado.
- `avisosDaBaixa.test.ts`: aviso de parcela cancelada e renegociada; sem os
  avisos de valor.
- Repasse: sem teste novo (deadlock não é reproduzível de forma confiável);
  os testes existentes de `repasseCartao.test.ts` continuam passando.
- Navegador: parcela com baixa pendente sem os botões; aprovar uma pendente
  antiga de parcela cancelada mostra o aviso e recusa.

## Fora do escopo

- Cancelamento de pedido de venda e exclusão de recepção: descartado (já
  recusam com baixa pendente ou aprovada).
- Rejeitar automaticamente pendências antigas de parcelas já canceladas:
  descartado (o aviso em Aprovações e a recusa na aprovação bastam; quem
  aprova rejeita com o próprio motivo).
