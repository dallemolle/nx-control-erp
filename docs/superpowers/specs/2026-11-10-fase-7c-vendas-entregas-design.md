# Fase 7c — Vendas e entregas

Data: 2026-11-10 · Status: aprovada para plano

Terceiro sub-projeto da Fase 7 (ver
[plano de entrega](../../modulos/producao-estoque-vendas/09-plano-de-entrega.md)).
Parte da 7b (lotes, saldo por movimentos, título interno) e da conta Caixa
(Fase B fiscal). Entrega o pedido de venda com itens por lote, a conta a
receber criada junto (já paga quando à vista), o cancelamento com estorno,
as entregas e o recibo em PDF. **Não inclui** relatórios de venda (7g),
parcelamento, edição de itens nem emissão de NF-e.

Regras de origem: RN-02, RN-18 a RN-24, RN-26 e RN-27 do
[doc 3](../../modulos/producao-estoque-vendas/03-regras-de-negocio.md);
integração do [doc 6](../../modulos/producao-estoque-vendas/06-integracao-financeiro.md).

Decisões aplicadas:

- **D-02:** cliente sem CPF/CNPJ (já feito na 7a).
- **D-03:** lote vencido na data da venda é **bloqueado**. Quem tem
  `venda:liberarVencido` libera item a item, com motivo obrigatório,
  gravado no item e na auditoria.
- **D-11:** venda à vista (dinheiro, Pix, transferência, cartão) nasce
  **paga**: título + baixa aprovada + lançamento. Dinheiro vai para a conta
  Caixa padrão; as demais formas, para a conta de recebimento padrão.
- **D-12:** venda a prazo tem uma parcela, com vencimento informado.
- **D-16:** o pedido tem "Retira na propriedade" (padrão do cliente). Se
  desmarcado, gera uma entrega pendente.
- **Cancelar venda paga:** desfaz o recebimento que a própria venda criou
  (apaga a baixa automática e o lançamento dela). Recusado se o lançamento
  já foi conciliado com um extrato, ou se o título tem outra baixa (pendente
  ou aprovada).
- **Correção:** itens não são editados. Pedido errado é **cancelado com
  motivo e refeito**. Observação e dados da entrega são editáveis sempre.

## 1. Modelo

### Enums

```prisma
enum FormaPagamentoVenda { DINHEIRO PIX TRANSFERENCIA CARTAO A_PRAZO }
enum StatusPedidoVenda   { CONFIRMADO CANCELADO }
enum StatusEntrega       { PENDENTE EM_ROTA ENTREGUE CANCELADA }
// TipoMovimentoEstoque += VENDA, ESTORNO_VENDA
```

### Pedido

```prisma
model PedidoVenda {
  id                    String              @id @default(uuid())
  filialId              String
  numero                Int                  // sequencial por filial (RN-02)
  data                  DateTime             // data de calendário (UTC)
  clienteId             String
  canal                 CanalVenda?          // copiado do cliente, editável (RN-21)
  formaPagamento        FormaPagamentoVenda
  vencimento            DateTime?            // só A_PRAZO
  contaBancariaId       String?              // conta da baixa automática (à vista)
  retiraNaPropriedade   Boolean   @default(false)
  numeroDocumentoFiscal String?
  observacao            String?
  status                StatusPedidoVenda   @default(CONFIRMADO)
  motivoCancelamento    String?
  canceladoEm           DateTime?
  tituloId              String?   @unique    // título a RECEBER
  baixaAutomaticaId     String?   @unique    // baixa criada pela venda à vista
  usuarioId             String
  criadoEm / atualizadoEm
  @@unique([filialId, numero])
  @@index([filialId, data])
  @@map("pedidos_venda")
}
```

`baixaAutomaticaId` é FK com `onDelete: SetNull` (o cancelamento apaga a
baixa). `tituloId` é FK para `Titulo`.

### Item

```prisma
model ItemPedidoVenda {
  id                 String  @id @default(uuid())
  pedidoId           String
  loteId             String
  quantidadeKg       Decimal @db.Decimal(18, 3)
  precoKg            Decimal @db.Decimal(18, 4)
  custoKg            Decimal @db.Decimal(18, 4) // custo do lote na venda (RN-22)
  motivoLiberacaoVencido String?                 // D-03: só se o lote estava vencido
  @@index([pedidoId])
  @@index([loteId])
  @@map("itens_pedido_venda")
}
```

