# Fase 7b — Recepção de fruto e estoque

Data: 2026-11-09 · Status: implementada

Segundo sub-projeto da Fase 7 (ver
[plano de entrega](../../modulos/producao-estoque-vendas/09-plano-de-entrega.md)).
Parte da fundação da 7a (cadastros, perfis, configuração). Entrega a
recepção de fruto com lote numerado, o estoque por lote com saldo por
movimentos, ajustes, etiqueta e a conta a pagar da compra de terceiro.
**Não inclui** processamento (7e) nem venda (7c).

Regras de origem: RN-01, RN-03 a RN-08, RN-15 a RN-17, RN-19, RN-25 e
RN-27 do [doc 3](../../modulos/producao-estoque-vendas/03-regras-de-negocio.md);
integração do [doc 6](../../modulos/producao-estoque-vendas/06-integracao-financeiro.md).

Decisões aplicadas:

- **D-04:** fruto próprio entra com o custo-padrão da fruta.
- **D-13:** prazo de pagamento ao produtor é um parâmetro da filial
  (padrão 0 dias), sobrescrevível em cada recepção.
- **Pagamento na hora:** a conta a pagar nasce **em aberto**. Pagamento
  automático fica para quando existir a conta Caixa (antes da 7c), valendo
  para compra e venda.
- **Correção:** recepção errada é **excluída e relançada**, só enquanto o
  lote não teve saída e a conta não foi paga. Qualidade, documento e
  observação são editáveis sempre.
- **D-15:** o local do lote pode ser trocado (lote inteiro), auditado.

## 1. Modelo

### Enums novos

```prisma
enum OrigemRecepcao       { PROPRIA TERCEIRO }
enum QualidadeFruto       { A B C }
enum StatusRecepcao       { ATIVA CANCELADA }
enum OrigemLote           { RECEPCAO PRODUCAO }
enum TipoMovimentoEstoque { ENTRADA ESTORNO_RECEPCAO AJUSTE }
enum MotivoAjusteEstoque  { VENCIDO AVARIA AMOSTRA INVENTARIO CONSUMO_INTERNO OUTRO }
```

`TipoMovimentoEstoque` ganha `CONSUMO_OP`, `VENDA` e `ESTORNO_VENDA` nas
etapas que os usam (7e, 7c), cada uma com sua migration.

### Lote

```prisma
model Lote {
  id                  String     @id @default(uuid())
  filialId            String
  codigo              String               // FA-261109-01 (RN-01), nunca muda
  codigoManual        Boolean    @default(false) // importação (7d)
  produtoId           String
  origem              OrigemLote
  data                DateTime             // recepção ou fabricação (data de calendário, UTC)
  validade            DateTime             // data + validadeDias do produto, gravada (RN-07)
  localId             String
  quantidadeInicialKg Decimal    @db.Decimal(18, 3)
  saldoKg             Decimal    @db.Decimal(18, 3) // cache dos movimentos
  custoKg             Decimal    @db.Decimal(18, 4)
  criadoEm            DateTime   @default(now())
  atualizadoEm        DateTime   @updatedAt

  @@unique([filialId, codigo])
  @@index([filialId, produtoId])
  @@index([filialId, validade])
  @@map("lotes")
}
```

Relações: `filial` (Cascade), `produto` e `local` (Restrict),
`movimentos`, `recepcao` (1:1 opcional), `ajustes`.

### Movimento de estoque (o registro que define o saldo)

```prisma
model MovimentoEstoque {
  id           String               @id @default(uuid())
  filialId     String
  loteId       String
  data         DateTime
  tipo         TipoMovimentoEstoque
  quantidadeKg Decimal              @db.Decimal(18, 3) // + entra, − sai
  ajusteId     String?              @unique
  usuarioId    String
  criadoEm     DateTime             @default(now())

  @@index([loteId])
  @@index([filialId, data])
  @@map("movimentos_estoque")
}
```

Movimentos nunca são editados nem apagados.

### Ajuste

```prisma
model AjusteEstoque {
  id           String              @id @default(uuid())
  filialId     String
  data         DateTime
  loteId       String
  quantidadeKg Decimal             @db.Decimal(18, 3) // ±, diferente de zero
  motivo       MotivoAjusteEstoque
  observacao   String?
  usuarioId    String
  criadoEm     DateTime            @default(now())

  @@index([filialId, data])
  @@map("ajustes_estoque")
}
```

### Recepção

