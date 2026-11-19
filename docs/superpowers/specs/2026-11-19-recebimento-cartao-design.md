# Recebimento por cartão (repasse e taxa da operadora)

Data: 2026-11-19 · Status: implementada (2026-11-19)

Item do backlog "Recebimento por cartão: prazo de repasse, parcelas e taxa da
operadora" (Financeiro — controles e conciliação; spec da venda a prazo,
2026-11-16). Hoje a venda no cartão segue o caminho do Pix e da transferência
([pedidoVenda.ts](../../../src/server/services/pedidoVenda.ts)): título a
receber do cliente com uma parcela na data do pedido, baixada na hora pelo
valor cheio na conta de recebimento padrão. Na prática a operadora paga
depois e desconta a taxa. Efeitos:

- saldo e fluxo realizado mostram dinheiro que ainda não entrou;
- a projeção não vê os repasses futuros;
- a conciliação dá divergência em toda venda no cartão (o extrato traz o líquido);
- a taxa nunca vira despesa, e a margem fica inflada.

Operação da Hortitex (informada em 2026-11-19): débito, crédito à vista e
crédito parcelado; Pix às vezes direto na conta, às vezes pela maquininha;
**mais de uma operadora**; antecipação do crédito **depende da operadora**.

## Decisões deste desenho (registrar no doc 08)

- **D-37 — Receita bruta, taxa como despesa e repasses previstos:** a venda
  na maquininha não é baixada na hora. Gera um título a receber com uma
  parcela por repasse (valor bruto, na data prevista) e um título a pagar da
  taxa (mesmas datas). O recebimento é confirmado quando o dinheiro cai e
  baixa os dois juntos; a conciliação em grupo fecha bruto − taxa com o
  depósito líquido.
  Descartadas: taxa como desconto na baixa (a taxa reduziria a receita em vez
  de virar despesa com categoria); conta transitória "Cartões a receber"
  baixada na venda (saldo e fluxo realizado contariam uma conta que não
  existe, e a projeção não veria os repasses).
- **D-38 — Título a receber em nome da operadora:** quem deve depois da venda
  é a operadora, não o cliente. Contas a receber mostra "Stone deve R$ X" e
  repasse atrasado aparece como atraso da operadora. Relatórios de venda por
  cliente continuam certos (saem do pedido). Descartado: título em nome do
  cliente (mostraria o cliente devendo o que já pagou).
- **D-39 — Confirmação de repasse efetiva direto:** não passa pela aprovação
  de baixa nem pela "aprovação por outra pessoa". Valores vêm do pedido e do
  cadastro (só a data é escolhida); o dinheiro entra, não sai; confirmação
  errada fica sem par no extrato e aparece na conciliação. Pela aprovação,
  cada repasse viraria duas baixas soltas, aprováveis uma sem a outra.
  Mesmo critério da baixa automática da venda à vista.

## Modelo

Uma migration.

### Operadora

```prisma
enum ModalidadeCartao {
  DEBITO
  CREDITO_VISTA
  CREDITO_PARCELADO
  PIX_MAQUININHA
}

model OperadoraCartao {
  id                    String   @id @default(uuid())
  filialId              String
  nome                  String
  contaBancariaId       String   // onde a operadora deposita
  fornecedorId          String   // contraparte do título da taxa
  clienteId             String   // contraparte do título dos repasses (D-38)
  categoriaTaxaId       String   // categoria de despesa da filial
  ativo                 Boolean  @default(true)
  criadoEm / atualizadoEm
  condicoes             CondicaoOperadoraCartao[]
  @@unique([filialId, nome])
  @@index([filialId])
}

model CondicaoOperadoraCartao {
  id              String           @id @default(uuid())
  operadoraId     String           // onDelete: Cascade
  modalidade      ModalidadeCartao
  parcelasDe      Int              // 1 fora do parcelado
  parcelasAte     Int              // 1 fora do parcelado
  taxaPercentual  Decimal          @db.Decimal(7, 4)
  prazoDias       Int              // dias corridos até o 1º repasse
  antecipado      Boolean          @default(false) // só parcelado
  @@index([operadoraId])
}
```