Um mesmo lote não aparece duas vezes no pedido.

`MovimentoEstoque` ganha `itemPedidoId String?` (FK). A venda grava um
movimento `VENDA` (−kg) por item; o cancelamento grava `ESTORNO_VENDA`
(+kg) por item. O ledger nunca é apagado.

### Entrega

```prisma
model Entrega {
  pedidoId       String        @id
  dataPrevista   DateTime
  dataRealizada  DateTime?
  endereco       String?       // padrão: enderecoEntrega do cliente
  responsavel    String?
  recebidoPor    String?
  observacao     String?
  status         StatusEntrega @default(PENDENTE)
  atualizadoEm   DateTime      @updatedAt
  @@index([status, dataPrevista])
  @@map("entregas")
}
```

Existe só para pedido com `retiraNaPropriedade = false`.

### Configuração de produção (acréscimos)

| Campo | Regra |
|---|---|
| `categoriaVendaId String?` | Categoria RECEITA da filial. FK SetNull. |
| `contaRecebimentoPadraoId String?` | Conta ativa da filial, **não** Caixa. Usada por Pix, transferência e cartão. FK SetNull. |
| `contaCaixaPadraoId String?` | Conta ativa da filial do tipo **CAIXA**. Usada por dinheiro. FK SetNull. |

Mensagens quando faltam:
- "Configure a categoria de venda em Administração → Configuração de produção"
- "Configure a conta de recebimento padrão em Administração → Configuração de produção" (só para Pix/transferência/cartão sem conta escolhida no pedido)
- "Configure a conta Caixa padrão em Administração → Configuração de produção" (só para dinheiro sem conta escolhida)

## 2. Cálculos (funções puras, `src/lib/producao/venda.ts`)

- `calcularItem({ quantidadeKg, precoKg, custoKg })` →
  `{ valor, custo, margem }`, arredondados a 2 casas no fim (RN-22).
- `calcularPedido(itens)` → somas de valor, custo e margem, e margem %
  (0 quando o valor é 0).
- `atrasoEntregaDias({ status, dataPrevista, dataRealizada }, hoje)` →
  ENTREGUE: `realizada − prevista`; PENDENTE/EM_ROTA: `hoje − prevista`;
  CANCELADA: `null`. Nunca negativo (RN-24).
- `situacaoPagamento(parcelas)` → `PAGO | EM_ABERTO | VENCIDO | CANCELADO`,
  lida do título (RN-26).
- A quantidade digitada em unidade comercial (rasa) vira kg com `paraKg`
  (7b).

## 3. Serviços

### Baixa (`baixa.ts`)

Extrair de `aprovarBaixa` a parte que aprova e gera o lançamento:
`efetivarBaixa(tx, contexto, baixaId)` (sem checar perfil), chamada por
`aprovarBaixa` (que continua checando `titulo:aprovar`) e pela venda. O
lançamento continua com `conciliado: conta.tipo === "CAIXA"`.

### Venda (`pedidoVenda.ts`)

**`criarPedido(sessao, dados)`** — `venda:escrever` + filial com alteração.
Numa transação:
1. Valida cliente (empresa), conta (filial, ativa) e configuração (categoria
   de venda; conta conforme a forma, se o pedido não trouxer uma).
   Dinheiro exige conta do tipo CAIXA; Pix/transferência/cartão exigem
   conta que **não** seja CAIXA.
2. Para cada item: lote da filial, recepção não cancelada, sem lote
   repetido. Lote vencido na data do pedido (`validade < data`) →
   "O lote X venceu em dd/mm/aaaa", salvo `venda:liberarVencido` **e**
   `motivoLiberacaoVencido` preenchido. Motivo enviado sem lote vencido é
   descartado.
3. Número: `max(numero) + 1` na filial, com retry em P2002 (até 3), como o
   código de lote da 7b.
