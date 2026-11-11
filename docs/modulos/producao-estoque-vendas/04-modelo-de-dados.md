# 4. Modelo de dados (proposta)

Rascunho para revisão. **Não é o schema final**: cada sub-projeto (doc 9)
confirma os campos no seu spec antes da migration. Segue as convenções do
projeto (ver `docs/fases/fase-1-fundacao.md`):

- **IDs e escopo:** IDs uuid; `empresaId` ou `filialId` em toda entidade;
  `criadoEm`/`atualizadoEm`.
- **Tabelas:** nomes em snake_case no plural (`@@map`).
- **Números:** dinheiro em `Decimal(18,2)`; **quantidade em kg em
  `Decimal(18,3)`**; custo por kg em `Decimal(18,4)`, para não perder
  centavos em R$ 60/14.
- **Auditoria:** toda escrita é auditada (`registrarAuditoria`).

## Decisão de escopo: o que é da empresa e o que é da filial

| Nível | Entidades | Por quê |
|---|---|---|
| **Empresa** | Fruta, Produto, Insumo, Cliente\*, Fornecedor\* | Catálogo único: permite somar vendas e estoque entre filiais. Evita repetir o problema de categoria e centro de custo, cadastrados por filial e impossíveis de consolidar (ver `docs/backlog.md`, Dashboard executivo). |
| **Filial** | Talhão, Local de armazenamento, Configuração de produção, Recepção, Lote, Movimento de estoque, OP, Ajuste, Pedido de venda, Entrega | Estoque físico, câmaras, talhões e registro ADEPARA são do estabelecimento. Numeração de lote, OP e pedido é por filial. |

\* Já existem e já são por empresa.

## Diagrama

```
Fruta 1─* Produto 1─* Lote *─1 LocalArmazenamento
  │                    │ ▲
  │                    │ └── origem: RecepcaoFruto (fruto)  ou  ProducaoOP (polpa)
  1─* Talhao           │
                       1─* MovimentoEstoque  (ENTRADA | CONSUMO_OP | VENDA | ESTORNO_VENDA | AJUSTE)
                                │          │            │
RecepcaoFruto ─1:1─ Lote        │          │            └─ AjusteEstoque
  ├─ origem PROPRIA → Talhao    │          └─ ItemPedidoVenda *─1 PedidoVenda 1─1 Entrega
  └─ origem TERCEIRO → Fornecedor + Titulo(PAGAR)?          │
                                │                            ├─ Cliente
OrdemProducao 1─* ConsumoOP ────┘ (lote de fruto)            └─ Titulo(RECEBER)
              1─* ProducaoOP ─1:1─ Lote (polpa)
              1─* InsumoOP *─1 Insumo
```

## Enums novos

```prisma
enum CategoriaProduto       { FRUTO POLPA }
enum Conservacao            { IN_NATURA RESFRIADO CONGELADO }
enum TipoLocalArmazenamento { CAMARA_FRIA FREEZER REFRIGERADOR RECEPCAO OUTRO }
enum OrigemRecepcao         { PROPRIA TERCEIRO }
enum QualidadeFruto         { A B C }
enum CanalVenda             { BATEDOR ATACADO VAREJO RESTAURANTE INDUSTRIA CONSUMIDOR_FINAL OUTRO }
enum FormaPagamentoVenda    { PIX DINHEIRO TRANSFERENCIA BOLETO CARTAO PRAZO }
enum StatusPedidoVenda      { CONFIRMADO CANCELADO }
enum StatusEntrega          { PENDENTE EM_ROTA ENTREGUE CANCELADA }
enum MotivoAjusteEstoque    { VENCIDO AVARIA AMOSTRA INVENTARIO CONSUMO_INTERNO OUTRO }
enum StatusOrdemProducao    { ABERTA ENCERRADA CANCELADA }
enum OrigemLote             { RECEPCAO PRODUCAO }
enum TipoMovimentoEstoque   { ENTRADA CONSUMO_OP VENDA ESTORNO_VENDA AJUSTE }
```