Relações com `ContaBancaria`, `Fornecedor`, `Cliente` e `CategoriaFinanceira`
com `onDelete: Restrict`.

### Pedido

`PedidoVenda` ganha (todos opcionais; preenchidos só na forma `CARTAO`):

- `operadoraCartaoId String?` → `OperadoraCartao` (`Restrict`)
- `modalidadeCartao ModalidadeCartao?`
- `parcelasCartao Int?`
- `taxaCartaoPercentual Decimal? @db.Decimal(7, 4)`: taxa congelada na venda
- `tituloTaxaId String? @unique` → `Titulo` (`SetNull`), relação própria

`contaBancariaId` recebe a conta da operadora (informativo; não há baixa).

### Confirmação de repasse

```prisma
model RepasseCartaoConfirmado {
  id                  String   @id @default(uuid())
  parcelaId           String   @unique // parcela do título a receber
  baixaRecebimentoId  String   @unique
  baixaTaxaId         String?  @unique // sem taxa no repasse: vazio
  data                DateTime
  usuarioId           String
  criadoEm            DateTime @default(now())
}
```

Liga a parcela às duas baixas que a confirmação criou. É o que permite
desfazer exatamente o que a confirmação fez e saber que a parcela foi
recebida pelo fluxo de repasses.

## Cadastro da operadora

Tela **Cadastros → Operadoras de cartão**, permissão `cadastro:escrever`
(leitura `cadastro:ler`), por filial.

Campos: nome, CNPJ, conta de depósito (da filial, ativa, **não Caixa**),
categoria da taxa (da filial, ativa, `tipo` de despesa) e as condições.

**CNPJ → cliente e fornecedor:** ao salvar, procura na empresa o cliente e o
fornecedor com aquele CNPJ e cria os que faltarem (nome = nome da operadora).
Se o encontrado estiver inativo, recusa: "O fornecedor/cliente com este CNPJ
está inativo; reative o cadastro". Na edição, trocar o CNPJ repete a busca.

**Condições** (lista editável na mesma tela), regras:

- uma condição por modalidade fora do parcelado (`parcelasDe = parcelasAte = 1`);
- no parcelado, faixas de 2 a 12 (`2 ≤ de ≤ até ≤ 12`) sem sobreposição;
- `0 ≤ taxa < 100`, até 4 casas;
- `0 ≤ prazoDias ≤ 365`;
- `antecipado` só no parcelado.

A operadora pode ser desativada (some do pedido; histórico fica). Não há
exclusão. Auditoria `CRIAR`/`ATUALIZAR`/`INATIVAR` com as condições no
`novo`.

## Venda na maquininha

### Formulário do pedido

- A forma `CARTAO` passa a ter o rótulo **"Maquininha (cartão ou Pix)"**.
  `PIX` continua sendo o Pix direto na conta, sem mudança.
- Com a maquininha: **operadora** (ativas da filial), **modalidade** e
  **parcelas** (só no parcelado, 2 a 12). O campo de conta some.
- Prévia dos repasses (data, bruto, taxa, líquido), com a mesma função de
  cálculo do servidor.

### Cálculo dos repasses (função pura em `src/lib/producao/cartao.ts`)

Entrada: data do pedido, valor bruto, condição, número de parcelas.

- **Quantos repasses:** 1 fora do parcelado e no parcelado antecipado; N no
  parcelado sem antecipação.
- **Datas:** 1º repasse em `data + prazoDias`; os seguintes `+30` dias cada.
- **Bruto:** dividido igualmente, em centavos; a sobra vai na **última**.
- **Taxa:** `round(bruto × taxa%)` no total, dividida pela mesma proporção do
  bruto; a sobra vai na última.
- Saída: `[{ data, bruto, taxa, liquido }]`.

### Ao salvar (`criarPedido`, mesma transação)

1. Operadora ativa da filial; condição da modalidade cuja faixa contém as
   parcelas. Sem condição: "A {operadora} não tem condição para {modalidade}
   em {N}x". Conta da operadora ainda ativa.
