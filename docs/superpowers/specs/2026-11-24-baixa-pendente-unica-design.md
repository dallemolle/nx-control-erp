# Uma baixa pendente por parcela

Data: 2026-11-24 · Status: implementada (2026-11-24)

Item 4 do [backlog](../../backlog.md), seção "Financeiro — lacunas achadas ao
escrever a ajuda contextual" ("Parcela com baixa pendente aceita outra baixa",
prioridade alta).

## Problema

`registrarBaixa` (`src/server/services/baixa.ts`) cria a baixa PENDENTE sem
olhar as outras baixas da parcela. A rota `POST /api/v1/baixas` chama a mesma
função. Na tela, o botão Baixar só some quando a parcela está paga, cancelada
ou renegociada (`titulo-table.tsx`), e a lista "Baixas" da parcela não mostra
as pendentes (`titulos-para-cliente.ts`). Quem registrou não vê que a baixa
está esperando aprovação.

Exemplo: Maria registra a baixa da parcela 1 na segunda. Na terça, sem ver a
aprovação, registra de novo. As duas vão para Aprovações pendentes e, se o
aprovador aprovar as duas, a saída é lançada em dobro. A única defesa hoje é o
aviso "Há outra baixa pendente nesta parcela" em Aprovações, que não bloqueia.

## Decisões deste desenho

Todas foram escolhas do usuário.

1. **Bloquear sempre.** Uma parcela tem no máximo uma baixa PENDENTE. A
   segunda só pode ser registrada depois que a primeira for aprovada ou
   rejeitada. Pagamento parcial legítimo continua possível: a segunda parte
   espera a aprovação da primeira. Descartados:
   - Bloquear só quando a soma (aprovadas + pendentes + nova) passa do valor da
     parcela: a mesma parcial lançada duas vezes (R$ 500 + R$ 500 numa parcela
     de R$ 1.000) passaria.
   - Avisar e pedir confirmação: não impede o erro, só o torna consciente.
2. **Trava com `SELECT … FOR UPDATE` na parcela**, dentro de uma transação, o
   mesmo padrão de `repasseCartao.ts`. Dois cliques ou duas requisições
   simultâneas ficam em fila e a segunda é recusada. Descartados:
   - Índice único parcial no banco: o schema do Prisma não o expressa (o
     `migrate dev` veria divergência), e a venda à vista e o repasse criam a
     baixa PENDENTE antes de aprová-la na mesma transação.
   - Contar sem travar: deixa a corrida do clique duplo.
3. **Parcela fora de aberto também recusa baixa.** `registrarBaixa` passa a
   aceitar só parcela `EM_ABERTO`, `A_VENCER`, `VENCIDO` ou
   `PARCIALMENTE_PAGO`. A tela já escondia o Baixar nas outras, mas a API
   aceitava baixa em parcela paga, cancelada ou renegociada.

## Servidor

`registrarBaixa`:

1. Mantém, na ordem atual, permissão, filial somente leitura, parcela da
   filial, título da maquininha e conta bancária da filial.
2. Abre uma transação e trava a parcela:
   `SELECT id FROM parcelas WHERE id = $1 FOR UPDATE`.
3. Relê a parcela na transação. Status fora dos quatro aceitos → `Error`
   "Esta parcela está {paga|cancelada|renegociada} e não aceita baixa".
4. Procura uma baixa PENDENTE da parcela (com o nome de quem registrou).
   Achou → `BaixaPendenteError` (classe nova, exportada de `baixa.ts`) com:
   > Esta parcela já tem uma baixa aguardando aprovação: R$ 1.012,00 de
   > 14/10/2026, registrada por Maria. Peça para aprovarem ou rejeitarem essa
   > baixa antes de registrar outra.
5. Cria a baixa e grava a auditoria `CRIAR` na mesma transação.

As leituras dentro da transação são sequenciais, sem `include` com várias
relações (ver a seção "Banco de dados — consultas paralelas na transação" do
backlog).

Não mudam: `efetivarBaixa`, aprovação, rejeição, estorno, venda à vista e
repasse de cartão (que criam e aprovam a baixa na mesma transação e não
passam por `registrarBaixa`), e o aviso "Há outra baixa pendente" em
Aprovações, que continua valendo para parcelas que já têm duas pendentes de
antes desta mudança.

## API

`executarRotaApi` mapeia `BaixaPendenteError` para **409** com `{ erro }`. A
recusa por status da parcela também deixa de ser 500: vira
`BaixaParcelaFechadaError` (409, mesma forma). A server action já devolve a
mensagem pelo `FormState`, sem mudança.