Os rótulos em português da planilha ("Batedor / ponto de açaí" etc.) ficam
num mapa de rótulos, como `ROTULOS_TIPO_COMPROVANTE` em
`src/lib/schemas/enums.ts`.

## Cadastros

```prisma
model Fruta {
  id                   String  @id @default(uuid())
  empresaId            String
  nome                 String               // Açaí, Acerola
  exigeBranqueamento   Boolean @default(false) // RN-12: hoje só açaí
  ativo                Boolean @default(true)
  @@unique([empresaId, nome])
  @@map("frutas")
}

model Produto {
  id                  String           @id @default(uuid())
  empresaId           String
  codigo              String           // FA, AGC… prefixo do nº de lote (RN-01)
  descricao           String
  categoria           CategoriaProduto
  frutaId             String
  conservacao         Conservacao
  validadeDias        Int
  precoReferenciaKg   Decimal?         @db.Decimal(18, 4)
  armazenamento       String?          // "-18 °C", "0 a 5 °C" — vai para a etiqueta
  unidadeComercial    String?          // "rasa" (RN-03)
  fatorUnidadeKg      Decimal?         @db.Decimal(18, 3) // 14
  ativo               Boolean          @default(true)
  @@unique([empresaId, codigo])
  @@map("produtos")
}

model Talhao {
  id          String  @id @default(uuid())
  filialId    String
  nome        String
  frutaId     String           // "Cultura"
  areaHa      Decimal @db.Decimal(10, 2)
  anoPlantio  Int?
  espacamento String?
  observacao  String?
  ativo       Boolean @default(true)
  @@unique([filialId, nome])
  @@map("talhoes")
}

model LocalArmazenamento {
  id           String                 @id @default(uuid())
  filialId     String
  nome         String
  tipo         TipoLocalArmazenamento
  temperatura  String?
  capacidadeKg Decimal?               @db.Decimal(18, 3) // ocupação (REL_ESTOQUE)
  ativo        Boolean                @default(true)
  @@unique([filialId, nome])
  @@map("locais_armazenamento")
}

model Insumo {
  id             String  @id @default(uuid())
  empresaId      String
  nome           String
  unidade        String           // un, kWh, h…
  custoUnitario  Decimal @db.Decimal(18, 4) // referência; a OP grava o custo do dia (RN-13)
  ativo          Boolean @default(true)
  @@unique([empresaId, nome])
  @@map("insumos")
}

model ConfiguracaoProducao {           // 1 por filial (aba CONFIG)
  filialId                       String  @id
  registroAdepara                String?
  alertaVencimentoCongeladoDias  Int     @default(30)
  alertaVencimentoResfriadoDias  Int     @default(1)
  branqueamentoTemperaturaMinC   Decimal @default(80) @db.Decimal(5, 1)
  branqueamentoTempoMinS         Int     @default(10)
  toleranciaBalancoMassa         Decimal @default(0.03) @db.Decimal(5, 4)
  @@map("configuracoes_producao")
}
```

### Ajustes em cadastros existentes

| Model | Mudança | Motivo |
|---|---|---|
| `Cliente` | + `canalVenda CanalVenda?`, `municipio String?`, `enderecoEntrega String?`, `retiraNaPropriedade Boolean @default(false)` | Relatório por canal e entregas. |
| `Cliente` | `cnpjCpf` **opcional** (a confirmar, D-02) | Consumidor final e "Clientes diversos" não têm documento. No Postgres, `@@unique([empresaId, cnpjCpf])` aceita vários nulos. |
| `Fornecedor` | + `municipio String?` | Relatório de origem. |

O tipo "Próprio" do fornecedor some: a origem própria passa a ser o talhão
(RN-06).

## Estoque