2. Calcula os repasses.
3. **Título a RECEBER** com `contraparteId = operadora.clienteId`; categoria
   de venda, documento, classificação e comprovante como hoje; conta da
   operadora; `formaPagamento` = "Crédito 3x — Stone" (rótulo da modalidade +
   parcelas + operadora); uma parcela por repasse com o **bruto**.
4. **Título a PAGAR** da taxa, se a taxa total > 0:
   - `contraparteId = operadora.fornecedorId`, `categoriaTaxaId`;
   - documento "Taxa PV-{n}"; emissão e competência = data do pedido;
   - `GERENCIAL`, comprovante `SEM_COMPROVANTE`, motivo "Taxa da operadora
     descontada no repasse";
   - parcelas com a taxa de cada repasse, **mesmo número** da parcela a
     receber correspondente; repasse com taxa 0 não tem parcela de taxa.
5. **Nenhuma baixa.** `baixaAutomaticaId` fica vazio.
6. Grava no pedido operadora, modalidade, parcelas, taxa e `tituloTaxaId`.
7. Auditoria `CRIAR` do pedido ganha `cartao: { operadora, modalidade,
   parcelas, taxaPercentual, repasses }`.

### Pedido na tela

- **Situação:** o cálculo (`situacaoPagamento`) não muda. Nos pedidos da
  maquininha, o rótulo de `EM_ABERTO` vira **"Aguardando repasse"** e o de
  `VENCIDO` vira **"Repasse atrasado"**.
- **Detalhe do pedido:** quadro "Repasses" (data prevista, bruto, taxa,
  líquido, recebido em).
- **Recibo:** forma de pagamento "Cartão de crédito 3x" / "Débito" / "Pix na
  maquininha".

Pedidos antigos no cartão (baixados na hora) não mudam; campos novos vazios.

## Repasses de cartão

Tela **Financeiro → Repasses de cartão**, permissão `titulo:baixar`.

**Lista:** uma linha por parcela a receber de título de pedido com
operadora: operadora, data prevista, pedido (link), parcela "2/3", bruto,
taxa, líquido, situação. Filtros: operadora, período (data prevista) e
situação (**a receber**, **atrasado** = prevista < hoje, **recebido**).
Padrão: a receber + atrasados. Marcando linhas, a tela soma o **líquido da
seleção**.

**Confirmar recebimento** (`confirmarRepasses(sessao, parcelaIds, data)`):

1. Permissão `titulo:baixar` + `requireAlteracaoFilial`.
2. Data informada (padrão: a prevista da primeira selecionada); não futura.
3. Uma transação. Para cada parcela, relida e travada (`FOR UPDATE`): tem que
   ser de título de pedido com operadora, da filial, **em aberto** e sem
   `RepasseCartaoConfirmado`. Senão a transação toda falha: "O repasse 2/3 do
   PV-15 já foi confirmado".
4. Baixa da parcela a receber: `valorPago` = valor atualizado (bruto), conta
   da operadora, criada `PENDENTE` e efetivada com `efetivarBaixa` (D-39) →
   lançamento de **entrada** do bruto.
5. Se há parcela de taxa **em aberto** com o mesmo número: baixa dela pelo
   valor atualizado, mesma conta e data, efetivada → lançamento de **saída**
   da taxa.
6. Grava `RepasseCartaoConfirmado`; auditoria `CONFIRMAR_REPASSE` na parcela.