```prisma
model RecepcaoFruto {
  id            String          @id @default(uuid())
  filialId      String
  loteId        String          @unique
  data          DateTime
  produtoId     String
  origem        OrigemRecepcao
  talhaoId      String?                 // obrigatório se PROPRIA
  fornecedorId  String?                 // obrigatório se TERCEIRO
  pesoBrutoKg   Decimal         @db.Decimal(18, 3)
  descarteKg    Decimal         @default(0) @db.Decimal(18, 3)
  precoKg       Decimal         @db.Decimal(18, 4)
  valorTotal    Decimal         @db.Decimal(18, 2)
  qualidade     QualidadeFruto?
  documento     String?                 // romaneio / NF
  observacao    String?
  safraId       String?
  tituloId      String?         @unique // conta a pagar (terceiro com valor)
  status        StatusRecepcao  @default(ATIVA)
  motivoCancelamento String?
  usuarioId     String
  criadoEm      DateTime        @default(now())
  atualizadoEm  DateTime        @updatedAt

  @@index([filialId, data])
  @@map("recepcoes_fruto")
}
```

- **`valorTotal` é gravado.** Com rasa, o preço digitado é por rasa (R$ 60)
  e o R$/kg tem dízima (4,2857…). O valor exato vem da unidade digitada
  (`rasas líquidas × preço por rasa`), e gravá-lo evita diferença de
  centavo entre a recepção e a conta a pagar. Como a recepção não é
  editável em peso e preço, o valor gravado não fica desatualizado.
- `precoKg` gravado com 4 casas é o custo/kg do lote.

### Configuração de produção (acréscimos)

```prisma
  categoriaCompraFrutoId     String?  // CategoriaFinanceira da filial (DESPESA)
  prazoPagamentoProdutorDias Int      @default(0)
```

## 2. Cálculos (funções puras, `src/lib/producao/`)

- **Conversão de unidade (RN-03):** `paraKg(qtd, fatorUnidadeKg | null)` e
  `precoPorKg(preco, fatorUnidadeKg | null)`. Sem fator, a unidade é kg.
- **Recepção (RN-04, RN-05):**
  - `liquido = bruto − descarte` (descarte ≥ 0 e ≤ bruto; líquido > 0);
  - `% descarte = descarte ÷ bruto`;
  - `valorTotal = round2(liquidoNaUnidadeDigitada × precoNaUnidadeDigitada)`.
  - Próprio: preço = `fruta.custoPadraoKg`, não digitado; o valor é
    informativo e não gera conta.
- **Validade (RN-07):** `data + validadeDias`, em dias de calendário UTC.
- **Número do lote (RN-01):** `<código>-<AAMMDD>-<NN>`, com `NN` = maior
  sequência do mesmo produto e data na filial + 1, com 2 dígitos (3 a
  partir de 100).
- **Status (RN-16):** em ordem: `ZERADO` (saldo ≤ 0) → `VENCIDO`
  (dias < 0) → `VENCENDO` (dias ≤ alerta: congelado usa
  `alertaVencimentoCongeladoDias`; in natura e resfriado usam
  `alertaVencimentoResfriadoDias`) → `OK`.
  `dias = validade − dataDeReferência`.
- **Valor em estoque (RN-17):** `max(0, saldo) × custoKg`.

## 3. Serviços

### Recepção (`recepcaoFruto.ts`)

`criarRecepcao(sessao, dados)`: exige `producao:escrever` +
`requireAlteracaoFilial`. Em **uma** `$transaction`:

1. Valida:
   - produto da empresa, ativo e da categoria FRUTO;
   - local da filial e ativo;
   - PROPRIA: talhão da filial, ativo e da mesma fruta do produto;
   - TERCEIRO: fornecedor da empresa e ativo; com valor > 0, exige
     `categoriaCompraFrutoId` configurada. Sem ela, a recepção é recusada
     com "Configure a categoria de compra de fruto em Administração →
     Configuração de produção".
2. Gera o número do lote.
3. Cria o lote e o movimento `ENTRADA` (+líquido), com
   `saldoKg = quantidadeInicialKg = líquido`.
4. Cria a recepção.
5. TERCEIRO com valor > 0: cria o título a **pagar** por
   `criarTituloInterno` (ver abaixo) e grava o `tituloId`.
6. Registra a auditoria.