```prisma
model Lote {
  id                  String     @id @default(uuid())
  filialId            String
  codigo              String               // FA-260927-01 (RN-01) — imutável
  codigoManual        Boolean    @default(false)
  produtoId           String
  origem              OrigemLote
  data                DateTime             // recepção ou fabricação
  validade            DateTime             // gravada (RN-07)
  localId             String
  quantidadeInicialKg Decimal    @db.Decimal(18, 3)
  saldoKg             Decimal    @db.Decimal(18, 3) // cache do ledger (ver abaixo)
  custoKg             Decimal    @db.Decimal(18, 4) // RN-05 / RN-13
  @@unique([filialId, codigo])
  @@index([filialId, produtoId])
  @@index([filialId, validade])  // FEFO (RN-27) e alertas
  @@map("lotes")
}

model MovimentoEstoque {               // ledger: a verdade sobre o saldo (RN-15)
  id              String               @id @default(uuid())
  filialId        String
  loteId          String
  data            DateTime
  tipo            TipoMovimentoEstoque
  quantidadeKg    Decimal              @db.Decimal(18, 3) // + entra, − sai
  consumoOpId     String?
  itemPedidoId    String?
  ajusteId        String?
  usuarioId       String
  criadoEm        DateTime             @default(now())
  @@index([loteId])
  @@index([filialId, data])
  @@map("movimentos_estoque")
}

model AjusteEstoque {
  id            String              @id @default(uuid())
  filialId      String
  data          DateTime
  loteId        String
  quantidadeKg  Decimal             @db.Decimal(18, 3) // ±
  motivo        MotivoAjusteEstoque
  observacao    String?
  usuarioId     String
  @@map("ajustes_estoque")
}
```

**Saldo: ledger e cache.** Cada movimento é uma linha imutável, que serve
de histórico e de auditoria. `Lote.saldoKg` é atualizado **na mesma
transação** com um `UPDATE … SET saldoKg = saldoKg - x WHERE id = ? AND
saldoKg >= x`. Se nenhuma linha for afetada, o saldo era insuficiente e a
operação é recusada (RN-19), sem corrida entre dois usuários. Um teste de
integração garante que `saldoKg = soma(movimentos)` (mesmo cuidado já
tomado no saldo bancário).

## Recepção

```prisma
model RecepcaoFruto {
  id             String         @id @default(uuid())
  filialId       String
  loteId         String         @unique   // o lote de fruto que ela cria
  data           DateTime
  produtoId      String                   // categoria FRUTO
  origem         OrigemRecepcao
  talhaoId       String?                  // obrigatório se PROPRIA
  fornecedorId   String?                  // obrigatório se TERCEIRO
  pesoBrutoKg    Decimal        @db.Decimal(18, 3)
  descarteKg     Decimal        @default(0) @db.Decimal(18, 3)
  precoKg        Decimal        @default(0) @db.Decimal(18, 4)
  qualidade      QualidadeFruto?
  documento      String?                  // romaneio / NF
  observacao     String?
  safraId        String?                  // opcional: liga à comparação entre safras
  tituloId       String?        @unique   // conta a pagar (terceiro), doc 6
  @@index([filialId, data])
  @@map("recepcoes_fruto")
}
```

`pesoLiquido`, `% descarte` e `valor` são calculados, não gravados
(RN-04, RN-05).

## Processamento

```prisma
model OrdemProducao {
  id                        String              @id @default(uuid())
  filialId                  String
  numero                    String              // OP-260927-01 (RN-02)
  data                      DateTime
  frutaId                   String
  responsavel               String?
  branqueamentoTemperaturaC Decimal?            @db.Decimal(5, 1)
  branqueamentoTempoS       Int?
  aguaLitros                Decimal             @default(0) @db.Decimal(18, 3)
  carocoResiduoKg           Decimal             @default(0) @db.Decimal(18, 3)
  perdaKg                   Decimal             @default(0) @db.Decimal(18, 3)
  observacao                String?
  status                    StatusOrdemProducao @default(ABERTA)
  // gravados ao encerrar (RN-13):
  custoFrutoTotal           Decimal?            @db.Decimal(18, 2)
  custoInsumosTotal         Decimal?            @db.Decimal(18, 2)
  custoKgPolpa              Decimal?            @db.Decimal(18, 4)
  @@unique([filialId, numero])
  @@map("ordens_producao")
}

model ConsumoOP {                       // PROC_CONSUMO
  id              String  @id @default(uuid())
  ordemProducaoId String
  loteId          String                       // lote de FRUTO, mesma fruta (RN-14)
  quantidadeKg    Decimal @db.Decimal(18, 3)
  custoKg         Decimal @db.Decimal(18, 4)   // custo do lote no momento
  @@map("consumos_op")
}

model ProducaoOP {                      // PROC_PRODUCAO
  id              String  @id @default(uuid())
  ordemProducaoId String
  loteId          String  @unique              // o lote de POLPA que ela cria
  produtoId       String                       // categoria POLPA, mesma fruta
  quantidadeKg    Decimal @db.Decimal(18, 3)
  embalagens      Int?
  localId         String
  @@map("producoes_op")
}

model InsumoOP {                        // PROC_INSUMOS
  id              String  @id @default(uuid())
  ordemProducaoId String
  insumoId        String
  quantidade      Decimal @db.Decimal(18, 3)
  custoUnitario   Decimal @db.Decimal(18, 4)   // congelado no lançamento (D-05)
  @@map("insumos_op")
}
```