4. Cria pedido e itens (`custoKg` = `lote.custoKg`); para cada item,
   `registrarMovimento` tipo `VENDA` com `−kg` (saldo insuficiente → "Saldo
   insuficiente no lote X").
5. Título a receber via `criarTituloInterno`: contraparte = cliente,
   documento = nº da NF ou `PV-<numero>`, emissão/competência = data,
   categoria de venda, uma parcela (vencimento = data à vista, ou o
   informado a prazo), valor = soma dos itens. Classificação: a do pedido;
   senão a padrão do cliente; senão FISCAL/NF-e com nº da nota, ou
   GERENCIAL/Recibo sem.
6. À vista: cria a baixa (valor total, data do pedido, conta do pedido) e
   chama `efetivarBaixa`; grava `baixaAutomaticaId`.
7. `retiraNaPropriedade = false` → cria a entrega (data prevista padrão =
   data do pedido; endereço padrão = do cliente).
8. Auditoria `CRIAR` do pedido, incluindo itens e liberações de vencido.

**`situacaoParaCancelar(pedido)`** → `{ pode: true } | { pode: false, motivo }`:
já cancelado; título com baixa que não é a automática (pendente ou
aprovada) → "O financeiro registrou um recebimento neste pedido";
lançamento da baixa automática ligado a uma linha de extrato → "O
recebimento já foi conciliado com o extrato. Desconcilie na Conciliação
antes de cancelar".

**`cancelarPedido(sessao, id, motivo)`** — `venda:cancelar` + filial com
alteração; motivo obrigatório. Numa transação: rechecar
`situacaoParaCancelar`; apagar lançamento e baixa automáticos; parcelas
do título `CANCELADO` (mesma regra da 7b); `ESTORNO_VENDA` por item; entrega
`CANCELADA`; pedido `CANCELADO` com motivo e data; auditoria `CANCELAR`.

**`atualizarDadosPedido(sessao, id, { observacao })`** — `venda:escrever`.

**`listarPedidos(filialId, filtros)`** — período, cliente, status,
situação de pagamento; devolve totais (valor, custo, margem) e situação.

**`obterPedido(filialId, numero)`** — cabeçalho, itens com lote e produto,
título com parcelas, entrega.

**`lotesParaVenda(filialId, data)`** — lotes com saldo > 0, recepção não
cancelada, ordem FEFO, com produto (unidade comercial, fator, preço de
referência), custo/kg, validade e flag de vencido na data.

### Entrega (`entrega.ts`)

- `atualizarEntrega(sessao, pedidoId, dados)` — `venda:escrever`. Campos:
  data prevista, endereço, responsável, observação, status (PENDENTE,
  EM_ROTA, ENTREGUE). ENTREGUE exige data realizada (padrão hoje) e aceita
  "recebido por". Entrega cancelada não muda. Auditoria `ATUALIZAR`.
- `listarEntregas(filialId, filtros)` — status (padrão: pendente + em rota),
  período da data prevista; com atraso calculado.

### Configuração (`configuracaoProducao.ts`)

Valida os três campos novos: categoria RECEITA da filial; conta de
recebimento ativa da filial e não CAIXA; conta Caixa ativa da filial e
CAIXA.

## 4. Telas (menu novo **Vendas**, `venda:ler`)

### `/vendas/pedidos`
Lista: nº, data, cliente, canal, forma, valor, margem, situação de
pagamento, status, entrega. Filtros (barra da 7b): período (padrão mês
atual), cliente, status, situação. Exportação CSV, Excel e PDF. Botão
**Novo pedido** (`venda:escrever` + filial com alteração).

### `/vendas/pedidos/novo`
Página (não diálogo), boa no celular. Cabeçalho: data (hoje), cliente
(ao escolher, preenche canal, classificação e "retira"), canal, forma de
pagamento, conta (pré-selecionada pela forma; só à vista), vencimento (só a
prazo), classificação fiscal e nº da nota, retira na propriedade, data
prevista e endereço da entrega (se não retira), observação.
Itens: lote (lista FEFO com produto, saldo e validade; vencido marcado),
quantidade em kg ou na unidade do produto, preço/kg (sugestão: preço de
referência), motivo da liberação (só para lote vencido e quem pode
liberar). Cada linha mostra valor, custo e margem; o rodapé, os totais.
Selects controlados (lição da 7b). Ao salvar, vai para o detalhe do
pedido.

### `/vendas/pedidos/[numero]`
Cabeçalho, itens com margem, situação do pagamento (do título, com link
para Contas a receber), entrega (editar / marcar em rota / entregue),
observação editável, **Recibo (PDF)**, **Cancelar** (com motivo; botão
desabilitado com o motivo quando não pode).

### `/vendas/pedidos/[numero]/recibo`
PDF A4: empresa, nº e data, cliente, itens (produto, lote, kg, preço/kg,
valor), total, forma de pagamento, situação, "CANCELADO" em destaque se
cancelado.

### `/vendas/entregas`
Lista: data prevista, nº do pedido, cliente, endereço, responsável,
status, atraso (dias, destacado quando > 0). Filtros: status e período.
Ações na linha: em rota, entregue (data e recebido por), editar.
Exportação CSV, Excel e PDF.

### Configuração de produção
Card "Vendas": categoria de venda, conta de recebimento padrão, conta
Caixa padrão.

## 5. Permissões

Sem mudanças na matriz da 7a: `venda:ler` (todos), `venda:escrever`
(ADMIN, VENDAS, FINANCEIRO), `venda:cancelar` (ADMIN, FINANCEIRO),
`venda:liberarVencido` (ADMIN, GESTOR). O perfil VENDAS cria pedido, título
e baixa automática sem `titulo:escrever` nem `titulo:aprovar`.

## 6. Fora da 7c

Relatórios de venda e painel (7g); parcelamento; edição de itens;
emissão de NF-e; venda parcial de entrega; importação das vendas da
planilha (7d); rastreabilidade (7f).

## 7. Testes

Unitários (`venda.ts`): item e pedido (arredondamento, margem % com valor
0), atraso (entregue, pendente, cancelada, nunca negativo), situação de
pagamento.

Integração (Postgres real):
- Pedido a prazo: número 1, depois 2; estoque baixado; movimento VENDA por
  item; `custoKg` = do lote; título RECEBER com uma parcela no vencimento
  informado, documento `PV-1`, categoria de venda; sem baixa.
- Pedido em dinheiro: baixa aprovada + lançamento conciliado na conta
  Caixa; parcela PAGO. Pix: lançamento não conciliado na conta de
  recebimento.
- Recusas: sem categoria; sem conta configurada; dinheiro em conta não
  Caixa e Pix em conta Caixa; kg acima do saldo (nada gravado); lote
  repetido; lote de recepção cancelada; lote de outra filial.
- Lote vencido: recusado; aceito com `venda:liberarVencido` + motivo, que
  fica no item; sem motivo, recusado mesmo com a permissão.
- Numeração simultânea: dois pedidos em paralelo recebem números distintos.
- Classificação: herdada do cliente; sem padrão, FISCAL com nº de nota e
  GERENCIAL sem.
- Entrega criada só sem "retira"; atualizar para ENTREGUE grava data;
  cancelada não muda.
- Cancelar: a prazo sem baixa → estoque volta (ESTORNO_VENDA), parcelas
  CANCELADO, entrega CANCELADA; à vista → baixa e lançamento apagados;
  recusado com baixa manual do financeiro e com lançamento conciliado com
  extrato; recusado sem `venda:cancelar` e sem motivo.
- Perfil VENDAS cria pedido à vista com baixa (sem `titulo:*`).
- `aprovarBaixa` continua passando nos testes existentes após a extração.

Navegador: pedido a prazo e em dinheiro, lote vencido bloqueado e liberado
pelo admin, cancelamento, entrega, recibo, exportações, tela de 390 px,
perfil VENDAS.

## 8. Migrations

Uma migration `fase_7c_vendas`: enums, `TipoMovimentoEstoque` += `VENDA`,
`ESTORNO_VENDA`, tabelas `pedidos_venda`, `itens_pedido_venda`,
`entregas`, coluna `itemPedidoId` em `movimentos_estoque`, três colunas em
`configuracoes_producao`. Só cria; nada existente muda de dado.