Corrida na numeração: o `@@unique([filialId, codigo])` recusa o segundo
lote com o mesmo número. A criação repete a transação inteira até 3 vezes
em caso de conflito (P2002 no código do lote).

`atualizarDadosRecepcao(sessao, id, { qualidade, documento, observacao })`:
só esses campos, sempre permitidos, auditados.

`cancelarRecepcao(sessao, id, motivo)`: exige `producao:escrever`. Recusa
se:

- a recepção já está cancelada;
- o lote tem qualquer movimento além da `ENTRADA`;
- alguma parcela do título tem baixa não rejeitada.

Em uma transação:

- movimento `ESTORNO_RECEPCAO` (−saldo), que zera o lote;
- parcelas do título em `CANCELADO`;
- recepção `CANCELADA` com o motivo;
- auditoria.

O lote e seu número continuam existindo (zerados), para não reaproveitar
um número que pode estar numa etiqueta.

### Título interno (`titulo.ts`)

O núcleo de `criarTitulo` passa para
`criarTituloInterno(contexto, tipo, dados, db)`, onde `contexto` é
`{ empresaId, filialId, usuarioId }`. O núcleo cobre validação de
referências, classificação fiscal, nota duplicada, criação com parcelas e
auditoria; não checa perfil. `criarTitulo` mantém `requirePermission` +
`requireAlteracaoFilial` e chama o núcleo. Os testes de título existentes
continuam passando sem mudança.

Título da recepção:

| Campo | Valor |
|---|---|
| tipo | PAGAR |
| contraparte | fornecedor |
| documento | `documento` da recepção, ou `RF-<código do lote>` |
| emissão / competência | data da recepção |
| categoria | `categoriaCompraFrutoId` da configuração |
| safra | a da recepção, se houver |
| parcela | 1, vencimento informado (padrão: data + `prazoPagamentoProdutorDias`), valor = `valorTotal` |
| classificação | informada no formulário; padrão do fornecedor |
| comprovante | Fiscal: `NF_PRODUTOR` + número da nota (obrigatório). Gerencial: `RECIBO`. |

### Estoque (`estoque.ts`)

- `movimentarSaldo(tx, loteId, deltaKg)`: `UPDATE lotes SET saldoKg =
  saldoKg + delta WHERE id = ? AND saldoKg + delta >= 0` (via
  `updateMany`). Se nenhuma linha mudar, lança "Saldo insuficiente no
  lote <código>". É o único caminho que altera `saldoKg`, e sempre vem
  junto da criação do movimento.
- `listarLotes(filialId, filtros, dataReferencia)`:
  - filtros: produto, local, status; zerados ocultos por padrão;
  - devolve dias, status e valor;
  - ordem: validade crescente (FEFO), depois código.
- `resumoProdutoLocal(filialId)`: `groupBy` de saldo e valor por produto ×
  local, mais a capacidade e a ocupação de cada local.
- `moverLote(sessao, loteId, localId)`: `producao:escrever`; local da
  filial e ativo; auditado.

### Ajuste (`ajusteEstoque.ts`)

`criarAjuste(sessao, { loteId, data, quantidadeKg, motivo, observacao })`:
`estoque:ajustar`; quantidade ≠ 0; lote da filial. Em uma transação: o
ajuste, o movimento `AJUSTE` e `movimentarSaldo` (recusa saída maior que
o saldo); auditoria.

## 4. Telas

Seção nova **Produção** no menu (ação `producao:ler`): Recepção de fruto ·
Estoque · Ajustes de estoque.

### `/producao/recepcao`

- **Lista:**
  - filtros: período (padrão mês atual), fruta e origem;
  - colunas: data, lote, produto, origem (talhão ou fornecedor), bruto,
    descarte %, líquido, R$/kg, valor, qualidade e status ("Cancelada"
    em destaque).
  - Exportação CSV/Excel/PDF.
- **Nova recepção:** diálogo com rolagem.
  - Campos: data (hoje), produto (fruto), origem (própria ou terceiro);
    talhão (filtrado pela fruta do produto) ou fornecedor; local (padrão:
    primeiro local ativo do tipo Recepção); unidade (kg ou a unidade
    comercial do produto, quando houver); peso bruto; descarte; preço
    (terceiro); qualidade; documento; safra; observação.
  - Terceiro com valor: vencimento (data + prazo), classificação (padrão
    do fornecedor) e nº da nota do produtor quando fiscal.
  - O resumo, calculado no cliente pelas mesmas funções puras: líquido,
    % descarte, valor, custo/kg, validade.
  - O número do lote só aparece depois de salvar, porque é gerado na
    gravação.
