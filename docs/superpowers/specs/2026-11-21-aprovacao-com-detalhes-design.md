# Aprovações pendentes com os dados da baixa

Data: 2026-11-21 · Status: aprovada para plano

Item 2 do [backlog](../../backlog.md), seção "Financeiro — lacunas achadas ao
escrever a ajuda contextual" ("Aprovação às cegas", prioridade alta).

## Problema

A tela Aprovações pendentes (`src/app/(dashboard)/financeiro/aprovacoes/page.tsx`)
mostra só documento, contraparte, valor pago e quem registrou. Quem aprova não
vê a data da baixa, a conta bancária, qual parcela está sendo baixada, o valor
dela nem os juros, a multa e o desconto. Uma baixa com data 15/01 em vez de
15/10, ou na conta errada, é aprovada sem que ninguém perceba, e o lançamento
bancário sai errado. A segregação de funções (quem registra não aprova) perde o
sentido se o aprovador não tem como conferir.

`listarBaixasPendentes` (`src/server/services/baixa.ts`) já traz a conta e a
parcela; a tela não usa.

## Decisões deste desenho

1. **Linha empilhada** (escolha do usuário): continuam 5 colunas, cada célula
   com 2 ou 3 linhas. Tudo fica visível sem clique, e a tabela não fica larga
   demais no celular. Descartados: uma coluna por dado (larga demais) e
   detalhe expansível (deixa pular a conferência, que é o problema).
2. **Avisos que informam e não bloqueiam** (escolha do usuário): data fora do
   normal, valor diferente do saldo e outra baixa pendente na mesma parcela. O
   botão Aprovar continua como está; quem decide é o aprovador.
3. **A regra dos avisos é uma função pura**, separada da consulta e da tela,
   para ser testada sem banco.
4. **Sem migration e sem mudança de permissão.**

## A linha da baixa

| Coluna (novo rótulo) | Conteúdo |
|---|---|
| **Título** | Documento (negrito); contraparte como link; embaixo, em texto menor, "Pagamento · parcela 1/3" ou "Recebimento · parcela 2/2". |
| **Baixa** | Data da baixa (`formatarData`); embaixo, a conta bancária (`nomeDaContaBancaria`). |
| **Valor** | Valor pago em destaque; embaixo, em texto menor, "parcela R$ 1.000,00" e só os ajustes diferentes de zero: "+ juros R$ 12,00", "+ multa R$ …", "− desconto R$ …". |
| **Registrado por** | Nome; embaixo, data e hora do registro (`criadoEm`, no horário de Brasília, "15/10/2026 10:20"); o aviso "Registrada por você: outra pessoa precisa aprovar" continua como hoje. |
| **Ações** | Sem mudança (Aprovar; motivo + Rejeitar). |

- **Link da contraparte:** abre Contas a pagar (pagamento) ou Contas a receber
  (recebimento) filtrada pela contraparte (`?contraparte=<id>`), onde estão o
  título, as parcelas e os anexos (a nota, o boleto). Título sem contraparte
  (não deveria existir, mas o campo é opcional) mostra o nome sem link, ou
  "—".
- **"Total de parcelas"** é o número de parcelas do título, contando as
  renegociadas e canceladas: é a mesma conta da coluna Parcelas da lista de
  títulos (`titulo.parcelas.length` em `titulo-table.tsx`).

## Avisos

Aparecem embaixo do conteúdo da linha, cada um com o ícone `TriangleAlert`
em âmbar (mesmo padrão das pendências fiscais em `titulo-table.tsx`) e uma
frase curta. A linha pode ter mais de um aviso.

| Aviso | Quando | Texto |
|---|---|---|
| Data no futuro | data da baixa > hoje (dia de Brasília, `hojeDeCalendario`) | "Data da baixa no futuro" |
| Data antiga | data da baixa < dia do registro (dia de Brasília de `criadoEm`) − 30 dias | "Data da baixa N dias antes do registro" |
| Parcela já paga | saldo em aberto ≤ 0 | "A parcela já está paga" |
| Parcial | valor pago < esperado | "Pagamento parcial: faltam R$ X" (no recebimento, "Recebimento parcial: faltam R$ X") |
| Acima do saldo | valor pago > esperado (e saldo em aberto > 0) | "Acima do saldo em R$ X" |
| Baixa em dobro | a parcela tem outra baixa PENDENTE além desta | "Há outra baixa pendente nesta parcela" |

- **Saldo em aberto** = `valorAtualizado` da parcela − soma do `valorPago` das
  baixas **aprovadas** da parcela (a mesma conta de `calcularStatusParcela`).
- **Esperado** = saldo em aberto + juros + multa − desconto (o valor pago é o
  total que saiu ou entrou na conta, já com juros e multa).
- Comparação em **centavos** (inteiros), sem tolerância.
- Exatamente 30 dias antes não avisa; 31 avisa. A data de hoje não é "no
  futuro".
- "Parcela já paga" substitui "Acima do saldo" quando o saldo é zero ou
  negativo, porque é o caso típico da baixa em dobro já aprovada. O texto é o
  mesmo no recebimento ("A parcela já está paga").
- Os outros textos são iguais nos dois sentidos, menos o do parcial.

## Código

- **`src/lib/financeiro/avisosDaBaixa.ts`** (arquivo novo): função pura
  `avisosDaBaixa(baixa, contexto)`, que recebe números e datas já convertidos
  (sem `Decimal` do Prisma) e devolve a lista de avisos `{ tipo, texto }` na
  ordem da tabela acima. `contexto` traz `hoje`, o tipo do título, o saldo em
  aberto e quantas baixas pendentes a parcela tem.