## Tela (Contas a pagar e Contas a receber)

- `titulos-para-cliente.ts`: a lista de baixas da parcela passa a incluir as
  PENDENTE (`status: "PENDENTE"`), além de APROVADO e ESTORNADO. REJEITADO
  continua fora (item 5 do backlog). A pendente leva `registradaEm`
  (`criadoEm`). A parcela ganha `temBaixaPendente`.
- `titulo-table.tsx`: com `temBaixaPendente`, o botão Baixar dá lugar ao texto
  "Baixa aguardando aprovação" (cinza, `text-xs text-muted-foreground`).
- `baixas-da-parcela.tsx`: a pendente aparece com o selo "Aguardando
  aprovação" e a linha "registrada por Maria em 14/10/2026 10:32"
  (`formatarDataHora`). Não tem ação de estorno.
- Réplica da ajuda (`src/ajuda/_titulos/cenas.tsx`) com o selo novo.

## Ajuda

Com as duas travas, nenhuma baixa nova dispara os avisos "A parcela já está
paga" e "Há outra baixa pendente nesta parcela". Os avisos ficam no código
(servem às pendentes registradas antes desta mudança), mas a ajuda de
Aprovações deixa de usá-los como exemplo:

- `src/ajuda/aprovacoes/exemplo.ts`: o Recibo 88 deixa de ser baixa repetida
  em parcela paga. Passa a ser valor digitado errado: parcela de R$ 1.200,00,
  nada aprovado, valor pago R$ 12.000,00 → aviso (pela regra real) "Acima do
  saldo em R$ 10.800,00". `MOTIVO_REJEICAO` = "Valor errado: o recibo é de
  R$ 1.200,00".
- `src/ajuda/aprovacoes/roteiros.ts`:
  - `entender-avisos`: "Quando usar" cita valor e data digitados errados, não
    "baixa em dobro". O passo "Veja o aviso de valor" explica o Recibo 88
    novo. A dica diz que "A parcela já está paga" e "Há outra baixa pendente
    nesta parcela" só aparecem em baixas registradas antes de o sistema
    impedir a segunda baixa.
  - `rejeitar-baixa`: "Quando usar" perde "A parcela continua com o botão
    Baixar enquanto a baixa espera aprovação, então baixa em dobro acontece"
    e o exemplo "lançada em dobro". O passo do motivo explica o Recibo 88
    novo.
- `src/ajuda/aprovacoes/roteiros.test.ts`: a réplica mostra "Acima do saldo"
  no Recibo 88 em vez de "A parcela já está paga".
- `src/ajuda/contas-a-pagar/roteiros.ts` (`pagar-parcela`) e
  `src/ajuda/contas-a-receber/roteiros.ts` (`receber-parcela`), passo do
  botão Registrar baixa: a parcela mostra a baixa aguardando aprovação e não
  aceita outra até ela ser aprovada ou rejeitada; pagamento em partes registra
  a segunda depois da aprovação da primeira.
- Os testes de roteiro existentes acompanham os textos.

## Testes

- `baixa.test.ts`:
  - segunda baixa na parcela com pendente → `BaixaPendenteError`, mensagem com
    valor, data e quem registrou; nenhuma baixa nova criada;
  - depois de aprovar a primeira, a segunda (parcial) é registrada;
  - depois de rejeitar a primeira, a segunda é registrada;
  - duas chamadas em paralelo → uma baixa criada, a outra recusada;
  - parcela PAGA, CANCELADO ou RENEGOCIADO → recusada.
- `api/v1/baixas/route.test.ts`: segunda baixa → 409 com a mensagem.
- `titulos-para-cliente.test.ts`: pendente entra na lista com status
  PENDENTE; `temBaixaPendente`; rejeitada continua fora.
- Conferência no navegador: registrar, ver o selo e o texto no lugar do
  Baixar, aprovar e ver o Baixar voltar.

## Fora do escopo

- **Cancelar ou renegociar parcela com baixa pendente** → backlog (item novo).
  `cancelarParcela` e a renegociação não olham as pendentes. A parcela é
  cancelada e a baixa pendente pode ser aprovada depois. Pede decidir se
  bloqueia o cancelamento ou rejeita a pendente junto.
- **Mostrar baixas rejeitadas na parcela** → item 5 do backlog, já registrado.
- **Aprovar pela própria parcela** → descartado: Aprovações pendentes é o
  lugar, com os avisos.