- **Ações por linha:**
  - Etiqueta (PDF);
  - Editar (qualidade, documento, observação);
  - Excluir (pede o motivo; desabilitado com explicação quando já houve
    saída ou pagamento).

### `/producao/estoque`

- **Aba "Por lote":** filtros produto, local, status, "mostrar zerados" e
  data de referência. Colunas: lote, produto, local, data, validade, dias,
  status (badge), saldo (kg), custo/kg, valor. Ações: Etiqueta, Mover.
  Exportação.
- **Aba "Por produto e local":** kg e valor; linha por local com
  capacidade e ocupação (%).
- Abas pela URL (`?visao=lotes|resumo`), como os filtros do sistema.

### `/producao/ajustes`

- **Lista:** filtros período e motivo; colunas data, lote, produto, kg (+/−),
  motivo, observação, usuário. Exportação.
- **Novo ajuste:** lote (lista dos lotes com saldo, FEFO, com saldo e
  validade ao lado; lote zerado só para ajuste positivo de inventário),
  quantidade com sinal (entrada/saída), motivo, observação.

### Etiqueta `/producao/lotes/[id]/etiqueta`

Route Handler, PDF de uma página de 100 × 70 mm com `pdf-lib`:

- nome fantasia da empresa, descrição do produto, **lote** em destaque;
- data (fabricação ou recepção), validade, armazenamento do produto;
- peso líquido (quantidade inicial do lote, kg) e registro ADEPARA da
  configuração (omitido se vazio).

Exige `producao:ler`; lote da filial ativa.

### Configuração de produção

Card novo **Compra de fruto**: categoria financeira (lista das categorias
DESPESA ativas da filial, opcional) e prazo de pagamento ao produtor
(dias, ≥ 0).

## 5. Permissões

Sem ações novas: `producao:ler` (telas), `producao:escrever` (recepção,
cancelar, mover lote), `estoque:ajustar` (ajuste). Filial somente leitura
bloqueia toda escrita.

## 6. Fora da 7b

- "Baixar vencidos" em lote (atalho no painel, 7g); por ora, um ajuste
  por lote.
- Número manual de lote para lotes antigos (importação, 7d).
- Pagamento automático da compra de fruto (com a conta Caixa).
- Transferência parcial de lote entre locais.

## 7. Testes

**Unitários (`src/lib/producao/`):** conversão rasa ↔ kg e preço;
líquido, % descarte e valor (inclusive o exemplo da RN-03: 4 rasas a
R$ 60 = R$ 240,00); descarte > bruto recusado; validade; status nas 4
faixas e nas duas conservações; número do lote (sequência, 2 e 3
dígitos).

**Integração (Postgres real):**

- Recepção própria: lote, movimento, custo = custo-padrão da fruta, sem
  título.
- Recepção de terceiro: título PAGAR com valor, vencimento, categoria e
  comprovante corretos; perfil PRODUCAO consegue criar sem
  `titulo:escrever`.
- Falha no título (ex.: nota duplicada) não deixa lote, movimento nem
  recepção gravados.
- Sem categoria configurada: recusada com a mensagem.
- Talhão de outra fruta, produto POLPA, fornecedor de outra empresa:
  recusados.
- Duas recepções do mesmo produto e data recebem `-01` e `-02`; criação
  concorrente não duplica.
- Cancelar: zera o lote, cancela as parcelas; recusado com ajuste no lote
  ou com baixa.
- Ajuste: saída maior que o saldo recusada; duas saídas simultâneas que
  juntas passam do saldo: só uma passa.
- Invariante: `saldoKg` = soma dos movimentos, em todos os cenários.
- Status e filtros de `listarLotes`; resumo com ocupação.
- Permissões: VENDAS e CONSULTA não lançam; PRODUCAO não ajusta em
  filial somente leitura.
- Etiqueta: responde PDF; lote de outra filial dá 404.

**Navegador:** recepção em kg e em rasa, terceiro com conta a pagar
conferida em Contas a pagar, exclusão, ajuste, mover lote, etiqueta;
desktop e 390px; usuário Produção.

## 8. Migrations

Uma migration: enums, `lotes`, `movimentos_estoque`, `ajustes_estoque`,
`recepcoes_fruto`, colunas novas em `configuracoes_producao`. Nenhum dado
existente muda.