Rendimento, balanço (kg, %, status) e status do branqueamento são
**calculados** a partir desses campos (RN-10 a RN-12), sem colunas
gravadas que possam ficar desatualizadas.

**Ciclo de vida da OP:** `ABERTA`, enquanto consumo, produção e insumos são
lançados; cada linha movimenta o estoque na hora e os lotes de polpa já
existem, com custo provisório, mas **bloqueados para venda e ajuste**
(D-07) → `ENCERRADA` (grava os custos e o `custoKg` final dos lotes de
polpa, que ficam liberados; pode ser **reaberta** se nenhum lote da OP
teve saída) → `CANCELADA` (estorna consumos e zera a polpa, só se nenhum
lote da OP tiver saída). Detalhes na
[spec da 7e](../../superpowers/specs/2026-11-10-fase-7e-processamento-design.md).

## Vendas e entregas

```prisma
model PedidoVenda {
  id                 String              @id @default(uuid())
  filialId           String
  numero             Int                 // sequencial por filial (RN-02)
  data               DateTime
  clienteId          String
  canal              CanalVenda?         // gravado do cliente (RN-21)
  formaPagamento     FormaPagamentoVenda
  status             StatusPedidoVenda   @default(CONFIRMADO)
  motivoCancelamento String?
  observacao         String?
  tituloId           String?             @unique // título a RECEBER (doc 6)
  @@unique([filialId, numero])
  @@index([filialId, data])
  @@map("pedidos_venda")
}

model ItemPedidoVenda {
  id           String  @id @default(uuid())
  pedidoId     String
  loteId       String
  quantidadeKg Decimal @db.Decimal(18, 3)
  precoKg      Decimal @db.Decimal(18, 4)
  custoKg      Decimal @db.Decimal(18, 4) // gravado na venda (RN-22)
  @@map("itens_pedido_venda")
}

model Entrega {                         // 1 por pedido (ENTREGAS)
  pedidoId          String        @id
  dataPrevista      DateTime?
  dataRealizada     DateTime?
  endereco          String?       // padrão: endereço de entrega do cliente
  responsavel       String?       // pessoa / veículo
  status            StatusEntrega @default(PENDENTE)
  recebidoPor       String?
  observacao        String?
  @@map("entregas")
}
```

Valor, custo e margem do item e do pedido são calculados (RN-22). O status
de pagamento vem do título (RN-26).

## Relações com o que já existe

| Existente | Como é usado |
|---|---|
| `Filial`, `Empresa` | Escopo de tudo, como no resto do sistema. |
| `Cliente`, `Fornecedor` | Contraparte da venda e da recepção de terceiro. Ajustes de campos acima. |
| `Titulo` / `Parcela` / `Baixa` | Venda gera título a **receber**; recepção de terceiro gera título a **pagar** (doc 6). |
| `CategoriaFinanceira` | A filial escolhe, na configuração, a categoria de "Venda de fruto/polpa" e a de "Compra de fruto" usadas nos títulos gerados. |
| `Safra` | Opcional na recepção e propagado ao título (comparação entre safras). |
| `AuditLog` | Todas as escritas. |
| `Usuario` | `usuarioId` nos movimentos. Responsável da OP é texto livre (pode não ser usuário do sistema). |