**Desfazer confirmação** (`desfazerRepasse(sessao, parcelaId)`), permissão
`titulo:baixar`: só se nenhum dos lançamentos das duas baixas estiver em
grupo de conciliação ("O repasse já foi conciliado. Desconcilie na
Conciliação antes"). Apaga lançamentos e baixas, recalcula o status das duas
parcelas e apaga o registro. Auditoria `DESFAZER_REPASSE`.

**Conciliação:** sem mudança. A linha do depósito fecha em grupo com as
entradas e saídas dos repasses confirmados (soma com sinal); diferença de
centavos vai pelo "lançar diferença" que já existe.

### Proteções nos títulos da maquininha

Os títulos a receber e da taxa de pedido com operadora só são baixados pela
tela de repasses: `registrarBaixa` recusa parcela desses títulos ("Este
título é de venda na maquininha: confirme o recebimento em Repasses de
cartão").

Edição e cancelamento de parcela no financeiro ficam como hoje para qualquer
título de pedido (não há bloqueio). Por isso a confirmação só baixa a parcela
de taxa de mesmo número se ela estiver **em aberto**; cancelada ou paga, o
repasse é confirmado só com o bruto.

## Cancelamento do pedido

`situacaoParaCancelar` e `cancelarPedido` com operadora:

- **Algum repasse confirmado** (`RepasseCartaoConfirmado` em parcela do
  título): recusa — "Desfaça a confirmação dos repasses antes de cancelar".
- **Nenhum:** cancela como hoje (estoque volta) e cancela as parcelas dos
  **dois** títulos.

## Efeitos sem código novo

- **Fluxo projetado:** parcelas em aberto dos dois títulos → entrada bruta e
  saída da taxa na mesma data (o líquido). Repasse atrasado entra como
  vencido, pela regra atual.
- **Saldo e fluxo realizado:** só mudam na confirmação.
- **Relatórios de vendas (7g2a):** valor bruto e cliente do pedido; não
  mudam.

## Testes

Banco real, padrão de `pedidoVenda.test.ts` e `producaoTestFixtures.ts`.

- **Cálculo (unitário):** débito D+1; crédito 1x D+30; parcelado 3x sem
  antecipação (3 datas, +30); parcelado antecipado (1 repasse); centavos do
  bruto e da taxa na última; taxa 0.
- **Cadastro:** cria cliente e fornecedor pelo CNPJ; reaproveita existentes;
  recusa inativo; conta Caixa recusada; faixas sobrepostas recusadas.
- **Pedido:** cria os dois títulos (contrapartes, categorias, parcelas,
  números pareados) e nenhuma baixa; sem condição para a faixa recusa;
  operadora inativa ou de outra filial recusa; taxa congelada (mudar a
  condição depois não altera o pedido); taxa 0 não cria título de taxa.
- **Confirmação:** entrada bruta e saída da taxa na conta da operadora;
  parcelas pagas; confirmar duas vezes recusa (transação inteira); parcela de
  título comum recusada; `registrarBaixa` manual recusada nesses títulos.
- **Desfazer:** volta tudo; recusado depois de conciliado.
- **Cancelamento:** sem repasse confirmado cancela os dois títulos; com,
  recusa.
- **Conciliação em grupo:** linha de extrato com o líquido fecha com a
  entrada e a saída de um repasse confirmado.

Conferência no navegador no fim, com cenário por script temporário:
cadastrar operadora, vender no crédito 3x, conferir títulos e projeção,
confirmar um repasse, conciliar em grupo, desfazer, cancelar.

## Documentação

- Doc 08: D-37, D-38, D-39.
- Doc 03: **RN-35 — Venda na maquininha** (cálculo dos repasses, títulos,
  confirmação, cancelamento).
- Ajuda (`content/ajuda/passo-a-passo.md`): cadastrar operadora; vender na
  maquininha; confirmar repasses e conciliar.
- `docs/backlog.md`: remover o item.

## Fora do escopo

- Taxa fixa por transação e tarifa de antecipação separada — descartado (a
  taxa única por condição cobre o jeito como as maquininhas informam).
- Dias úteis e feriados no prazo — descartado (a data real é informada na
  confirmação; a conciliação absorve a diferença).
- Importar o arquivo de vendas da operadora e conciliar repasses sozinho —
  descartado (conveniência).
- Maquininha em títulos lançados à mão no financeiro — descartado (a
  Hortitex vende pelo pedido).
- Antecipação de recebíveis pedida pontualmente — descartado (não citada;
  reabrir se acontecer).
- Estorno/chargeback depois do repasse — descartado (desconciliar → desfazer
  → cancelar cobre).
