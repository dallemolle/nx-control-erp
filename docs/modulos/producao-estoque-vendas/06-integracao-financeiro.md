# 6. Integração com o financeiro

Na planilha, a venda guarda "Pago / A receber" na própria linha, e a compra
de fruto de terceiro só aparece como "valor" na recepção. Nenhuma das duas
chega a contas a receber ou a pagar, conciliação, fluxo de caixa ou
dashboard. No sistema, as duas viram **títulos** do módulo financeiro que
já existe. Assim o financeiro continua com uma fonte única de verdade, e
fluxo de caixa, orçamento, comparação entre safras, fiscal × gerencial e o
dashboard passam a enxergar produção e vendas sem código novo.

## Princípio

O módulo de vendas e produção **cria e cancela** títulos. Ele **não
baixa, não aprova e não concilia**: isso continua com o financeiro, salvo a
exceção da venda à vista (D-11). O status de pagamento de um pedido é lido
do título (RN-26).

Tecnicamente, `criarTitulo` já aceita um cliente de transação (`db`), então
a criação do título acontece **na mesma transação** do pedido ou da
recepção: ou os dois são gravados, ou nenhum. Como `criarTitulo` exige
`titulo:escrever`, que os perfis PRODUCAO e VENDAS não têm, o
desenvolvimento extrai o núcleo para uma função interna
(`criarTituloInterno(db, dados)`, sem checagem de perfil). Ela é chamada
por `criarTitulo`, que mantém a checagem, e pelos serviços de venda e de
recepção, que checam `venda:escrever` / `producao:escrever`. Validações,
classificação fiscal e auditoria ficam num só lugar.

## Venda → título a RECEBER

| Campo do título | Origem |
|---|---|
| tipo | `RECEBER` |
| contraparte | `pedido.clienteId` |
| documento | `PV-<nº do pedido>` (ou o nº da NF, quando houver) |
| dataEmissao / dataCompetencia | data do pedido |
| categoriaFinanceiraId | categoria de venda configurada na filial (ver abaixo) |
| safraId | opcional: safra informada no pedido ou herdada dos lotes de fruto |
| parcelas | à vista: 1 parcela, vencimento = data do pedido. A prazo: 1 parcela, vencimento informado (parcelamento: D-12). |
| valor | soma dos itens (`kg × preço`) |
| classificação fiscal | padrão do cliente (`classificacaoFiscalPadrao`, já existe); o pedido pode sobrescrever. Venda de balcão sem nota → **GERENCIAL / Recibo**; polpa para varejo com NF-e → **FISCAL / NF-e** + nº. |

**Editar pedido:** enquanto o título não tiver baixa, mudar os itens
recalcula o valor da parcela. Com baixa, o pedido fica travado: para
corrigir, cancela e refaz.

**Cancelar pedido** (`venda:cancelar`): devolve o saldo aos lotes
(movimento `ESTORNO_VENDA`) e cancela o título (parcelas `CANCELADO`). Se
houver baixa aprovada, o cancelamento é recusado até o financeiro estornar
a baixa. É a mesma regra que o financeiro já aplica a títulos pagos.

### Venda à vista já paga (Pix ou dinheiro): D-11

As 29 vendas lançadas na planilha são todas "Pago", via Pix ou dinheiro. Se
o título nascer em aberto, o financeiro precisa baixar cada venda à mão.
Proposta:

- **Pix / transferência / cartão:** o pedido informa a conta bancária
  (padrão configurado na filial). O sistema cria o título **e** uma baixa
  já aprovada, que gera o lançamento bancário (mesmo caminho de
  `aprovarBaixa`). A conciliação com o extrato continua com o financeiro.
- **Dinheiro:** depende da conta "Caixa" (Fase B do
  `PLANO_IMPLEMENTACAO_FISCAL_GERENCIAL.md`, **ainda não implementada**).
  Até ela existir, a venda em dinheiro nasce com título em aberto e o
  financeiro baixa. Recomendação: implementar a Fase B antes ou junto do
  sub-projeto de vendas (doc 9).

A baixa automática pula a etapa de aprovação, por isso precisa da decisão
do usuário (D-11).

## Recepção de terceiro → título a PAGAR

| Campo do título | Origem |
|---|---|
| tipo | `PAGAR` |
| contraparte | `recepcao.fornecedorId` |
| documento | romaneio / NF da recepção (ou `RF-<lote>` se vazio) |
| dataEmissao / dataCompetencia | data da recepção |
| categoriaFinanceiraId | categoria de compra de fruto configurada na filial |
| valor | `peso líquido × preço/kg` (RN-05) |
| vencimento | data da recepção + prazo padrão do produtor (D-13) |
| classificação fiscal | padrão do fornecedor. Produtor rural com nota → **FISCAL / NF_PRODUTOR** (o tipo já existe); sem nota → **GERENCIAL / Recibo**. |

Recepção **própria** (talhão) não gera título: não há pagamento. O custo do
fruto próprio é uma decisão em aberto (D-04).

Editar a recepção (peso, preço) atualiza a parcela enquanto ela não tiver
baixa. Excluir a recepção só é possível se o lote não tiver saída e o
título não tiver baixa.

## Insumos da OP

**Não** geram título. São custo de produção (rateio no custo/kg da polpa),
não compra. A compra de embalagem, energia etc. continua sendo um título a
pagar comum no financeiro, como hoje. Na v1 não há estoque de insumos
(D-14).

## Configuração financeira da produção (por filial)

Campos a acrescentar em `ConfiguracaoProducao` (doc 4):

| Campo | Uso |
|---|---|
| `categoriaVendaId` | Categoria dos títulos a receber gerados por venda. |
| `categoriaCompraFrutoId` | Categoria dos títulos a pagar gerados por recepção de terceiro. |
| `contaRecebimentoPadraoId` | Conta da baixa automática de venda à vista (Pix etc.). |
| `prazoPagamentoProdutorDias` | Vencimento padrão da compra de fruto (D-13). |

Sem a categoria configurada, a venda ou a recepção de terceiro é recusada
com uma mensagem clara ("configure a categoria de venda em Administração →
Configuração de produção").

## O que o financeiro passa a ver sem mudança de código

- **Contas a receber/pagar:** os títulos gerados, filtráveis por
  classificação, safra e categoria.
- **Fluxo de caixa projetado:** vendas a prazo e compras de fruto em aberto.
- **Fluxo de caixa realizado:** depois de baixa e conciliação.
- **Orçamento:** realizado da categoria de venda e de compra de fruto.
- **Comparação entre safras:** se a safra for informada.
- **Fiscal × gerencial:** % de vendas e compras sem nota, pendências
  fiscais (ex.: NF-e de venda sem chave de acesso).
- **Dashboard executivo:** contas a receber, inadimplência, geração de caixa.
