# Desconto na baixa abate o saldo da parcela

Data: 2026-11-25 · Status: implementada (2026-11-25)

Item 1 do [backlog](../../backlog.md), seção "Financeiro — lacunas achadas ao
escrever a ajuda contextual" ("Desconto na baixa não abate o saldo da
parcela").

## Problema

`calcularStatusParcela` (`src/server/services/parcela.ts`) e
`saldoRemanescenteParcela` (`src/server/services/fluxoDeCaixaProjetado.ts`)
comparam só a soma de `valorPago` das baixas aprovadas com o `valorAtualizado`
da parcela. `valorJuros`, `valorMulta` e `valorDesconto` são só registro.

Exemplo: parcela de R$ 1.000,00 paga com R$ 950,00 e desconto de R$ 50,00. A
parcela fica PARCIALMENTE_PAGO, com R$ 50,00 em aberto para sempre, que
aparecem em Contas a pagar/receber, na projeção, no aging, na inadimplência do
dashboard e nos demais totais "em aberto".

O efeito contrário também existe com juros: a parcela de R$ 1.000,00 paga com
R$ 1.000,00 e R$ 30,00 de juros fica PAGO, embora só R$ 970,00 da parcela
tenham sido quitados (o aviso "Pagamento parcial" da Aprovação já acusa isso,
mas o status não).

## Significado dos campos (já em uso)

"Valor pago" é o total que saiu ou entrou na conta, igual ao comprovante: o
que falta da parcela, mais juros e multa, menos o desconto. É o valor do
lançamento bancário. Os avisos da Aprovação (`avisosDaBaixa.ts`) e a ajuda de
Aprovações e de Contas a pagar/receber já usam esse significado. Esta mudança
não muda o significado dos campos, só passa a usá-lo no saldo.

## Regra

O **valor abatido** de uma baixa aprovada é:

```
valor abatido = valor pago − juros − multa + desconto
```

O saldo da parcela é `valorAtualizado − soma do valor abatido das baixas
aprovadas`. O status sai desse saldo, como hoje (≤ 0 → PAGO; menor que o valor
da parcela → PARCIALMENTE_PAGO; senão, pelo vencimento).

Exemplos:

| Parcela | Pago | Juros | Multa | Desconto | Abatido | Status |
|---|---|---|---|---|---|---|
| 1.000,00 | 950,00 | 0 | 0 | 50,00 | 1.000,00 | Pago |
| 1.000,00 | 1.012,00 | 12,00 | 0 | 0 | 1.000,00 | Pago |
| 1.000,00 | 1.000,00 | 30,00 | 0 | 0 | 970,00 | Parcialmente pago (30,00) |
| 1.000,00 | 500,00 + 450,00 (2 baixas) | 0 | 0 | 0 + 50,00 | 1.000,00 | Pago |

O lançamento bancário continua com o valor pago: é o que de fato saiu ou
entrou na conta. Fluxo realizado, conciliação, orçamento realizado e relatórios
que somam lançamentos não mudam.

## Decisões deste desenho

Todas foram escolhas do usuário.

1. **Baixa que não abate nada é recusada.** Se juros + multa ≥ valor pago +
   desconto, o registro é recusado com "Juros e multa não podem ser maiores
   que o valor pago mais o desconto". Vale para a tela e para a API (400).
   Quase sempre é erro de digitação. Descartado: aceitar e abater zero (a
   baixa sairia do banco sem efeito visível na parcela).
2. **O diálogo "Registrar baixa" mostra a prévia** "Abate R$ X da parcela ·
   fica R$ Y em aberto", atualizada enquanto a pessoa digita. Assim a
   diferença entre valor pago e desconto fica clara na hora. Descartado: só
   documentar na ajuda.

## Componentes

### Função única da regra

Novo `src/lib/financeiro/valorAbatido.ts` (puro, usável no cliente):

- `type ValoresDaBaixa = { valorPago: number; valorJuros: number; valorMulta: number; valorDesconto: number }`
- `valorAbatidoDaBaixa(b: ValoresDaBaixa): number` — a conta acima, em
  centavos para não acumular erro de ponto flutuante.
- `totalAbatido(baixas: readonly ValoresDaBaixa[]): number`.

### Onde a regra entra

- `calcularStatusParcela` e `recalcularEPersistirStatusParcela`
  (`parcela.ts`): `BaixaAprovadaParaStatus` passa a ser `ValoresDaBaixa`.
- `saldoRemanescenteParcela` (`fluxoDeCaixaProjetado.ts`): recebe
  `ValoresDaBaixa[]`.
- `resumirBaixasDaParcela` (`avisosDaBaixa.ts`): `totalAprovado` passa a ser
  o total abatido, para o aviso "Parcial"/"Acima do saldo" bater com o
  status. Os textos dos avisos não mudam.