- **`listarBaixasPendentes`** passa a trazer, na mesma chamada:
  - a contagem de parcelas do título (`_count` de `parcelas`);
  - as baixas da parcela (só `valorPago` e `statusAprovacao`), para somar as
    aprovadas e contar as pendentes.
  Continua filtrando pela filial ativa e na mesma ordem (`criadoEm` asc).
- **A página** monta cada linha com esses dados e chama `avisosDaBaixa`. O
  comentário de espelho do topo continua valendo.
- Dia do registro em Brasília: reaproveitar `hojeDeCalendario(criadoEm)` (a
  função aceita qualquer instante).

## Ajuda (src/ajuda/aprovacoes/)

A ajuda espelha a tela, então muda junto:

- **Exemplo (`exemplo.ts`):** cada baixa ganha tipo, parcela n/total, data,
  conta, valor da parcela, juros/multa/desconto, data e hora do registro e os
  avisos esperados. Mantém a história das outras ajudas e ganha uma quarta
  linha para mostrar o aviso de data:
  1. NF-e 1234 · Agro Insumos · Pagamento · parcela 1/3 · 15/10/2026 ·
     Banco do Brasil — CC 12345-6 · R$ 1.012,00 (parcela R$ 1.000,00 + juros
     R$ 12,00) · Maria Souza, 15/10/2026 · sem aviso (é a baixa do roteiro
     `pagar-parcela` de Contas a pagar).
  2. Recibo 88 · José da Silva · Pagamento · parcela 1/1 · R$ 1.200,00 ·
     Maria Souza · aviso "A parcela já está paga" (a baixa em dobro que o
     roteiro `rejeitar-baixa` rejeita).
  3. NF-e 321 · Fazenda Santa Luzia · Recebimento · parcela 1/3 · 15/10/2026 ·
     R$ 15.060,00 (parcela R$ 15.000,00 + juros R$ 60,00) · Carlos Lima (você)
     · sem aviso (a baixa do roteiro `receber-parcela`).
  4. Fatura 556 · Energia Rural S.A. · Pagamento · parcela 1/1 · 15/01/2026
     (digitado no lugar de 15/11/2026) · Maria Souza, 15/11/2026 · aviso
     "Data da baixa 304 dias antes do registro".
  Os valores e textos dos avisos do exemplo são calculados com
  `avisosDaBaixa`, não escritos à mão, para a ajuda não mentir se a regra
  mudar.
- **Réplica (`cenas.tsx`):** as colunas e a linha empilhada da tela real, com
  os avisos. Alvos novos para os passos (ex.: `lista.l1.baixa`,
  `lista.l1.valor`, `lista.l4.avisos`, `lista.l2.avisos`).
- **Roteiros (`roteiros.ts`):**
  - `aprovar-baixa`: o passo "Confira o valor com o comprovante" perde a dica
    "A tela não mostra a data nem a conta…". Entram os passos "Confira a data
    e a conta" (coluna Baixa) e "Confira o valor" (explica valor da parcela +
    juros = valor pago). O passo do documento menciona o link da contraparte,
    que leva ao título e aos anexos.
  - **Roteiro novo `entender-avisos`** ("Quando a baixa tem um aviso"): passa
    pela Fatura 556 (data antiga: rejeitar com o motivo, para quem registrou
    lançar de novo com a data certa) e pelo Recibo 88 (parcela já paga), e
    explica os outros avisos (data no futuro, pagamento parcial, acima do
    saldo, outra baixa pendente). Deixa claro que o aviso não impede a
    aprovação.
  - `rejeitar-baixa`: o passo do motivo cita o aviso "A parcela já está paga"
    que aparece na linha do Recibo 88.
  - Ordem: `aprovar-baixa` → `entender-avisos` → `rejeitar-baixa` →
    `aprovar-bloqueado`, com os `proximoRoteiro` ajustados.
- **Teste (`roteiros.test.ts`):** lista de roteiros com o novo; a réplica tem
  as colunas novas (Título, Baixa, Valor, Registrado por, Ações); os avisos do
  exemplo batem com `avisosDaBaixa`; os alvos de cada passo continuam
  aparecendo na cena.
- **Primeiros passos:** não muda (não fala da tela).

## Testes

- `avisosDaBaixa`: sem aviso; data de hoje (não avisa); amanhã (avisa); 30 e
  31 dias antes do registro; registro perto da meia-noite em Brasília (dia do
  registro certo); pagamento parcial; acima do saldo; parcela já paga (sem
  "acima do saldo" junto); desconto que fecha a conta (sem aviso); juros e
  multa; parcela com baixa parcial já aprovada; centavos (0,1 + 0,2);
  outra baixa pendente; recebimento usa "Recebimento parcial"; vários avisos
  na mesma linha.
- `listarBaixasPendentes` (teste com banco, nas fixtures financeiras
  existentes): traz total de parcelas, soma das aprovadas e contagem das
  pendentes; não mistura outra filial.
- No navegador: baixas montadas por script na Matriz (uma de cada aviso, uma
  limpa), conferir a tela em largura de desktop e de celular, a ajuda nova, e
  apagar os dados no fim.

## Fora do escopo

- Impedir a baixa duplicada (item 4 do backlog): aqui só avisa.
- Desconto que não abate o saldo da parcela (item 1): o aviso usa o esperado
  com desconto, mas a parcela continua ficando PARCIALMENTE_PAGO depois da
  aprovação, como hoje.
- Página de detalhe do título.
- Confirmação antes de aprovar.

## Ao concluir

- Backlog: item 2 com **Status:** feito na branch `feat/aprovacao-com-detalhes`.
- Memória de prioridade do backlog: próximo item é o 3.