- Todos os chamadores passam os quatro campos e seus `select` carregam
  `valorJuros`, `valorMulta` e `valorDesconto`:
  - `titulo.ts` (`sincronizarStatusDasParcelas`);
  - `fluxoDeCaixaProjetado.ts`;
  - `dashboardExecutivo.ts`;
  - `filiaisConsolidadas.ts`;
  - `relatorioFiscalGerencial.ts`;
  - `orcamento.ts`;
  - `fluxoDeCaixaPorDimensao.ts`;
  - `relatorioProducao/consultas.ts`;
  - `financeiro/aprovacoes/page.tsx`.

  Como o tipo exige os quatro campos, o `tsc` aponta qualquer chamador
  esquecido.

### Validação

`baixaSchema` (`src/lib/schemas/baixa.ts`) ganha um `refine`: valor abatido
> 0, senão a mensagem da decisão 1 no campo `valorJuros`. A API
(`src/app/api/v1/baixas/route.ts`) já valida pelo mesmo schema; conferir que
responde 400 com a mensagem. Baixas criadas pelo sistema (venda à vista,
repasse de cartão) não têm juros, multa nem desconto e não são afetadas.

### Prévia no diálogo

- `titulos-para-cliente.ts` passa a expor, por parcela, o `saldoEmAberto`
  (valor da parcela − total abatido das aprovadas).
- `ContasClientePanel` passa ao `BaixaDialog` a parcela escolhida (id e
  saldo) em vez de só o id.
- `BaixaDialog` lê os quatro campos (controlados) e mostra, abaixo deles:
  "Abate R$ X da parcela · fica R$ Y em aberto". Com abatido ≤ 0, mostra a
  mensagem da decisão 1 em vez da prévia. Se o abatido passar do saldo:
  "Abate R$ X da parcela · R$ Z acima do saldo".
- A cena simulada da ajuda (`src/ajuda/_titulos/cenas.tsx`, cena `baixa`)
  espelha a prévia, como pede o comentário no topo do diálogo.

### Dados já gravados

Migration SQL (`prisma/migrations/2026112513xxxx_desconto_abate_parcela`)
recalcula as parcelas cujo status muda com a regra nova: entre `PAGO` e
`PARCIALMENTE_PAGO`, comparando `valorAtualizado` com a soma de
`valorPago − valorJuros − valorMulta + valorDesconto` das baixas `APROVADO`.
Não mexe em `CANCELADO` nem `RENEGOCIADO`. Os demais casos (parcela que fica
sem nada abatido por dado antigo inválido) são corrigidos pela sincronização
que já roda ao abrir a lista de títulos.

## Ajuda e documentos

- `src/ajuda/contas-a-pagar/roteiros.ts` e `src/ajuda/contas-a-receber/roteiros.ts`
  (roteiros `pagar-parcela` e `receber-parcela`): a dica do passo "Informe o
  valor pago/recebido" deixa de mandar combinar com o financeiro e explica o
  desconto (paga R$ 950,00 com R$ 50,00 de desconto: valor pago 950,00,
  desconto 50,00, a parcela fica paga). O passo "Informe juros, multa e
  desconto" deixa de dizer que os campos "só detalham" e diz que o sistema
  usa os três para saber quanto da parcela foi quitado, e cita a prévia.
- `docs/api-v1.md`, `POST /baixas`: a regra do valor abatido e o 400.
- `docs/backlog.md`: o item 1 ganha "Status: feito", como os itens 2 a 5.

## Testes

- `valorAbatido.test.ts`: a tabela de exemplos, centavos.
- `parcela.test.ts`: status com desconto, com juros, com várias baixas.
- `fluxoDeCaixaProjetado.test.ts`: saldo remanescente com desconto.
- `baixa.ts` schema: recusa juros + multa ≥ pago + desconto; aceita o limite
  logo acima.
- `avisosDaBaixa.test.ts`: `resumirBaixasDaParcela` com desconto em baixa
  aprovada anterior.
- `titulos-para-cliente.test.ts`: `saldoEmAberto`.
- Teste de serviço (banco) de `registrarBaixa` + `aprovarBaixa` com desconto:
  parcela PAGO.
- Navegador: registrar e aprovar uma baixa com desconto, ver a prévia, a
  parcela paga e a projeção sem o resto.

## Fora do escopo

- Lançamento separado para o desconto concedido ou obtido, ou para juros
  pagos: descartado. O sistema não tem contabilidade, e os valores ficam
  registrados na baixa.
- Relatório de descontos concedidos e juros pagos: descartado. Ninguém pediu,
  e os dados estão na baixa se for preciso.
