# DOCTO_IMPLEMENT_PROD-VEND — Módulo de Controle de Produção e Vendas

> **Blueprint de implementação para o Claude Code.**
> Origem funcional: planilha `Hortitex - Controle produção e vendas V1.4.3.xlsx` (26 abas, Excel 365 sem macros).
> Alvo técnico: repositório `nx-control-erp` (Next.js 16 App Router · TypeScript · Prisma 7 + PostgreSQL · Auth.js v5 · shadcn/ui (base-nova) · Zod 4 · Vitest · Vercel/Neon).
> Data da análise: 02/11/2026 — baseado no commit `723f337` (branch atual) e nas 17 migrations existentes até `20260918000000_add_identidade_visual_empresa`.
>
> **Revisão 1.1 (03/11/2026) — PRÉ-REQUISITO:** implementar antes o recurso de classificação **Fiscal × Gerencial** (`PLANO_IMPLEMENT_FISCAL-GERENCIAL.md`). Este documento passa a usar os enums `ClassificacaoFiscal` e `TipoComprovante`, os campos fiscais de `Titulo`, o `classificacaoFiscalPadrao` de `Cliente`/`Fornecedor` e as funções `validarComprovante`/`resolverClassificacao`/`whereParcelaPorClassificacao` de `src/server/services/classificacaoFiscal.ts`, criados por aquele plano. Os trechos alterados nesta revisão estão marcados com **[FG]**.

**Antes de escrever qualquer código, o Claude Code deve:**

1. Ler `AGENTS.md` — esta versão do Next.js tem breaking changes; consultar `node_modules/next/dist/docs/` antes de usar APIs de rota (ex.: `params`/`searchParams` são `Promise`, como já feito em `financeiro/contas-a-receber/page.tsx`).
2. Ler os arquivos-modelo citados neste documento (seção 4.3 e Apêndice B) e **copiar o padrão**, não inventar um novo.
3. Respeitar as regras "Zero Breaking Changes" (seção 5.2): nenhuma coluna, tabela, enum, rota ou assinatura existente é alterada — somente adições.

---

## 1. Visão Geral do Módulo

### 1.1 Objetivo

Levar para dentro do ERP o controle operacional hoje feito na planilha da agroindústria **Hortitex** (açaí e acerola, Mojuí dos Campos/PA): recepção de fruto, ordens de processamento (despolpa), geração de lotes de polpa, estoque por lote com validade, vendas por lote, entregas, ajustes de estoque, rastreabilidade (recall / fiscalização ADEPARA), etiqueta de lote e relatórios gerenciais — eliminando as fragilidades da planilha (numeração de lote dependente da posição da linha, limite de 1.000/2.000 linhas, concorrência no OneDrive, ausência de trilha de auditoria) e conectando o resultado comercial ao financeiro já existente.

### 1.2 Fluxo de negócio (extraído da aba `INICIO`)

```
Colheita própria (talhão) ou compra de terceiro
        │
        ▼
RECEPÇÃO (ENTRADA_FRUTO) ──► gera LOTE DE FRUTO  (FA-260927-01)
        │                          │
        │                          ├──► VENDA in natura (VENDAS) ──► ENTREGAS
        │                          │
        ▼                          ▼
ORDEM DE PROCESSAMENTO – OP (PROCESSAMENTO)  (OP-260927-01)
        │  consome lotes de fruto ............ (PROC_CONSUMO)
        │  apropria insumos e custos .......... (PROC_INSUMOS)
        ▼
gera LOTES DE POLPA (PROC_PRODUCAO)  (AMC-260927-02) ──► ESTOQUE_LOTES (saldo/validade)
                                                          │
                                                          ├──► VENDAS (por lote) ──► ENTREGAS
                                                          └──► AJUSTES (vencido, avaria, amostra, inventário)
```

### 1.3 Mapa da planilha → conceito do ERP

| Aba | Tipo | Conceito no ERP | Observação |
|---|---|---|---|
| `CAD_PRODUTOS` | cadastro | `ProdutoProducao` | código vira prefixo do lote; categoria Fruto/Polpa; conservação; validade (dias); preço ref. |
| `CAD_FORNECEDORES` | cadastro | **reusa `Fornecedor`** (existente) + `tipoOrigem` na recepção | "produção própria" não é fornecedor — vira `tipoOrigem = PROPRIA` + talhão |
| `CAD_TALHOES` | cadastro | `Talhao` | área (ha) → produtividade t/ha |
| `CAD_CLIENTES` | cadastro | **reusa `Cliente`** (existente) + `PerfilComercialCliente` (1:1) | canal de venda, município e endereço de entrega não existem em `Cliente` |
| `CAD_LOCAIS` | cadastro | `LocalArmazenamento` | capacidade (kg) → ocupação |
| `CAD_INSUMOS` | cadastro | `Insumo` | custo unitário de referência |
| `CONFIG` | parâmetros | `ConfigProducao` (1 por filial) | alertas de validade, branqueamento, tolerância do balanço de massa, registro ADEPARA |
| `LISTAS` (oculta) | domínios | enums Prisma + `Fruta` | listas suspensas viram enums/cadastros |
| `ENTRADA_FRUTO` | lançamento | `RecepcaoFruto` + `Lote` (categoria FRUTO) | |
| `PROCESSAMENTO` | lançamento | `OrdemProducao` | |
| `PROC_CONSUMO` | lançamento | `ConsumoOrdemProducao` | |
| `PROC_PRODUCAO` | lançamento | `Lote` (categoria POLPA, `ordemProducaoId`) | |
| `PROC_INSUMOS` | lançamento | `InsumoOrdemProducao` | |
| `VENDAS` | lançamento | `PedidoVenda` (cabeçalho) + `ItemPedidoVenda` (1 por lote) | a planilha repete cliente/pagamento em cada linha do pedido — normalizado |
| `ENTREGAS` | lançamento | `Entrega` (1:1 com pedido) | |
| `AJUSTES` | lançamento | `AjusteEstoque` | |
| `ESTOQUE_LOTES` | calculada | serviço `estoqueProducao` (consulta, não tabela) | saldo calculado — fonte única da verdade |
| `PAINEL` | dashboard | página `/producao/painel` | |
| `REL_MENSAL`, `REL_VENDAS`, `REL_ORIGEM`, `REL_PROCESSAMENTO`, `REL_ESTOQUE` | relatórios | páginas `/producao/relatorios/*` + exportação CSV/XLSX | |
| `RASTREABILIDADE` | consulta | página `/producao/rastreabilidade` | |
| `ETIQUETA` | impressão | página `/producao/lotes/[id]/etiqueta` | |

### 1.4 Volume atual de dados na planilha (para dimensionar migração)

- `ENTRADA_FRUTO`: 16 recepções (todas açaí próprio, talhão T1, preço 0).
- `VENDAS`: 29 linhas, numeração de pedidos até o nº 32 (próximo = 33); período 01–31/10/2026: 16 pedidos, 1.820 kg, R$ 7.600,00.
- `PROCESSAMENTO`, `PROC_*`, `ENTREGAS`, `AJUSTES`: vazios.
- Cadastros: 8 produtos, 2 fornecedores/origens, 3 talhões, 11 clientes, 1 local, 6 insumos.
- Observação: pesos e preços foram digitados como fórmulas (`=14*4`, `=60/14`) — o padrão de campo é **caixas de 14 kg** e **R$ 60,00 por caixa**. A UI deve oferecer um auxiliar "nº de caixas × kg por caixa" e "preço por caixa ÷ kg por caixa" (ver 4.2).

### 1.5 Pontos de integração com o ERP atual

| ERP existente | Como o módulo se conecta | Tipo |
|---|---|---|
| `Filial` / `SessaoAtiva` | todas as tabelas novas são **filial-scoped** (`filialId`), igual a `Safra`, `Titulo` etc. | obrigatório |
| `Cliente` (empresa-scoped) | `PedidoVenda.clienteId` → `clientes.id`; dados comerciais em `PerfilComercialCliente` | obrigatório |
| `Fornecedor` (empresa-scoped) | `RecepcaoFruto.fornecedorId` quando `tipoOrigem = TERCEIRO` | obrigatório p/ terceiro |
| `Safra` | `RecepcaoFruto.safraId` e `OrdemProducao.safraId` (opcionais) — habilita comparação por safra | opcional |
| `Titulo` (contas a receber/pagar) | `PedidoVenda.tituloId` (RECEBER) e `RecepcaoFruto.tituloId` (PAGAR) gerados **reutilizando `criarTitulo()`** | opcional, ligado por `ConfigProducao.integrarFinanceiro` |
| `CategoriaFinanceira` | `ConfigProducao.categoriaReceitaVendaId` / `categoriaDespesaFrutoId` (usadas na geração de títulos) | opcional |
| RBAC (`permissions.ts`) | novas ações `producao:*`, `venda:*`, `estoque:*` | obrigatório |
| Auditoria (`registrarAuditoria`) | toda escrita do módulo gera `AuditLog` | obrigatório |
| API REST v1 (`executarRotaApi`) | novos endpoints em `/api/v1/producao/*` | opcional (fase 2 do módulo) |
| Exportação (`responderExport`) | relatórios exportáveis em CSV/XLSX | obrigatório |
| `Empresa.nomeFantasia` | substitui `CONFIG!B4` (nome na etiqueta/títulos) | obrigatório |
| **[FG]** Classificação Fiscal × Gerencial | `RecepcaoFruto` (de terceiro) e `PedidoVenda` têm `classificacaoFiscal` + dados do comprovante, pré-preenchidos por `Fornecedor/Cliente.classificacaoFiscalPadrao`; os títulos gerados herdam esses dados | obrigatório |

### 1.6 Melhorias deliberadas em relação à planilha

1. **Número de lote/OP gerado uma única vez e persistido** (imutável) — na planilha ele é recalculado pela posição da linha e muda se alguém ordenar/excluir.
2. **Validações bloqueantes** onde a planilha só alertava: fruta da OP ≠ fruta do lote consumido; fruta do produto gerado ≠ fruta da OP; saldo negativo (configurável).
3. **Pedido normalizado** (cabeçalho + itens) — cliente/pagamento não se repetem por linha.
4. **Status da OP** (`ABERTA`/`ENCERRADA`) — congela custo e impede alterações após encerrada.
5. **Custo unitário do insumo e custo do lote gravados no momento do lançamento** (snapshot) — na planilha, mudar o custo de referência reescreve o histórico.
6. **Rastreabilidade descendente automática**: para um lote de fruto, lista também os clientes que receberam as polpas derivadas (a planilha pede consulta manual lote a lote).
7. **Cancelamento explícito** de pedido (status + motivo) em vez de "zerar a quantidade".

### 1.7 Decisões a confirmar com o dono do produto (default adotado entre parênteses)

| # | Decisão | Default deste documento |
|---|---|---|
| D1 | Quem lança produção? Os perfis atuais são financeiros. | Criar perfil aditivo `PRODUCAO` (enum) — ver 5.1. Alternativa: dar `producao:escrever` a `FINANCEIRO`. |
| D2 | Bloquear venda/consumo com saldo insuficiente? | Sim (`bloquearSaldoNegativo = true`), configurável por filial. |
| D3 | Vender lote vencido? | Bloqueado, a menos que o usuário confirme (`confirmarLoteVencido = true`), que fica auditado. |
| D4 | Gerar título a receber/pagar automaticamente? | Desligado por padrão (`integrarFinanceiro = false`). |
| D5 | Clientes sem CPF/CNPJ ("Clientes diversos") | `Cliente.cnpjCpf` é obrigatório e único por empresa — cadastrar um cliente genérico "Consumidor final" com o CNPJ da própria empresa ou CPF do responsável. Não alterar `Cliente`. |
| D6 | Migrar os dados históricos da planilha? | Sim, via script one-shot opcional (`scripts/importar-planilha-producao.ts`, tarefa 6.5). |

---

## 2. Modelagem de Dados & Banco de Dados (Schema)

### 2.1 Convenções herdadas do repositório (obrigatórias)

- IDs `String @id @default(uuid())`; timestamps `criadoEm @default(now())` / `atualizadoEm @updatedAt`.
- Nomes de modelo em PascalCase português; tabela física em snake_case plural via `@@map`.
- Escopo multi-tenant: toda tabela de negócio nova tem `filialId` + `@@index([filialId])` + `onDelete: Cascade` para `Filial` (padrão de `Safra`, `Titulo`, `Orcamento`).
- Unicidade sempre composta com o escopo: `@@unique([filialId, codigo])`.
- Cadastros têm `ativo Boolean @default(true)` — **inativar, nunca excluir** (padrão `definirAtivo*`).
- Valores monetários: `Decimal @db.Decimal(18, 2)`. Novos: preço/custo por kg `Decimal(18, 4)`; massa/volume `Decimal(14, 3)`; percentuais `Decimal(7, 4)` (igual `CenarioEstrategico`).
- Datas de negócio sem hora (recepção, OP, venda, validade): `DateTime @db.Date` — evita deslocamento de fuso ao comparar validade.
- Enums: declarados no `schema.prisma` **e** espelhados como `const` em TypeScript para o Zod (ver `lib/schemas/enums.ts`). Para não tocar o arquivo existente, criar `src/lib/schemas/enumsProducao.ts`.

### 2.2 Diagrama de entidades

```
Filial 1─┬─1 ConfigProducao ──(opc)── CategoriaFinanceira (receita venda / despesa fruto)
         ├─* Fruta ─┬─* ProdutoProducao
         │          ├─* Talhao
         │          └─* OrdemProducao
         ├─* LocalArmazenamento
         ├─* Insumo
         ├─* RecepcaoFruto ──1:1── Lote(FRUTO)        RecepcaoFruto *─(opc)1 Fornecedor | Talhao | Safra | Titulo(PAGAR)
         ├─* OrdemProducao ─┬─* ConsumoOrdemProducao *──1 Lote(FRUTO)
         │                  ├─* InsumoOrdemProducao  *──1 Insumo
         │                  └─* Lote(POLPA)           Lote *─1 ProdutoProducao, *─(opc)1 LocalArmazenamento
         ├─* PedidoVenda ─┬─* ItemPedidoVenda *──1 Lote
         │                └─1:1 Entrega             PedidoVenda *─1 Cliente, *─(opc)1 Titulo(RECEBER)
         └─* AjusteEstoque *──1 Lote
Cliente 1──(0..1) PerfilComercialCliente
```

### 2.3 Enums novos

```prisma
enum CategoriaProduto        { FRUTO POLPA }
enum ConservacaoProduto      { IN_NATURA RESFRIADO CONGELADO }
enum TipoOrigemFruto         { PROPRIA TERCEIRO }
enum QualidadeFruto          { A B C }
enum TipoLocalArmazenamento  { CAMARA_FRIA FREEZER REFRIGERADOR RECEPCAO OUTRO }
enum CanalVenda              { BATEDOR_PONTO_ACAI ATACADO_DISTRIBUIDOR SUPERMERCADO_VAREJO RESTAURANTE_LANCHONETE INDUSTRIA CONSUMIDOR_FINAL OUTRO }
enum FormaPagamentoVenda     { PIX DINHEIRO TRANSFERENCIA BOLETO CARTAO PRAZO }
enum StatusPagamentoVenda    { PAGO A_RECEBER }
enum StatusPedidoVenda       { ATIVO CANCELADO }
enum StatusEntrega           { PENDENTE EM_ROTA ENTREGUE CANCELADA }
enum MotivoAjusteEstoque     { VENCIDO AVARIA_QUEBRA AMOSTRA INVENTARIO CONSUMO_INTERNO OUTRO }
enum StatusOrdemProducao     { ABERTA ENCERRADA }
```

> Nomes de enum **não colidem** com os existentes (`MeioPagamento`, `TipoTitulo`, `StatusParcela`...). `FormaPagamentoVenda` é propositalmente distinto de `MeioPagamento` (que descreve dados bancários de terceiros).

Rótulos de exibição (mapear em `enumsProducao.ts`, objeto `ROTULOS_*`): `BATEDOR_PONTO_ACAI → "Batedor / ponto de açaí"`, `AMOSTRA → "Amostra (ADEPARA / laboratório)"`, `INVENTARIO → "Inventário (+/-)"`, `IN_NATURA → "In natura"` etc. — exatamente os textos de `LISTAS`.

### 2.4 Modelos Prisma novos (adicionar ao final de `prisma/schema.prisma`)

```prisma
// =====================================================================
// MÓDULO PRODUÇÃO E VENDAS
// =====================================================================

model ConfigProducao {
  id                      String   @id @default(uuid())
  filialId                String   @unique
  registroAdepara         String?
  alertaVencCongeladoDias Int      @default(30)   // CONFIG!B7
  alertaVencResfriadoDias Int      @default(1)    // CONFIG!B8 (resfriado e in natura)
  branqueamentoTempMinC   Decimal  @default(80) @db.Decimal(5, 1)     // CONFIG!B9
  branqueamentoTempoMinS  Int      @default(10)   // CONFIG!B10
  toleranciaBalancoMassa  Decimal  @default(0.03) @db.Decimal(7, 4)  // CONFIG!B11 (±3%)
  bloquearSaldoNegativo   Boolean  @default(true)
  integrarFinanceiro      Boolean  @default(false)
  categoriaReceitaVendaId String?
  categoriaDespesaFrutoId String?
  kgPorCaixaPadrao        Decimal? @db.Decimal(14, 3)  // auxiliar de digitação (14 kg)
  criadoEm                DateTime @default(now())
  atualizadoEm            DateTime @updatedAt

  filial                Filial               @relation(fields: [filialId], references: [id], onDelete: Cascade)
  categoriaReceitaVenda CategoriaFinanceira? @relation("ConfigProducaoReceitaVenda", fields: [categoriaReceitaVendaId], references: [id])
  categoriaDespesaFruto CategoriaFinanceira? @relation("ConfigProducaoDespesaFruto", fields: [categoriaDespesaFrutoId], references: [id])

  @@map("configuracoes_producao")
}

model Fruta {
  id                 String   @id @default(uuid())
  filialId           String
  nome               String                       // "Açaí", "Acerola"
  exigeBranqueamento Boolean  @default(false)     // planilha: regra fixa C="Açaí"
  ativo              Boolean  @default(true)
  criadoEm           DateTime @default(now())
  atualizadoEm       DateTime @updatedAt

  filial          Filial            @relation(fields: [filialId], references: [id], onDelete: Cascade)
  produtos        ProdutoProducao[]
  talhoes         Talhao[]
  ordensProducao  OrdemProducao[]

  @@unique([filialId, nome])
  @@index([filialId])
  @@map("frutas")
}

model ProdutoProducao {
  id                String             @id @default(uuid())
  filialId          String
  codigo            String             // FA, FC, AGC, AMC, APC, AGR, AMR, APR, ACC — prefixo do lote
  descricao         String
  categoria         CategoriaProduto
  frutaId           String
  conservacao       ConservacaoProduto
  validadeDias      Int
  precoReferenciaKg Decimal?           @db.Decimal(18, 4)
  armazenamento     String?            // "-18 °C", "0 a 5 °C" — impresso na etiqueta
  ativo             Boolean            @default(true)
  criadoEm          DateTime           @default(now())
  atualizadoEm      DateTime           @updatedAt

  filial     Filial          @relation(fields: [filialId], references: [id], onDelete: Cascade)
  fruta      Fruta           @relation(fields: [frutaId], references: [id])
  lotes      Lote[]
  recepcoes  RecepcaoFruto[]

  @@unique([filialId, codigo])
  @@index([filialId])
  @@map("produtos_producao")
}

model Talhao {
  id           String   @id @default(uuid())
  filialId     String
  nome         String               // "T1 – Açaí adulto"
  frutaId      String               // cultura
  areaHa       Decimal  @db.Decimal(10, 4)
  anoPlantio   Int?
  espacamento  String?
  obs          String?
  ativo        Boolean  @default(true)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  filial    Filial          @relation(fields: [filialId], references: [id], onDelete: Cascade)
  fruta     Fruta           @relation(fields: [frutaId], references: [id])
  recepcoes RecepcaoFruto[]

  @@unique([filialId, nome])
  @@index([filialId])
  @@map("talhoes")
}

model LocalArmazenamento {
  id           String                 @id @default(uuid())
  filialId     String
  nome         String
  tipo         TipoLocalArmazenamento
  temperatura  String?
  capacidadeKg Decimal?               @db.Decimal(14, 3)
  obs          String?
  ativo        Boolean                @default(true)
  criadoEm     DateTime               @default(now())
  atualizadoEm DateTime               @updatedAt

  filial Filial @relation(fields: [filialId], references: [id], onDelete: Cascade)
  lotes  Lote[]

  @@unique([filialId, nome])
  @@index([filialId])
  @@map("locais_armazenamento")
}

model Insumo {
  id            String   @id @default(uuid())
  filialId      String
  nome          String
  unidade       String              // un, L, kWh, h
  custoUnitario Decimal  @db.Decimal(18, 4)
  obs           String?
  ativo         Boolean  @default(true)
  criadoEm      DateTime @default(now())
  atualizadoEm  DateTime @updatedAt

  filial  Filial                @relation(fields: [filialId], references: [id], onDelete: Cascade)
  usos    InsumoOrdemProducao[]

  @@unique([filialId, nome])
  @@index([filialId])
  @@map("insumos")
}

/// Extensão 1:1 de Cliente (empresa-scoped) — NÃO altera a tabela `clientes`.
model PerfilComercialCliente {
  id              String     @id @default(uuid())
  clienteId       String     @unique
  canal           CanalVenda
  municipio       String?
  enderecoEntrega String?
  obs             String?
  criadoEm        DateTime   @default(now())
  atualizadoEm    DateTime   @updatedAt

  cliente Cliente @relation(fields: [clienteId], references: [id], onDelete: Cascade)

  @@map("perfis_comerciais_clientes")
}

model RecepcaoFruto {
  id           String          @id @default(uuid())
  filialId     String
  data         DateTime        @db.Date
  produtoId    String                       // produto categoria FRUTO
  tipoOrigem   TipoOrigemFruto
  fornecedorId String?                      // obrigatório se TERCEIRO
  talhaoId     String?                      // esperado se PROPRIA
  safraId      String?
  pesoBrutoKg  Decimal         @db.Decimal(14, 3)
  descarteKg   Decimal         @default(0) @db.Decimal(14, 3)
  precoKg      Decimal         @default(0) @db.Decimal(18, 4)
  qualidade    QualidadeFruto?
  romaneio     String?                      // nº do romaneio de campo (não é nota)
  classificacaoFiscal   ClassificacaoFiscal?   // [FG] null para PROPRIA; obrigatória para TERCEIRO
  tipoComprovante       TipoComprovante?       // [FG]
  numeroDocumentoFiscal String?                // [FG]
  serieDocumentoFiscal  String?                // [FG]
  chaveAcesso           String?                // [FG]
  obs          String?
  tituloId     String?         @unique      // título a PAGAR gerado (opcional)
  usuarioId    String
  criadoEm     DateTime        @default(now())
  atualizadoEm DateTime        @updatedAt

  filial     Filial          @relation(fields: [filialId], references: [id], onDelete: Cascade)
  produto    ProdutoProducao @relation(fields: [produtoId], references: [id])
  fornecedor Fornecedor?     @relation(fields: [fornecedorId], references: [id])
  talhao     Talhao?         @relation(fields: [talhaoId], references: [id])
  safra      Safra?          @relation(fields: [safraId], references: [id])
  titulo     Titulo?         @relation("TituloRecepcaoFruto", fields: [tituloId], references: [id])
  usuario    Usuario         @relation("RecepcaoFrutoUsuario", fields: [usuarioId], references: [id])
  lote       Lote?

  @@index([filialId])
  @@index([filialId, data])
  @@index([fornecedorId])
  @@map("recepcoes_fruto")
}

model OrdemProducao {
  id                 String              @id @default(uuid())
  filialId           String
  numero             String              // OP-260927-01 (gerado, imutável)
  data               DateTime            @db.Date
  frutaId            String
  responsavel        String?
  branqueamentoTempC Decimal?            @db.Decimal(5, 1)
  branqueamentoTempoS Int?
  aguaAdicionadaL    Decimal             @default(0) @db.Decimal(14, 3)
  residuoKg          Decimal             @default(0) @db.Decimal(14, 3)   // caroço / resíduo
  perdaKg            Decimal             @default(0) @db.Decimal(14, 3)
  obs                String?
  status             StatusOrdemProducao @default(ABERTA)
  safraId            String?
  usuarioId          String
  criadoEm           DateTime            @default(now())
  atualizadoEm       DateTime            @updatedAt

  filial    Filial                 @relation(fields: [filialId], references: [id], onDelete: Cascade)
  fruta     Fruta                  @relation(fields: [frutaId], references: [id])
  safra     Safra?                 @relation(fields: [safraId], references: [id])
  usuario   Usuario                @relation("OrdemProducaoUsuario", fields: [usuarioId], references: [id])
  consumos  ConsumoOrdemProducao[]
  insumos   InsumoOrdemProducao[]
  lotes     Lote[]                 // lotes de polpa produzidos

  @@unique([filialId, numero])
  @@index([filialId])
  @@index([filialId, data])
  @@map("ordens_producao")
}

model ConsumoOrdemProducao {
  id              String   @id @default(uuid())
  ordemProducaoId String
  loteId          String                    // lote categoria FRUTO
  quantidadeKg    Decimal  @db.Decimal(14, 3)
  custoKg         Decimal  @db.Decimal(18, 4) // snapshot do preço do lote de fruto
  obs             String?
  criadoEm        DateTime @default(now())

  ordemProducao OrdemProducao @relation(fields: [ordemProducaoId], references: [id], onDelete: Cascade)
  lote          Lote          @relation("LoteConsumido", fields: [loteId], references: [id])

  @@index([ordemProducaoId])
  @@index([loteId])
  @@map("consumos_ordem_producao")
}

model InsumoOrdemProducao {
  id              String   @id @default(uuid())
  ordemProducaoId String
  insumoId        String
  quantidade      Decimal  @db.Decimal(14, 3)
  custoUnitario   Decimal  @db.Decimal(18, 4) // snapshot de Insumo.custoUnitario
  obs             String?
  criadoEm        DateTime @default(now())

  ordemProducao OrdemProducao @relation(fields: [ordemProducaoId], references: [id], onDelete: Cascade)
  insumo        Insumo        @relation(fields: [insumoId], references: [id])

  @@index([ordemProducaoId])
  @@map("insumos_ordem_producao")
}

/// Lote de estoque. FRUTO nasce de uma RecepcaoFruto; POLPA nasce de uma OrdemProducao.
/// Saldo NÃO é armazenado: é calculado (entrada − consumos − vendas ativas + ajustes).
model Lote {
  id               String           @id @default(uuid())
  filialId         String
  codigo           String           // FA-260910-01 / AMC-260927-02 ou código manual
  codigoManual     Boolean          @default(false)
  categoria        CategoriaProduto
  produtoId        String
  data             DateTime         @db.Date   // recepção (fruto) ou fabricação = data da OP (polpa)
  dataValidade     DateTime         @db.Date
  localId          String?          // null = "Recepção" (fruto)
  quantidadeKg     Decimal          @db.Decimal(14, 3)  // entrada (peso líquido / polpa produzida)
  numeroEmbalagens Int?
  recepcaoFrutoId  String?          @unique
  ordemProducaoId  String?
  criadoEm         DateTime         @default(now())
  atualizadoEm     DateTime         @updatedAt

  filial         Filial                 @relation(fields: [filialId], references: [id], onDelete: Cascade)
  produto        ProdutoProducao        @relation(fields: [produtoId], references: [id])
  local          LocalArmazenamento?    @relation(fields: [localId], references: [id])
  recepcaoFruto  RecepcaoFruto?         @relation(fields: [recepcaoFrutoId], references: [id], onDelete: Cascade)
  ordemProducao  OrdemProducao?         @relation(fields: [ordemProducaoId], references: [id], onDelete: Cascade)
  consumos       ConsumoOrdemProducao[] @relation("LoteConsumido")
  itensVenda     ItemPedidoVenda[]
  ajustes        AjusteEstoque[]

  @@unique([filialId, codigo])
  @@index([filialId])
  @@index([filialId, categoria])
  @@index([ordemProducaoId])
  @@map("lotes")
}

model PedidoVenda {
  id                 String               @id @default(uuid())
  filialId           String
  numero             Int                  // sequencial por filial (PAINEL!F4 = MAX+1)
  data               DateTime             @db.Date
  clienteId          String
  formaPagamento     FormaPagamentoVenda
  statusPagamento    StatusPagamentoVenda
  dataPagamento      DateTime?            @db.Date
  classificacaoFiscal   ClassificacaoFiscal  // [FG] padrão do cliente → FISCAL
  tipoComprovante       TipoComprovante?     // [FG]
  numeroDocumentoFiscal String?              // [FG]
  serieDocumentoFiscal  String?              // [FG]
  chaveAcesso           String?              // [FG]
  status             StatusPedidoVenda    @default(ATIVO)
  motivoCancelamento String?
  obs                String?
  tituloId           String?              @unique  // título a RECEBER gerado (opcional)
  usuarioId          String
  criadoEm           DateTime             @default(now())
  atualizadoEm       DateTime             @updatedAt

  filial   Filial            @relation(fields: [filialId], references: [id], onDelete: Cascade)
  cliente  Cliente           @relation(fields: [clienteId], references: [id])
  titulo   Titulo?           @relation("TituloPedidoVenda", fields: [tituloId], references: [id])
  usuario  Usuario           @relation("PedidoVendaUsuario", fields: [usuarioId], references: [id])
  itens    ItemPedidoVenda[]
  entrega  Entrega?

  @@unique([filialId, numero])
  @@index([filialId])
  @@index([filialId, data])
  @@index([clienteId])
  @@map("pedidos_venda")
}

model ItemPedidoVenda {
  id            String   @id @default(uuid())
  pedidoVendaId String
  loteId        String
  quantidadeKg  Decimal  @db.Decimal(14, 3)
  precoKg       Decimal  @db.Decimal(18, 4)
  custoKg       Decimal  @db.Decimal(18, 4)   // snapshot do custo do lote na venda
  alertaValidadeConfirmado Boolean @default(false)
  obs           String?
  criadoEm      DateTime @default(now())

  pedidoVenda PedidoVenda @relation(fields: [pedidoVendaId], references: [id], onDelete: Cascade)
  lote        Lote        @relation(fields: [loteId], references: [id])

  @@index([pedidoVendaId])
  @@index([loteId])
  @@map("itens_pedido_venda")
}

model Entrega {
  id                 String        @id @default(uuid())
  pedidoVendaId      String        @unique
  dataPrevista       DateTime?     @db.Date
  dataRealizada      DateTime?     @db.Date
  enderecoEntrega    String?
  responsavelVeiculo String?
  status             StatusEntrega @default(PENDENTE)
  recebidoPor        String?
  obs                String?
  criadoEm           DateTime      @default(now())
  atualizadoEm       DateTime      @updatedAt

  pedidoVenda PedidoVenda @relation(fields: [pedidoVendaId], references: [id], onDelete: Cascade)

  @@map("entregas")
}

model AjusteEstoque {
  id           String              @id @default(uuid())
  filialId     String
  loteId       String
  data         DateTime            @db.Date
  quantidadeKg Decimal             @db.Decimal(14, 3)   // negativo = saída; positivo = entrada
  motivo       MotivoAjusteEstoque
  obs          String?
  usuarioId    String
  criadoEm     DateTime            @default(now())

  filial  Filial  @relation(fields: [filialId], references: [id], onDelete: Cascade)
  lote    Lote    @relation(fields: [loteId], references: [id])
  usuario Usuario @relation("AjusteEstoqueUsuario", fields: [usuarioId], references: [id])

  @@index([filialId])
  @@index([loteId])
  @@map("ajustes_estoque")
}
```

### 2.5 Back-relations em modelos existentes (somente campos virtuais)

O Prisma exige o lado inverso das relações. Estes campos **não geram coluna nem `ALTER TABLE`** nas tabelas existentes — conferir no `migration.sql` gerado (tarefa 6.1.4).

```prisma
// model Filial  — acrescentar:
  configProducao        ConfigProducao?
  frutas                Fruta[]
  produtosProducao      ProdutoProducao[]
  talhoes               Talhao[]
  locaisArmazenamento   LocalArmazenamento[]
  insumos               Insumo[]
  recepcoesFruto        RecepcaoFruto[]
  ordensProducao        OrdemProducao[]
  lotes                 Lote[]
  pedidosVenda          PedidoVenda[]
  ajustesEstoque        AjusteEstoque[]

// model Cliente — acrescentar:
  perfilComercial PerfilComercialCliente?
  pedidosVenda    PedidoVenda[]

// model Fornecedor — acrescentar:
  recepcoesFruto RecepcaoFruto[]

// model Safra — acrescentar:
  recepcoesFruto RecepcaoFruto[]
  ordensProducao OrdemProducao[]

// model Titulo — acrescentar:
  recepcaoFruto RecepcaoFruto? @relation("TituloRecepcaoFruto")
  pedidoVenda   PedidoVenda?   @relation("TituloPedidoVenda")

// model CategoriaFinanceira — acrescentar:
  configsProducaoReceita ConfigProducao[] @relation("ConfigProducaoReceitaVenda")
  configsProducaoDespesa ConfigProducao[] @relation("ConfigProducaoDespesaFruto")

// model Usuario — acrescentar:
  recepcoesFruto  RecepcaoFruto[] @relation("RecepcaoFrutoUsuario")
  ordensProducao  OrdemProducao[] @relation("OrdemProducaoUsuario")
  pedidosVenda    PedidoVenda[]   @relation("PedidoVendaUsuario")
  ajustesEstoque  AjusteEstoque[] @relation("AjusteEstoqueUsuario")

// enum Perfil — acrescentar valor (somente se D1 = perfil PRODUCAO):
  PRODUCAO
```

### 2.6 Migration

1. Gerar sem aplicar: `npx prisma migrate dev --name add_producao_vendas --create-only` → pasta `prisma/migrations/<timestamp>_add_producao_vendas/`.
2. **Revisar o SQL gerado**: ele deve conter apenas `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `CREATE UNIQUE INDEX`, `ALTER TABLE "<tabela nova>" ADD CONSTRAINT ... FOREIGN KEY` e (se D1) `ALTER TYPE "Perfil" ADD VALUE 'PRODUCAO'`. **Qualquer `ALTER TABLE`/`DROP` sobre tabela existente é bloqueante — parar e corrigir o schema.**
3. Acrescentar ao final do `migration.sql` as CHECK constraints (o Prisma não as expressa):

```sql
-- Integridade de domínio (não afeta tabelas existentes)
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_origem_unica_chk"
  CHECK ((("recepcaoFrutoId" IS NOT NULL)::int + ("ordemProducaoId" IS NOT NULL)::int) = 1);
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_quantidade_chk" CHECK ("quantidadeKg" >= 0);
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_validade_chk" CHECK ("dataValidade" >= "data");

ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_pesos_chk"
  CHECK ("pesoBrutoKg" > 0 AND "descarteKg" >= 0 AND "descarteKg" <= "pesoBrutoKg" AND "precoKg" >= 0);
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_terceiro_chk"
  CHECK ("tipoOrigem" <> 'TERCEIRO' OR "fornecedorId" IS NOT NULL);

ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_massas_chk"
  CHECK ("aguaAdicionadaL" >= 0 AND "residuoKg" >= 0 AND "perdaKg" >= 0);

ALTER TABLE "consumos_ordem_producao" ADD CONSTRAINT "consumos_op_qtd_chk" CHECK ("quantidadeKg" > 0);
ALTER TABLE "insumos_ordem_producao"  ADD CONSTRAINT "insumos_op_qtd_chk"  CHECK ("quantidade" > 0);
ALTER TABLE "itens_pedido_venda" ADD CONSTRAINT "itens_pedido_venda_valores_chk"
  CHECK ("quantidadeKg" > 0 AND "precoKg" >= 0 AND "custoKg" >= 0);
ALTER TABLE "ajustes_estoque" ADD CONSTRAINT "ajustes_estoque_qtd_chk" CHECK ("quantidadeKg" <> 0);
ALTER TABLE "produtos_producao" ADD CONSTRAINT "produtos_producao_validade_chk" CHECK ("validadeDias" >= 0);

-- [FG] Coerência fiscal (mesmas regras de "titulos")
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_classificacao_chk"
  CHECK ("tipoOrigem" = 'PROPRIA' OR "classificacaoFiscal" IS NOT NULL);
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_comprovante_chk" CHECK (
  "tipoComprovante" IS NULL
  OR ("classificacaoFiscal" = 'FISCAL'    AND "tipoComprovante" NOT IN ('RECIBO','PEDIDO_INTERNO','SEM_COMPROVANTE'))
  OR ("classificacaoFiscal" = 'GERENCIAL' AND "tipoComprovante"     IN ('RECIBO','PEDIDO_INTERNO','SEM_COMPROVANTE')));
ALTER TABLE "pedidos_venda" ADD CONSTRAINT "pedidos_venda_comprovante_chk" CHECK (
  "tipoComprovante" IS NULL
  OR ("classificacaoFiscal" = 'FISCAL'    AND "tipoComprovante" NOT IN ('RECIBO','PEDIDO_INTERNO','SEM_COMPROVANTE'))
  OR ("classificacaoFiscal" = 'GERENCIAL' AND "tipoComprovante"     IN ('RECIBO','PEDIDO_INTERNO','SEM_COMPROVANTE')));
ALTER TABLE "recepcoes_fruto" ADD CONSTRAINT "recepcoes_fruto_chave_chk" CHECK ("chaveAcesso" IS NULL OR "chaveAcesso" ~ '^[0-9]{44}$');
ALTER TABLE "pedidos_venda"  ADD CONSTRAINT "pedidos_venda_chave_chk"  CHECK ("chaveAcesso" IS NULL OR "chaveAcesso" ~ '^[0-9]{44}$');
```

4. Aplicar local: `npm run db:migrate`; depois `npm run db:generate` e `npm run build` (type-check).
5. Produção/staging: nada muda no processo — o workflow `.github/workflows/prisma-migrate.yml` aplica `prisma migrate deploy` no push em `main`/`staging`. **Nunca** usar `migrate reset`.
6. `ALTER TYPE ... ADD VALUE` não pode rodar dentro de transação em versões antigas do Postgres; no Postgres ≥ 12 (Neon) funciona, mas se o deploy reclamar, separar o `ADD VALUE` numa migration própria anterior (`add_perfil_producao`).

### 2.7 Seed (opcional, aditivo)

Criar `prisma/seed-producao.ts` (não alterar `prisma/seed.ts`) + script `"db:seed:producao": "tsx prisma/seed-producao.ts"` no `package.json`. Idempotente (`upsert` por `filialId + codigo/nome`), recebendo a filial alvo por env `SEED_FILIAL_CNPJCPF`:

- `ConfigProducao` com os defaults da aba `CONFIG`.
- Frutas: Açaí (`exigeBranqueamento: true`), Acerola (`false`).
- Produtos (aba `CAD_PRODUTOS`):

| Código | Descrição | Cat. | Fruta | Conservação | Validade (d) | Preço ref. R$/kg | Armazenamento |
|---|---|---|---|---|---|---|---|
| FA | Fruto de açaí | FRUTO | Açaí | IN_NATURA | 1 | 4,2857 | Sombra / ventilado |
| FC | Fruto de acerola | FRUTO | Acerola | IN_NATURA | 2 | 2,50 | Sombra / refrigerado |
| AGC | Polpa de açaí grosso/especial – congelada | POLPA | Açaí | CONGELADO | 365 | 15 | -18 °C |
| AMC | Polpa de açaí médio/regular – congelada | POLPA | Açaí | CONGELADO | 365 | 14 | -18 °C |
| APC | Polpa de açaí fino/popular – congelada | POLPA | Açaí | CONGELADO | 365 | 13 | -18 °C |
| AGR | Açaí grosso/especial – resfriado (fresco) | POLPA | Açaí | RESFRIADO | 2 | 25 | 0 a 5 °C |
| AMR | Açaí médio/regular – resfriado (fresco) | POLPA | Açaí | RESFRIADO | 2 | 22 | 0 a 5 °C |
| APR | Açaí fino/popular – resfriado (fresco) | POLPA | Açaí | RESFRIADO | 2 | 20 | 0 a 5 °C |
| ACC | Polpa de acerola – congelada | POLPA | Acerola | CONGELADO | 365 | 12 | -18 °C |

- Insumos: Embalagem 1 kg (un, 0,35) · Embalagem 500 g (un, 0,25) · Caixa de papelão (un, 2,50) · Hipoclorito (L, 6,00) · Energia elétrica (kWh, 0,95) · Mão de obra (h, 12,00).
- Talhões: T1 – Açaí adulto (6 ha, 2014, 4 × 2 m) · T2 – Açaí novo (12 ha, 2026) · T3 – Acerola (1,35 ha, 2026, 4 × 1,7 m).
- Local: Refrigerador expedição (REFRIGERADOR, 0 a 5 °C, 400 kg).

---

## 3. Especificação da API / Backend

### 3.1 Arquitetura de camadas (igual ao restante do ERP)

```
UI (Server Component page.tsx)  ──lê──►  server/services/*.ts  ──►  Prisma
UI (Client Component dialog)    ──FormData──►  actions.ts ("use server")
                                                 │ requireSessaoAtiva()
                                                 │ schema.safeParse(...)        (lib/schemas/*.ts — Zod)
                                                 │ service(sessao, dados)       (requirePermission + requireAlteracaoFilial + Prisma + registrarAuditoria)
                                                 │ revalidatePath(...)
                                                 └─► FormState { erro?, sucesso? }
API REST v1 (route.ts) ──► executarRotaApi(request, handler) ──► mesmo service
```

Regras que o Claude Code deve seguir em **todo** service do módulo:

- Primeira linha: `requirePermission(sessao.perfil, "<acao>")`; em escrita, também `requireAlteracaoFilial(sessao.podeAlterarFilial)`.
- Toda leitura/escrita filtra por `filialId: sessao.filialId` (e `empresaId` para `Cliente`/`Fornecedor`). Para IDs recebidos do usuário, validar pertencimento à filial/empresa antes de usar (padrão `validarReferenciasDoTitulo` em `server/services/titulo.ts`) — a FK só prova que a linha existe em *alguma* filial.
- Escritas multi-tabela dentro de `prisma.$transaction(async (tx) => {...})`, passando `tx` adiante (padrão `baixa.ts`, `orcamento.ts`). `registrarAuditoria(params, tx)` dentro da mesma transação.
- `anterior` e `novo` da auditoria na **mesma forma** (comentário em `atualizarTitulo`) — senão o diff acusa tudo como alterado.
- Erros de regra de negócio: `throw new Error("mensagem em português para o usuário")` (a action converte em `{ erro }`; a API devolve 500 — por isso, na API, regras de negócio validáveis devem lançar `ErroValidacaoApi` → 422; ver 3.6).
- Opcionais vindos de `Select` com "Nenhum" chegam como `SEM_VALOR` (`"__nenhum__"`) — normalizar para `null` (função `normalizarOpcional`).
- Decimals: converter com `Number(...)` só na borda (cálculo/DTO); persistir passando `number`/`string` ao Prisma.

### 3.2 Arquivos de backend a criar

```
src/lib/schemas/enumsProducao.ts           // consts + rótulos
src/lib/schemas/producao/
  configProducao.ts  fruta.ts  produtoProducao.ts  talhao.ts  localArmazenamento.ts
  insumo.ts  perfilComercialCliente.ts  recepcaoFruto.ts  ordemProducao.ts
  consumoOrdemProducao.ts  insumoOrdemProducao.ts  lotePolpa.ts
  pedidoVenda.ts  entrega.ts  ajusteEstoque.ts  filtroPeriodoProducao.ts
src/server/services/producao/
  calculosProducao.ts        // funções PURAS (sem Prisma) — 100% testadas
  numeracaoProducao.ts       // geração de códigos de lote / OP / nº pedido
  configProducao.ts  fruta.ts  produtoProducao.ts  talhao.ts  localArmazenamento.ts
  insumo.ts  perfilComercialCliente.ts
  recepcaoFruto.ts  ordemProducao.ts  estoqueProducao.ts  pedidoVenda.ts
  entrega.ts  ajusteEstoque.ts  rastreabilidade.ts  painelProducao.ts
  relatoriosProducao.ts  integracaoFinanceiraProducao.ts
  producaoTestFixtures.ts
```

> Subpasta `producao/` é aceitável: o alias `@/server/services/producao/...` funciona com o `tsconfig` atual, e o `vitest.config.ts` inclui `src/**/*.test.ts`.

### 3.3 Regras de negócio e cálculos extraídos da planilha

Todas as fórmulas abaixo viram funções puras em `calculosProducao.ts` (exceto onde indicado). Referência da célula de origem entre parênteses.

#### 3.3.1 Numeração (`numeracaoProducao.ts`)

| Item | Regra | Origem |
|---|---|---|
| Lote de fruto | `${produto.codigo}-${AA}${MM}${DD}-${NN}` — `NN` = nº sequencial do mesmo **produto + data** na filial, 2 dígitos (3 se > 99). Ex.: `FA-260910-01` | `ENTRADA_FRUTO!A5` |
| Lote de polpa | Mesmo formato, data = data da OP, sequência por **produto + data de fabricação**. Ex.: `AMC-260927-02` | `PROC_PRODUCAO!A5` |
| Lote manual | Se o usuário informar `codigoManual`, usar o valor (trim, upper) e marcar `codigoManual = true`; deve ser único na filial | coluna "Lote manual" |
| OP | `OP-${AA}${MM}${DD}-${NN}` — sequência por **data** na filial | `PROCESSAMENTO!A5` |
| Pedido | `MAX(numero) + 1` por filial (começa em 1) | `PAINEL!F4` |

Implementação contra concorrência (dentro da transação de criação):

```ts
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${filialId}:lote:${prefixo}:${dataIso}`}))`;
const qtd = await tx.lote.count({ where: { filialId, produtoId, data, codigoManual: false } });
const codigo = gerarCodigoLote(prefixo, data, qtd + 1);
```

A `@@unique([filialId, codigo])` é a última barreira: em `P2002`, recalcular uma vez; se falhar de novo, erro "Não foi possível gerar o número do lote, tente novamente". Uma vez gravado, **o código nunca é recalculado** (nem se a data da recepção for editada — nesse caso, bloquear edição da data se o lote já tiver movimentação, ver 3.3.6).

#### 3.3.2 Recepção de fruto (`ENTRADA_FRUTO`)

| Campo derivado | Fórmula | Origem |
|---|---|---|
| Peso líquido (kg) | `pesoBruto − descarte` | `O5` |
| % descarte | `descarte / pesoBruto` (vazio se bruto = 0) | `P5` |
| Valor (R$) | `pesoLiquido × precoKg` | `Q5` |
| Fruta / Tipo origem | do produto / de `tipoOrigem` | `N5`, `M5` |
| Validade do lote | `data + produto.validadeDias` | `ESTOQUE_LOTES!J5` |
| Custo do lote (R$/kg) | `precoKg` da recepção | `ESTOQUE_LOTES!T5` |

Validações: produto ativo e `categoria = FRUTO`; `pesoBruto > 0`; `0 ≤ descarte ≤ bruto`; `preco ≥ 0`; `TERCEIRO ⇒ fornecedorId` (da empresa); `PROPRIA ⇒ fornecedorId = null` e `talhaoId` recomendado (o talhão deve ser da filial e da mesma fruta do produto); data não futura.

**[FG]** Classificação: `PROPRIA ⇒ classificacaoFiscal = null` (não há operação com terceiro); `TERCEIRO ⇒ classificacaoFiscal = resolverClassificacao(informada, fornecedor.classificacaoFiscalPadrao)`. Comprovante validado com `validarComprovante()` (mesmas regras do título: grupo do tipo, chave de 44 dígitos com DV, dados de nota vazios se GERENCIAL). Compra FISCAL de produtor pessoa física normalmente usa `NF_PRODUTOR` ou `NF_ENTRADA`. FISCAL sem número de nota não bloqueia — entra nas pendências fiscais do título gerado.

Efeito: cria `RecepcaoFruto` + `Lote` (FRUTO, `quantidadeKg = pesoLiquido`, `localId = null`) na mesma transação. Edição de pesos atualiza `Lote.quantidadeKg`; se o novo líquido < (consumido + vendido − ajustes) do lote, bloquear.

#### 3.3.3 Ordem de processamento (`PROCESSAMENTO`, `PROC_CONSUMO`, `PROC_PRODUCAO`, `PROC_INSUMOS`)

| Indicador | Fórmula | Origem |
|---|---|---|
| Fruto consumido (kg) | `Σ consumos.quantidadeKg` da OP | `K5` |
| Polpa produzida (kg) | `Σ lotes(POLPA).quantidadeKg` da OP | `L5` |
| Rendimento | `polpa / fruto` (null se fruto = 0) | `M5` |
| Balanço de massa – diferença (kg) | `fruto + água(L) − polpa − resíduo − perda` (1 L de água ≈ 1 kg) | `N5` |
| Balanço % | `diferença / (fruto + água)` (null se denominador = 0) | `O5` |
| Status balanço | `|balanço%| ≤ toleranciaBalancoMassa ? OK : VERIFICAR` | `P5` |
| Branqueamento | `fruta.exigeBranqueamento ? (temp ≥ tempMin && tempo ≥ tempoMin ? OK : VERIFICAR) : NA` | `Q5` |
| Custo do fruto (R$) | `Σ consumo.quantidadeKg × consumo.custoKg` | `R5` |
| Custo de insumos (R$) | `Σ insumo.quantidade × insumo.custoUnitario` | `S5` |
| Custo total (R$) | `custoFruto + custoInsumos` | `T5` |
| Custo por kg de polpa | `custoTotal / polpa` (null se polpa = 0) | `U5` |
| Nº lotes de fruto | `count(consumos)` | `W5` |

Regras:

- **Consumo**: lote deve ser da filial, `categoria = FRUTO`, **mesma fruta da OP** (planilha: alerta "Fruta diferente" → ERP: bloqueia), saldo suficiente (3.3.5). `custoKg` = `recepcaoFruto.precoKg` gravado como snapshot.
- **Produção (lote de polpa)**: produto `categoria = POLPA`, **mesma fruta da OP** (bloqueia), `quantidadeKg > 0`, `localId` obrigatório (local ativo da filial), `numeroEmbalagens` opcional; `data = op.data`; `dataValidade = op.data + produto.validadeDias`.
- **Insumo**: `custoUnitario` = snapshot de `Insumo.custoUnitario` (editável no lançamento).
- **Encerrar OP**: exige ≥ 1 consumo e ≥ 1 lote de polpa; após `ENCERRADA`, consumos/insumos/lotes e cabeçalho ficam somente leitura (reabrir: ação explícita `ADMINISTRADOR`, auditada).
- **Custo do lote de polpa** = `custoKgPolpa` da OP (todos os lotes da OP têm o mesmo custo/kg, como na planilha). Enquanto a OP está `ABERTA`, itens de venda desse lote gravam o custo vigente; ao encerrar/alterar a OP, chamar `recalcularCustoItensVendaDaOp(tx, opId)` para atualizar `ItemPedidoVenda.custoKg` dos lotes da OP.
- Excluir consumo/insumo/lote só com OP `ABERTA`; excluir lote de polpa só se não tiver vendas/ajustes.

#### 3.3.4 Vendas (`VENDAS`)

| Campo | Fórmula | Origem |
|---|---|---|
| Valor do item (R$) | `quantidadeKg × precoKg` | `O5` |
| Custo do item (R$) | `quantidadeKg × custoKg` | `R5` |
| Margem bruta (R$) | `valor − custo` | `S5` |
| A receber (R$) | `statusPagamento = A_RECEBER ? Σ valor itens : 0` | `V5` |
| Alerta | `data > lote.dataValidade ? "Lote vencido na data" : saldo < −0,001 ? "Saldo negativo" : ""` | `U5` |
| Total do pedido | `Σ valor itens` | `ENTREGAS!K5` |

Regras:

- Pedido tem ≥ 1 item; cliente ativo da empresa; não repetir o mesmo lote em dois itens do mesmo pedido (somar).
- **[FG]** `classificacaoFiscal = resolverClassificacao(informada, cliente.classificacaoFiscalPadrao)`; comprovante validado com `validarComprovante()`. Venda FISCAL normalmente com `NFE`/`NFCE`; GERENCIAL com `RECIBO`/`PEDIDO_INTERNO`/`SEM_COMPROVANTE`. Alterar a classificação de um pedido com título gerado → exige motivo e reclassifica o título pelo `atualizarTitulo()` do financeiro (que propaga aos lançamentos).
- Lote da filial, saldo suficiente se `bloquearSaldoNegativo` (3.3.5).
- Se `pedido.data > lote.dataValidade` e o item não vier com `confirmarLoteVencido = true` → erro de validação `LOTE_VENCIDO` (UI mostra confirmação; ao confirmar grava `alertaValidadeConfirmado = true`).
- `custoKg` do item = custo atual do lote (fruto: preço da recepção; polpa: custo/kg da OP).
- `statusPagamento = PAGO ⇒ dataPagamento` obrigatória (default = data do pedido).
- **Editar** pedido `ATIVO`: substitui itens na transação; saldo revalidado **desconsiderando os itens do próprio pedido**.
- **Cancelar**: `status = CANCELADO`, `motivoCancelamento` obrigatório; itens deixam de contar no saldo; entrega vinculada vira `CANCELADA`. Se houver `tituloId`, cancelar as parcelas em aberto reutilizando `cancelarParcela()` de `server/services/titulo.ts`; se alguma parcela tiver baixa, bloquear com mensagem "Estorne as baixas no financeiro antes de cancelar o pedido".

#### 3.3.5 Estoque por lote (`ESTOQUE_LOTES`) — `estoqueProducao.ts`

| Campo | Fórmula | Origem |
|---|---|---|
| Entrada (kg) | `lote.quantidadeKg` | `M5` |
| Processado (kg) | `Σ consumos do lote` | `N5` |
| Vendido (kg) | `Σ itens de pedidos ATIVOS do lote` | `O5` |
| Ajustes (kg) | `Σ ajustes do lote` (com sinal) | `P5` |
| **Saldo (kg)** | `entrada − processado − vendido + ajustes` | `Q5` |
| Dias p/ vencer | `dataValidade − dataReferencia` (dias) | `R5` |
| Status | `saldo ≤ 0,001 → ZERADO`; senão `dias < 0 → VENCIDO`; senão `dias ≤ (conservacao = CONGELADO ? alertaVencCongeladoDias : alertaVencResfriadoDias) → VENCENDO`; senão `OK` | `S5` |
| Custo (R$/kg) | fruto: `recepcao.precoKg`; polpa: `custoKgPolpa` da OP | `T5` |
| Valor em estoque (R$) | `max(0, saldo) × custo` | `U5` |
| Local | fruto: "Recepção"; polpa: `local.nome` | `K5` |
| Origem / OP | fruto: fornecedor ou "Produção própria – talhão"; polpa: `op.numero` | `L5` |
| Lote ativo | `saldo > 0,001` (alimenta listas de seleção de venda/ajuste/consumo) | `W5`, `X5` |

`dataReferencia` = hoje no fuso `America/Belem` (equivalente a `CONFIG!B6 = HOJE()`), sobrescrevível por parâmetro de consulta (`?dataReferencia=AAAA-MM-DD`) para "conferir o estoque em outro dia".

Implementação: `listarLotesComSaldo(filialId, filtros)` faz 1 `findMany` de lotes (com produto, local, recepção, OP) + 3 `groupBy` por `loteId` (consumos, itens de pedidos ATIVOS, ajustes) e monta o DTO em memória com as funções puras. `obterSaldoLote(tx, loteId)` para validação pontual.

**Controle de concorrência** em toda operação que reduz saldo (consumo, item de venda, ajuste negativo, edição de pesos):

```ts
await tx.$queryRaw`SELECT id FROM "lotes" WHERE id = ${loteId} AND "filialId" = ${filialId} FOR UPDATE`;
const saldo = await obterSaldoLote(tx, loteId, { excluirPedidoId });
if (config.bloquearSaldoNegativo && saldo - quantidade < -0.001) throw new Error(`Saldo insuficiente no lote ${codigo}: disponível ${saldo} kg`);
```

#### 3.3.6 Ajustes, entregas, edição e exclusão

- **Ajuste** (`AJUSTES`): `quantidadeKg ≠ 0` (negativo = saída). Ajuste negativo valida saldo como venda. Sem edição — corrigir com novo ajuste (trilha contábil). Exclusão só `ADMINISTRADOR`, auditada.
- **Entrega** (`ENTREGAS`): 1 por pedido `ATIVO`. `kg` e `valor` do pedido são derivados (não gravados). `Atraso (dias)` = vazio se `CANCELADA` ou sem `dataPrevista`; senão `dataRealizada ? max(0, realizada − prevista) : max(0, dataReferencia − prevista)` (`L5`). `ENTREGUE ⇒ dataRealizada` obrigatória. `enderecoEntrega` default = `PerfilComercialCliente.enderecoEntrega`.
- **Edição de recepção/OP com movimentação**: datas e produto não podem mudar se o lote já tiver consumo, venda ou ajuste (mudaria validade/código retroativamente).
- **Exclusão** de recepção: só sem movimentação no lote (apaga lote em cascata).

#### 3.3.7 Painel e relatórios (`PAINEL`, `REL_*`)

Filtros globais: `de`/`ate` (período) e `ano` (mensal), via `searchParams` — padrão `filtro-*-url.ts` + teste.

**Painel — indicadores do período** (`painelProducao.ts → obterPainelProducao(filialId, {de, ate, dataReferencia})`):

| Grupo | Indicador | Cálculo |
|---|---|---|
| Recepção/processamento | Fruto recebido por fruta (kg) | Σ peso líquido das recepções no período, por fruta |
| | % de terceiros por fruta | Σ líquido TERCEIRO / Σ líquido |
| | Descarte na triagem (%) | Σ descarte / Σ bruto |
| | Fruto processado (kg) | Σ consumos de OPs no período (data da OP) |
| | Nº de OPs | count OPs no período |
| | Polpa produzida por fruta (kg) | Σ lotes POLPA (data fabricação) por fruta |
| | Rendimento por fruta | polpa da fruta / fruto consumido da fruta |
| | Custo médio da polpa por fruta (R$/kg) | Σ custoTotal OPs da fruta / Σ polpa OPs da fruta |
| Vendas | Faturamento total, fruto in natura, polpa por fruta (R$) | Σ valor itens de pedidos ATIVOS no período, por categoria/fruta |
| **[FG]** Vendas | Faturamento fiscal · gerencial · % gerencial | Σ valor por `pedido.classificacaoFiscal` |
| **[FG]** Recepção | Fruto de terceiros comprado fiscal · gerencial (kg e R$) | Σ por `recepcao.classificacaoFiscal` |
| **[FG]** Filtro | Painel e todos os relatórios aceitam `?classificacao=FISCAL\|GERENCIAL` (padrão: todos) | aplica-se a pedidos e recepções de terceiro; recepção própria só aparece com "todos" |
| | Kg vendidos · Preço médio (R$/kg) | Σ kg · faturamento / kg |
| | Margem bruta (R$ e %) | Σ margem · margem / faturamento |
| | Nº de pedidos · Ticket médio | count pedidos ATIVOS · faturamento / nº pedidos |
| | A receber – total em aberto (R$) | Σ pedidos `A_RECEBER` (todos os períodos) |
| | Pedidos a receber | count pedidos `A_RECEBER` |
| Estoque e alertas (na `dataReferencia`) | Estoque de polpa (kg) · Fruto aguardando (kg, não vencido) | Σ saldo > 0 por categoria |
| | Valor do estoque a custo (R$) | Σ valor em estoque |
| | Lotes vencendo · Lotes vencidos com saldo · Kg vencidos | contagens por status |
| | Entregas pendentes/em rota · com atraso | count status ∈ {PENDENTE, EM_ROTA} · atraso > 0 e status ≠ ENTREGUE |
| | OPs com balanço a verificar · com branqueamento a verificar | no período |
| | Vendas com alerta de lote | itens com `alertaValidadeConfirmado = true` ou saldo negativo do lote |
| Tabelas | Estoque atual por produto (kg, valor a custo) · Vendas do período por produto (kg, R$) | agrupamentos |

**Relatórios**:

| Rota | Conteúdo (da aba) |
|---|---|
| `relatorios/mensal` (`REL_MENSAL`) | 12 linhas (jan–dez do `ano`): recebido por fruta × própria/terceiro, total; processado por fruta; polpa por fruta; rendimentos; nº OPs; faturamento fruto/polpa açaí/polpa acerola/total; kg vendidos; margem R$/%; custo polpa R$/kg por fruta; fruto pago a terceiros (R$). Gráficos de linhas/barras. |
| `relatorios/vendas` (`REL_VENDAS`) | Top 10 clientes (faturamento, canal, kg, a receber); vendas por cliente (kg, R$, % do total, preço médio, margem, a receber); por produto (kg, R$, preço médio, custo médio, margem %); por canal (kg, R$, %); por forma de pagamento (R$, a receber). |
| `relatorios/origem` (`REL_ORIGEM`) | Fruto por origem/fornecedor (tipo, açaí kg, acerola kg, total, valor, preço médio, descarte %, nº cargas); top 10 origens; produtividade dos talhões (área, kg período, kg ano, **t/ha no ano = kgAno / 1000 / área**, nº colheitas no ano); preço médio pago a terceiros por mês × fruta (ano). |
| `relatorios/processamento` (`REL_PROCESSAMENTO`) | Resumo por fruta (nº OPs, fruto, polpa, rendimento médio/mín./máx., custo médio); balanço de massa por fruta (fruto, água, polpa, resíduo, perda, diferença); custo (fruto, insumos, total) por fruta; custo de insumos por tipo; últimas 30 OPs. |
| `relatorios/estoque` (`REL_ESTOQUE`) | Saldo produto × local (kg) + total, valor; capacidade e **ocupação % = saldo no local / capacidadeKg**; estoque por status (nº lotes, kg); próximos a vencer (lotes com saldo, ordem de validade, limite 25). |

**Rastreabilidade** (`rastreabilidade.ts → rastrearLote(filialId, codigoOuId)`):
- Dados do lote (categoria, produto, descrição, data, validade, local, origem/OP, entrada, processado, vendido, ajustes, saldo, status).
- Se POLPA: dados da OP (nº, data, responsável, branqueamento °C/s/status, rendimento, balanço) + lotes de fruto consumidos (kg, origem/fornecedor, talhão, data recepção, qualidade).
- Se FRUTO: OPs que consumiram o lote (kg, data) + lotes de polpa gerados por cada OP.
- Clientes que receberam o lote (vendas diretas: data, pedido, cliente, kg, valor, canal, status e data de entrega).
- **Recall descendente** (melhoria): para FRUTO, também os clientes dos lotes de polpa derivados.

**Etiqueta** (`ETIQUETA`): empresa (`nomeFantasia`), descrição do produto, `LOTE: <codigo>`, fabricação, validade (dd/mm/aaaa), conservação (`produto.armazenamento`), "Peso líquido: ____ kg", `Registro ADEPARA nº <config.registroAdepara>` ou "(preencher em Configurações)".

#### 3.3.8 Integração financeira (`integracaoFinanceiraProducao.ts`) — opcional

Somente quando `ConfigProducao.integrarFinanceiro = true` e a categoria correspondente estiver configurada (senão erro "Configure a categoria financeira de ... em Produção › Configurações").

- `gerarTituloReceberDoPedido(sessao, pedidoId)`: exige `titulo:escrever` (além de `venda:escrever`); idempotente (erro se `tituloId` já existe); usa **`criarTitulo(sessao, "RECEBER", dados, tx)`** com `contraparteId = clienteId`, `documento = "PV-<numero>"`, **[FG]** `classificacaoFiscal`, `tipoComprovante`, `numeroDocumentoFiscal`, `serieDocumentoFiscal`, `chaveAcesso` copiados do pedido, `dataEmissao = dataCompetencia = pedido.data`, `categoriaFinanceiraId = categoriaReceitaVendaId`, `safraId` (se houver), `formaPagamento = rótulo`, 1 parcela `{ numero: 1, dataVencimento: dataPagamento ?? data, valorOriginal: total }`; grava `pedido.tituloId`.
- `gerarTituloPagarDaRecepcao(sessao, recepcaoId)`: só `tipoOrigem = TERCEIRO` e valor > 0; `criarTitulo(sessao, "PAGAR", ...)` com `documento = romaneio ?? "RF-<codigoLote>"`, `categoriaDespesaFrutoId` e **[FG]** classificação + dados do comprovante copiados da recepção.
- Chamada automática na criação do pedido/recepção **apenas** se o perfil da sessão tiver `titulo:escrever`; caso contrário o pedido é criado sem título e o botão "Gerar título" aparece para quem tem a permissão (perfil FINANCEIRO).
- O status de pagamento financeiro passa a ser o da parcela (baixa pelo fluxo existente de contas a receber, com aprovação). `PedidoVenda.statusPagamento` continua como informação operacional.

### 3.4 Server Actions (UI) — `src/app/(dashboard)/producao/**/actions.ts`

Todas com assinatura `(_prev: FormState, formData: FormData) => Promise<FormState>` (forms) ou `(formData: FormData) => Promise<void>` (botões de alternância), exatamente como `cadastros/safras/actions.ts`. Listas dinâmicas (itens do pedido, consumos) trafegam como JSON em `<input type="hidden">` e são lidas com `JSON.parse` em `try/catch` (padrão `parseParcelas` de `financeiro/_titulos/actions.ts`).

| Arquivo | Actions | Service | `revalidatePath` |
|---|---|---|---|
| `producao/cadastros/frutas/actions.ts` | `criarFrutaAction`, `atualizarFrutaAction`, `alternarAtivoFrutaAction` | `fruta.ts` | `/producao/cadastros/frutas` |
| `.../produtos/actions.ts` | criar/atualizar/alternarAtivo Produto | `produtoProducao.ts` | idem |
| `.../talhoes`, `.../locais`, `.../insumos` | criar/atualizar/alternarAtivo | respectivos | idem |
| `.../clientes-comercial/actions.ts` | `salvarPerfilComercialAction` (upsert) | `perfilComercialCliente.ts` | idem |
| `.../configuracoes/actions.ts` | `salvarConfigProducaoAction` (upsert) | `configProducao.ts` | idem + `/producao/painel` |
| `producao/recepcao/actions.ts` | `criarRecepcaoAction`, `atualizarRecepcaoAction`, `excluirRecepcaoAction`, `gerarTituloPagarRecepcaoAction` | `recepcaoFruto.ts` | `/producao/recepcao`, `/producao/estoque` |
| `producao/ordens/actions.ts` | `criarOrdemAction`, `atualizarOrdemAction`, `adicionarConsumoAction`, `removerConsumoAction`, `adicionarInsumoAction`, `removerInsumoAction`, `adicionarLotePolpaAction`, `removerLotePolpaAction`, `encerrarOrdemAction`, `reabrirOrdemAction` | `ordemProducao.ts` | `/producao/ordens`, `/producao/ordens/[id]`, `/producao/estoque` |
| `producao/vendas/actions.ts` | `criarPedidoAction`, `atualizarPedidoAction`, `cancelarPedidoAction`, `registrarPagamentoAction`, `gerarTituloReceberAction` | `pedidoVenda.ts` | `/producao/vendas`, `/producao/estoque`, `/producao/entregas` |
| `producao/entregas/actions.ts` | `salvarEntregaAction` (upsert por pedido), `alterarStatusEntregaAction` | `entrega.ts` | `/producao/entregas` |
| `producao/ajustes/actions.ts` | `criarAjusteAction`, `excluirAjusteAction` | `ajusteEstoque.ts` | `/producao/ajustes`, `/producao/estoque` |

Para o erro `LOTE_VENCIDO`, a action devolve `FormState` estendido: `{ erro, confirmacaoNecessaria?: { lotes: string[] } }` — o dialog reexibe pedindo confirmação e reenvia com `confirmarLoteVencido=true`.

### 3.5 DTOs / tipos (TypeScript)

Schemas Zod (inputs) — exemplos dos principais (demais seguem o mesmo estilo de `lib/schemas/safra.ts`):

```ts
// lib/schemas/producao/recepcaoFruto.ts
export const recepcaoFrutoSchema = z.object({
  data: z.coerce.date(),
  produtoId: z.string().trim().min(1, "Selecione o produto (fruto)"),
  tipoOrigem: z.enum(TIPO_ORIGEM_FRUTO),
  fornecedorId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  talhaoId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  safraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  pesoBrutoKg: z.coerce.number().positive("Informe o peso bruto"),
  descarteKg: z.coerce.number().min(0).default(0),
  precoKg: z.coerce.number().min(0).default(0),
  qualidade: z.enum(QUALIDADE_FRUTO).optional().or(z.literal(SEM_VALOR)),
  romaneio: z.string().trim().optional().or(z.literal("")),
  // [FG] mesmos campos/regras do título (validarComprovante no superRefine)
  classificacaoFiscal: z.enum(CLASSIFICACAO_FISCAL).optional(),
  tipoComprovante: z.enum(TIPO_COMPROVANTE).optional().or(z.literal(SEM_VALOR)),
  numeroDocumentoFiscal: z.string().trim().optional().or(z.literal("")),
  serieDocumentoFiscal: z.string().trim().optional().or(z.literal("")),
  chaveAcesso: z.string().trim().optional().or(z.literal("")),
  codigoManual: z.string().trim().toUpperCase().optional().or(z.literal("")),
  obs: z.string().trim().optional().or(z.literal("")),
}).superRefine((d, ctx) => {
  if (d.descarteKg > d.pesoBrutoKg) ctx.addIssue({ code: "custom", path: ["descarteKg"], message: "Descarte maior que o peso bruto" });
  if (d.tipoOrigem === "TERCEIRO" && (!d.fornecedorId || d.fornecedorId === SEM_VALOR))
    ctx.addIssue({ code: "custom", path: ["fornecedorId"], message: "Selecione o fornecedor" });
});
export type RecepcaoFrutoFormValues = z.infer<typeof recepcaoFrutoSchema>;

// lib/schemas/producao/ordemProducao.ts
export const ordemProducaoSchema = z.object({
  data: z.coerce.date(),
  frutaId: z.string().trim().min(1, "Selecione a fruta"),
  responsavel: z.string().trim().optional().or(z.literal("")),
  branqueamentoTempC: z.coerce.number().min(0).max(150).optional().or(z.literal("")),
  branqueamentoTempoS: z.coerce.number().int().min(0).optional().or(z.literal("")),
  aguaAdicionadaL: z.coerce.number().min(0).default(0),
  residuoKg: z.coerce.number().min(0).default(0),
  perdaKg: z.coerce.number().min(0).default(0),
  safraId: z.string().trim().optional().or(z.literal(SEM_VALOR)),
  obs: z.string().trim().optional().or(z.literal("")),
});
export const consumoOrdemSchema = z.object({ loteId: z.string().min(1), quantidadeKg: z.coerce.number().positive(), obs: z.string().optional() });
export const insumoOrdemSchema  = z.object({ insumoId: z.string().min(1), quantidade: z.coerce.number().positive(), custoUnitario: z.coerce.number().min(0).optional(), obs: z.string().optional() });
export const lotePolpaSchema    = z.object({ produtoId: z.string().min(1), quantidadeKg: z.coerce.number().positive(), numeroEmbalagens: z.coerce.number().int().min(0).optional().or(z.literal("")), localId: z.string().min(1, "Selecione o local"), codigoManual: z.string().trim().toUpperCase().optional().or(z.literal("")) });

// lib/schemas/producao/pedidoVenda.ts
export const itemPedidoSchema = z.object({
  loteId: z.string().trim().min(1, "Selecione o lote"),
  quantidadeKg: z.coerce.number().positive("Informe a quantidade"),
  precoKg: z.coerce.number().min(0, "Preço inválido"),
  obs: z.string().trim().optional(),
});
export const pedidoVendaSchema = z.object({
  data: z.coerce.date(),
  clienteId: z.string().trim().min(1, "Selecione o cliente"),
  formaPagamento: z.enum(FORMA_PAGAMENTO_VENDA),
  statusPagamento: z.enum(STATUS_PAGAMENTO_VENDA),
  // [FG]
  classificacaoFiscal: z.enum(CLASSIFICACAO_FISCAL).optional(),
  tipoComprovante: z.enum(TIPO_COMPROVANTE).optional().or(z.literal(SEM_VALOR)),
  numeroDocumentoFiscal: z.string().trim().optional().or(z.literal("")),
  serieDocumentoFiscal: z.string().trim().optional().or(z.literal("")),
  chaveAcesso: z.string().trim().optional().or(z.literal("")),
  dataPagamento: z.coerce.date().optional().or(z.literal("")),
  obs: z.string().trim().optional().or(z.literal("")),
  confirmarLoteVencido: z.coerce.boolean().default(false),
  itens: z.array(itemPedidoSchema).min(1, "Inclua ao menos um lote"),
});

// lib/schemas/producao/ajusteEstoque.ts
export const ajusteEstoqueSchema = z.object({
  data: z.coerce.date(),
  loteId: z.string().min(1, "Selecione o lote"),
  quantidadeKg: z.coerce.number().refine((v) => v !== 0, "Quantidade não pode ser zero"),
  motivo: z.enum(MOTIVO_AJUSTE_ESTOQUE),
  obs: z.string().trim().optional().or(z.literal("")),
});
```

Tipos de saída (services):

```ts
export type StatusLote = "ZERADO" | "VENCIDO" | "VENCENDO" | "OK";
export type StatusVerificacao = "OK" | "VERIFICAR" | "NA";

export type LoteComSaldo = {
  id: string; codigo: string; categoria: "FRUTO" | "POLPA";
  produto: { id: string; codigo: string; descricao: string; conservacao: string; fruta: string };
  data: Date; dataValidade: Date; local: string; origem: string;
  entradaKg: number; processadoKg: number; vendidoKg: number; ajustesKg: number; saldoKg: number;
  diasParaVencer: number; status: StatusLote; custoKg: number; valorEstoque: number;
};

export type IndicadoresOrdem = {
  frutoKg: number; polpaKg: number; rendimento: number | null;
  diferencaBalancoKg: number; balancoPct: number | null; statusBalanco: StatusVerificacao;
  statusBranqueamento: StatusVerificacao;
  custoFruto: number; custoInsumos: number; custoTotal: number; custoKgPolpa: number | null;
  nLotesFruto: number;
};

export type PedidoVendaResumo = {
  id: string; numero: number; data: Date; cliente: { id: string; nome: string; canal: string | null };
  formaPagamento: string; statusPagamento: string; status: "ATIVO" | "CANCELADO";
  totalKg: number; valorTotal: number; custoTotal: number; margem: number; aReceber: number;
  alertas: string[]; entregaStatus: string | null; tituloId: string | null;
};

export type PainelProducao = { recepcao: {...}; vendas: {...}; estoque: {...}; porProduto: {...}[] }; // campos = tabela 3.3.7
export type Rastreio = { lote: LoteComSaldo; ordem?: {...}; lotesFruto: {...}[]; ordensConsumidoras: {...}[]; clientesDiretos: {...}[]; clientesDerivados: {...}[] };
```

Assinaturas puras de `calculosProducao.ts` (cada uma com teste):

```ts
gerarCodigoLote(prefixo: string, data: Date, sequencial: number): string
gerarNumeroOp(data: Date, sequencial: number): string
calcularPesoLiquido(brutoKg: number, descarteKg: number): number
calcularPercentualDescarte(brutoKg: number, descarteKg: number): number | null
calcularValidade(data: Date, validadeDias: number): Date
calcularIndicadoresOrdem(entrada: {...}, config: { toleranciaBalancoMassa: number; branqueamentoTempMinC: number; branqueamentoTempoMinS: number }, exigeBranqueamento: boolean): IndicadoresOrdem
avaliarBranqueamento(exige: boolean, tempC: number | null, tempoS: number | null, minC: number, minS: number): StatusVerificacao
calcularSaldoLote(entrada: number, processado: number, vendido: number, ajustes: number): number
classificarStatusLote(saldo: number, validade: Date, dataRef: Date, conservacao: ConservacaoProduto, alertas: { congelado: number; resfriado: number }): StatusLote
calcularItemVenda(kg: number, precoKg: number, custoKg: number): { valor: number; custo: number; margem: number }
calcularAtrasoEntrega(e: { status: StatusEntrega; dataPrevista: Date | null; dataRealizada: Date | null }, dataRef: Date): number | null
diferencaEmDias(a: Date, b: Date): number   // date-only, UTC
arredondar(valor: number, casas: number): number
```

### 3.6 API REST v1 (automação) — `src/app/api/v1/producao/**/route.ts`

Mesmo contrato de `docs/api-v1.md`: headers `Authorization: Bearer <chave>` + `X-Filial-CnpjCpf`, handler envolto em `executarRotaApi`. Regras de negócio violadas devem lançar `ErroValidacaoApi(mensagem, campos)` → **422** (nos services, criar classe `ErroRegraProducao extends Error { campos }` e, nas rotas, convertê-la em `ErroValidacaoApi`; não alterar `executarRotaApi`). Referências por **código** (produto, lote, OP) em vez de UUID, como `/api/v1/titulos` faz com CNPJ/CPF.

| Verbo | Rota | Permissão | Entrada | Resposta | Status |
|---|---|---|---|---|---|
| GET | `/api/v1/producao/produtos` | `producao:ler` | — | `ProdutoProducao[]` | 200 |
| GET | `/api/v1/producao/lotes?categoria=&status=&somenteComSaldo=true&dataReferencia=` | `estoque:ler` | query | `LoteComSaldo[]` | 200 / 422 |
| GET | `/api/v1/producao/lotes/{codigo}/rastreabilidade` | `producao:ler` | — | `Rastreio` | 200 / 404 |
| POST | `/api/v1/producao/recepcoes` | `producao:escrever` | `{ data, produtoCodigo, tipoOrigem, fornecedorCnpjCpf?, talhao?, safra?, pesoBrutoKg, descarteKg?, precoKg?, qualidade?, romaneio?, classificacaoFiscal?, tipoComprovante?, numeroDocumentoFiscal?, serieDocumentoFiscal?, chaveAcesso?, loteManual?, obs? }` | `{ id, lote: { codigo, quantidadeKg, dataValidade } }` | 201 / 422 |
| GET | `/api/v1/producao/recepcoes?de=&ate=` | `producao:ler` | query | lista | 200 |
| POST | `/api/v1/producao/ordens` | `producao:escrever` | `{ data, fruta, responsavel?, branqueamentoTempC?, branqueamentoTempoS?, aguaAdicionadaL?, residuoKg?, perdaKg?, safra?, obs?, consumos: [{ loteCodigo, quantidadeKg }], insumos?: [{ insumo, quantidade, custoUnitario? }], producao: [{ produtoCodigo, quantidadeKg, local, numeroEmbalagens?, loteManual? }], encerrar?: boolean }` | `{ id, numero, indicadores: IndicadoresOrdem, lotes: [{ codigo, dataValidade }] }` | 201 / 422 |
| GET | `/api/v1/producao/ordens/{numero}` | `producao:ler` | — | OP + indicadores | 200 / 404 |
| POST | `/api/v1/producao/pedidos` | `venda:escrever` | `{ data, clienteCnpjCpf, formaPagamento, statusPagamento, dataPagamento?, obs?, classificacaoFiscal?, tipoComprovante?, numeroDocumentoFiscal?, serieDocumentoFiscal?, chaveAcesso?, confirmarLoteVencido?, itens: [{ loteCodigo, quantidadeKg, precoKg }] }` | `PedidoVendaResumo` | 201 / 422 |
| GET | `/api/v1/producao/pedidos?de=&ate=&status=` | `venda:ler` | query | `PedidoVendaResumo[]` | 200 |
| POST | `/api/v1/producao/pedidos/{numero}/cancelar` | `venda:escrever` | `{ motivo }` | `PedidoVendaResumo` | 200 / 404 / 422 |
| POST | `/api/v1/producao/ajustes` | `estoque:ajustar` | `{ data, loteCodigo, quantidadeKg, motivo, obs? }` | `{ id, saldoKg }` | 201 / 422 |
| GET | `/api/v1/producao/painel?de=&ate=` | `producao:ler` | query | `PainelProducao` | 200 / 422 |

Códigos de erro herdados: 400 (header de filial ausente), 401 (chave), 403 (`PermissionError`/`FilialSomenteLeituraError`), 404 (`P2025`), 422 (Zod/`ErroValidacaoApi`), 500. Exemplo 422: `{ "erro": "Saldo insuficiente no lote AMC-260927-02: disponível 12.5 kg", "campos": ["itens"] }`.

Atualizar `docs/api-v1.md` com uma seção "Produção e vendas" (aditiva).

### 3.7 Exportações (CSV/XLSX)

Rotas `GET .../export/route.ts` (padrão `financeiro/contas-a-receber/export/route.ts` + `responderExport`): `/producao/estoque/export`, `/producao/vendas/export` (1 linha por item, igual à aba `VENDAS`), `/producao/recepcao/export`, `/producao/ordens/export`, `/producao/relatorios/{mensal|vendas|origem|processamento|estoque}/export`. Checagem com `podeExecutar(...)` → `403` texto "Acesso negado".

---

## 4. Especificação de Interface / Frontend

### 4.1 Navegação

Acrescentar **uma nova seção** em `src/app/(dashboard)/nav-items.ts` (sem alterar as existentes), posicionada após "Controladoria":

```ts
{
  titulo: "Produção e vendas",
  itens: [
    { href: "/producao/painel", label: "Painel" },
    { href: "/producao/recepcao", label: "Recepção de fruto" },
    { href: "/producao/ordens", label: "Ordens de processamento" },
    { href: "/producao/estoque", label: "Estoque por lote" },
    { href: "/producao/vendas", label: "Vendas" },
    { href: "/producao/entregas", label: "Entregas" },
    { href: "/producao/ajustes", label: "Ajustes de estoque" },
    { href: "/producao/rastreabilidade", label: "Rastreabilidade" },
    { href: "/producao/relatorios", label: "Relatórios" },
    { href: "/producao/cadastros", label: "Cadastros e configurações" },
  ],
},
```

`NavItem.permitido` filtra por `Perfil[]`; como o módulo usa ações próprias, definir os perfis com `producao:ler` (todos, ver 5.1) — ou seja, sem `permitido` — e proteger cada página com `requirePermission`. Se D1 criar o perfil `PRODUCAO`, conferir que `sidebar.tsx` não precisa de ajuste (ele só faz `item.permitido.includes(perfil)`).

### 4.2 Telas (rotas em `src/app/(dashboard)/producao/`)

| Rota | Tipo | Conteúdo | Permissão (ler / escrever) |
|---|---|---|---|
| `painel/page.tsx` | Server | Filtro período (de/até) + `dataReferencia`; 3 colunas de `Card` (Recepção e processamento · Vendas · Estoque e alertas); tabelas "Estoque atual por produto" e "Vendas no período por produto"; alertas com `Badge` (vencendo/vencido/verificar) linkando para as listas filtradas | `producao:ler` |
| `recepcao/page.tsx` | Server + dialog | Tabela de recepções (lote, data, produto, origem, talhão, bruto, descarte, líquido, % desc., preço, valor, qualidade, romaneio, **[FG]** `Badge` Fiscal/Gerencial + nº da nota) com filtro período/origem/fruta/**classificação**; botão "Nova recepção"; ações Editar/Excluir/Gerar título a pagar/Etiqueta; `ExportarLinks` | `producao:ler` / `producao:escrever` |
| `recepcao/recepcao-dialog-form.tsx` | Client | Campos da 3.5; `tipoOrigem` alterna Fornecedor × Talhão; auxiliar "caixas × kg/caixa" (preenche bruto) e "preço por caixa" (preenche R$/kg) usando `kgPorCaixaPadrao`; mostra líquido/valor calculados ao vivo; **[FG]** seção "Documento fiscal" (só para TERCEIRO) igual à do formulário de título, pré-preenchida pelo padrão do fornecedor | — |
| `ordens/page.tsx` | Server | Lista de OPs (nº, data, fruta, fruto kg, polpa kg, rendimento, balanço %, status balanço, branqueamento, custo/kg, status OP) + "Nova OP" | `producao:ler` / `producao:escrever` |
| `ordens/[id]/page.tsx` | Server | Cabeçalho editável (dialog) + **cartão de indicadores** (3.3.3) + 3 seções: **Lotes de fruto consumidos** (tabela + dialog "Adicionar consumo" com `Select` de lotes FRUTO ativos da mesma fruta, mostrando saldo), **Polpa produzida** (tabela de lotes gerados + dialog "Adicionar lote de polpa", link etiqueta), **Insumos** (tabela + dialog); botões Encerrar/Reabrir | idem |
| `estoque/page.tsx` | Server | Tabela `LoteComSaldo` com filtros (categoria, produto, local, status, "somente com saldo", `dataReferencia`); `Badge` de status por cor; link para rastreabilidade e etiqueta; `ExportarLinks` | `estoque:ler` |
| `vendas/page.tsx` | Server | Lista de pedidos (nº, data, cliente, canal, kg, valor, margem, pagamento, status, entrega, alertas) com filtros período/cliente/status pagamento/status; "Novo pedido" mostra **Próximo nº** | `venda:ler` / `venda:escrever` |
| `vendas/pedido-dialog-form.tsx` | Client | Cabeçalho + **itens dinâmicos** (lote via `Select` de lotes ativos com saldo/validade/produto exibidos; kg; R$/kg com default `precoReferenciaKg`; total da linha) serializados em `<input type="hidden" name="itens">`; totais; fluxo de confirmação de lote vencido; **[FG]** seção "Documento fiscal" igual à do formulário de título, pré-preenchida pelo padrão do cliente | — |
| `vendas/[id]/page.tsx` | Server | Detalhe do pedido: itens com custo/margem, entrega, título financeiro vinculado (link para contas a receber), ações Editar/Cancelar/Registrar pagamento/Gerar título | idem |
| `entregas/page.tsx` | Server + dialog | Pedidos ATIVOS com/sem entrega: cliente, kg, valor, data prevista/realizada, local, responsável/veículo, status, atraso (dias) | `venda:ler` / `venda:escrever` |
| `ajustes/page.tsx` | Server + dialog | Lista de ajustes + "Novo ajuste" (lote ativo, kg ±, motivo, obs) | `estoque:ler` / `estoque:ajustar` |
| `rastreabilidade/page.tsx` | Server | Campo de busca por código de lote (`?lote=`), blocos da 3.3.7; botão imprimir | `producao:ler` |
| `lotes/[id]/etiqueta/page.tsx` | Server | Etiqueta para impressão (CSS `@media print` escondendo sidebar/header; tamanho configurável 100 × 70 mm) | `producao:ler` |
| `relatorios/page.tsx` | Server | Índice com links para os 5 relatórios | `producao:ler` |
| `relatorios/{mensal,vendas,origem,processamento,estoque}/page.tsx` | Server + charts client | Tabelas da 3.3.7 + gráficos (Recharts via `components/ui/chart.tsx`) + `ExportarLinks` | `producao:ler` (vendas: `venda:ler`) |
| `cadastros/page.tsx` | Server | Índice: Frutas, Produtos, Talhões, Locais, Insumos, Dados comerciais de clientes, Configurações | `producao:ler` |
| `cadastros/{frutas,produtos,talhoes,locais,insumos}/page.tsx` + `*-dialog-form.tsx` | Server + dialog | CRUD "flat" com Ativar/Inativar — **cópia estrutural de `cadastros/safras`** | `producao:ler` / `producao:configurar` |
| `cadastros/clientes-comercial/page.tsx` | Server + dialog | Lista dos `Cliente` da empresa com canal/município/endereço (upsert do perfil comercial); link "Cadastrar cliente" para `/cadastros/clientes` existente | `producao:ler` / `producao:configurar` |
| `cadastros/configuracoes/page.tsx` | Server + form | Form de `ConfigProducao` (alertas, branqueamento, tolerância, registro ADEPARA, bloqueio de saldo negativo, integração financeira + `Select` de categorias RECEITA/DESPESA da filial, kg por caixa) | `producao:ler` / `producao:configurar` |

Estados vazios: toda página de lançamento deve orientar quando faltam cadastros ("Cadastre ao menos um produto do tipo Fruto em Cadastros e configurações" — equivalente à regra "cadastre antes de lançar" da planilha). Se `ConfigProducao` não existir, os services usam os defaults (criar sob demanda com `upsert` no primeiro acesso de escrita).

### 4.3 Componentes existentes a reutilizar (não recriar)

| Necessidade | Reutilizar |
|---|---|
| Tabelas | `@/components/ui/table` (`Table`, `TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell`) |
| Dialogs de formulário | `@/components/ui/dialog` + padrão `useActionState` + `useEffect(() => { if (state.sucesso) setAberto(false) })` de `safra-dialog-form.tsx` |
| Campos | `Input`, `Label`, `Select*` (base-ui: `DialogTrigger render={<Button/>}`), `Checkbox`, `Button`, `Badge`, `Card*`, `Separator`, `Accordion` (seções da OP) |
| "Nenhum" em selects opcionais | `SEM_VALOR` de `@/lib/schemas/enums` |
| Gráficos | `@/components/ui/chart` (`ChartContainer` etc.), exemplos em `dashboard-executivo/*-chart.tsx` |
| Toasts | `sonner` (`@/components/ui/sonner`) |
| Exportação | `ExportarLinks` (`app/(dashboard)/_shared/exportar-links.tsx`) + `responderExport` (`lib/export/responder.ts`) |
| Filtros por URL | padrão `financeiro/_titulos/filtro-titulos-url.ts` + `barra-de-filtros.tsx` (com testes) |
| Ano/mês | `controladoria/_shared/seletor-ano-mes.tsx` (relatório mensal) |
| Listas dinâmicas em form | padrão "parcelas" de `financeiro/_titulos/titulo-dialog-form.tsx` (state em array + hidden JSON) |
| Cliente/Fornecedor | `listarClientes(empresaId)`, `listarFornecedores(empresaId)` (services existentes, somente leitura) |
| Safra | `listarSafras(filialId)` |
| Categorias | `listarCategoriasFinanceiras(filialId)` (filtrar por `tipo`) |
| Formatação | criar `src/lib/formatacaoProducao.ts` com `formatarKg`, `formatarMoeda`, `formatarPercentual`, `formatarData` (dd/mm/aaaa a partir de `toISOString().slice(0,10)`, como `safras/page.tsx`) — não alterar utilitários existentes |

### 4.4 Estado local e integração com a API

- **Leitura**: sempre em Server Components chamando services diretamente (sem `fetch` interno), com `Promise.all` para cargas paralelas (padrão `contas-a-receber/page.tsx`). Filtros em `searchParams` (Promise no Next 16 — `await searchParams`).
- **Escrita**: Server Actions + `useActionState`; após sucesso, `revalidatePath` dos caminhos afetados (tabela 3.4) — o estoque precisa ser revalidado em toda ação que move saldo.
- **Estado de cliente** só para: abertura de dialogs, linhas dinâmicas (itens/consumos), cálculo ao vivo de totais (usar as mesmas funções puras de `calculosProducao.ts`, importáveis no client porque não usam Prisma), confirmação de lote vencido.
- **Opções de `Select`** (lotes ativos, produtos por categoria, locais, insumos) carregadas no Server Component pai e passadas como props serializáveis (converter `Decimal` → `number` e `Date` → ISO antes de passar a Client Components).
- **Botões de escrita** só renderizados quando `podeEscreverProducao(perfil, podeAlterarFilial)` etc. (helpers booleanos, padrão `podeEscreverTitulo`), mas a garantia real é o `requirePermission` no service.
- API REST v1 não é consumida pela UI.

---

## 5. Matriz de Impacto e Segurança

### 5.1 Permissões (RBAC)

Novas ações em `src/server/auth/permissions.ts` — **apenas adicionar** membros ao union `Acao` e aos `Set`s:

| Ação | Significado |
|---|---|
| `producao:ler` | ver painel, recepções, OPs, rastreabilidade, relatórios, cadastros do módulo |
| `producao:escrever` | lançar/editar recepções e OPs (consumo, produção, insumos), encerrar OP |
| `producao:configurar` | cadastros do módulo (frutas, produtos, talhões, locais, insumos, dados comerciais) e `ConfigProducao` |
| `estoque:ler` | estoque por lote |
| `estoque:ajustar` | lançar ajustes de estoque |
| `venda:ler` | pedidos, entregas, relatório de vendas |
| `venda:escrever` | criar/editar/cancelar pedidos, registrar pagamento operacional, entregas |

Matriz proposta:

| Perfil | producao:ler | producao:escrever | producao:configurar | estoque:ler | estoque:ajustar | venda:ler | venda:escrever |
|---|---|---|---|---|---|---|---|
| ADMINISTRADOR | ✔ (TODAS) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **PRODUCAO** (novo, D1) | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ |
| FINANCEIRO | ✔ | — | — | ✔ | — | ✔ | ✔ |
| TESOURARIA | ✔ | — | — | ✔ | — | ✔ | — |
| GESTOR | ✔ | — | ✔ | ✔ | — | ✔ | — |
| AUDITOR | ✔ | — | — | ✔ | — | ✔ | — |
| CONSULTA | ✔ | — | — | ✔ | — | ✔ | — |

Ações extras restritas a ADMINISTRADOR (checagem `sessao.perfil === "ADMINISTRADOR"` além da ação): reabrir OP encerrada, excluir ajuste.

Se D1 for **não criar** o perfil `PRODUCAO`: atribuir `producao:escrever`, `estoque:ajustar` e `producao:configurar` ao `FINANCEIRO` e manter o resto.

Se D1 **criar** o perfil: `PERMISSOES` é `Record<Perfil, ...>` — o TypeScript obrigará a incluir a chave `PRODUCAO`; incluir também em: seletor de perfil em `usuarios/perfil-form.tsx`/`novo-usuario-dialog.tsx` (lista de opções), `lib/schemas/usuario.ts` (enum Zod de perfis, se houver lista fixa) — conferir com `grep -rn "CONSULTA" src` todos os lugares que enumeram perfis.

Helpers booleanos (para UI): `podeEscreverProducao`, `podeConfigurarProducao`, `podeAjustarEstoque`, `podeEscreverVenda` — `podeExecutar(perfil, acao) && podeAlterarFilial`.

Isolamento:
- Toda query com `filialId: sessao.filialId`; `findUniqueOrThrow({ where: { id, filialId } })` antes de update/delete (padrão existente) — garante 404/erro em acesso cruzado.
- `Cliente`/`Fornecedor` validados por `empresaId: sessao.empresaId`.
- Filial somente leitura (`podeAlterar = false`) → `FilialSomenteLeituraError` em toda escrita.
- Auditoria: entidades `RecepcaoFruto`, `OrdemProducao`, `ConsumoOrdemProducao`, `InsumoOrdemProducao`, `Lote`, `PedidoVenda`, `Entrega`, `AjusteEstoque`, `ConfigProducao`, `Fruta`, `ProdutoProducao`, `Talhao`, `LocalArmazenamento`, `Insumo`, `PerfilComercialCliente`; ações `CRIAR`, `ATUALIZAR`, `EXCLUIR`, `INATIVAR`, `REATIVAR`, `ENCERRAR`, `REABRIR`, `CANCELAR`, `CONFIRMAR_LOTE_VENCIDO`, `GERAR_TITULO`. A tela `/auditoria` existente passa a exibi-las sem mudança (filtra por `entidade` livre — conferir se o filtro de entidade é lista fixa; se for, acrescentar as novas opções).

### 5.2 Riscos de regressão e mitigação

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| R1 | Migration alterar tabela existente | Quebra produção | Gerar com `--create-only`, revisar SQL (só `CREATE`/`ADD CONSTRAINT` em tabelas novas, `ADD VALUE` no enum); teste `npm run db:deploy` em banco cópia/staging antes de `main` |
| R2 | Back-relations adicionadas a `Filial`, `Cliente`, `Fornecedor`, `Safra`, `Titulo`, `CategoriaFinanceira`, `Usuario` | Tipos do Prisma Client mudam (campos novos opcionais em `include`) | São aditivas; nenhum `select`/`include` existente as referencia. Rodar `npm run build` + `npm run test` completos |
| R3 | Novo valor `PRODUCAO` no enum `Perfil` | `Record<Perfil, …>` e `switch` exaustivos deixam de compilar | Ajustar todos os pontos apontados pelo `tsc` (é desejável — força decisão explícita). Nenhum dado existente muda |
| R4 | FKs RESTRICT de tabelas novas para `clientes`/`fornecedores`/`titulos`/`categorias_financeiras`/`usuarios` | Bloqueio de exclusão física desses registros | O ERP não exclui clientes/fornecedores (só inativa) e não há exclusão física de `Titulo` nos services (verificado: só cancelamento de parcela). Se uma exclusão de título for criada no futuro, ela deve desvincular `tituloId` antes |
| R5 | `limparFixtureFinanceiro` (testes existentes) apaga cliente/fornecedor/filial | Testes do módulo deixam lixo e quebram a limpeza | Criar `limparFixtureProducao(fixture)` que apaga, nesta ordem: itens → entregas → pedidos → ajustes → consumos → insumos OP → lotes → OPs → recepções → perfis comerciais → produtos/frutas/talhões/locais/insumos → config; chamá-la **antes** de `limparFixtureFinanceiro` no `afterAll`. Não alterar a fixture existente |
| R6 | Títulos gerados pelo módulo aparecem em contas a receber, fluxo de caixa, orçamento, dashboard | Mudança de números financeiros | Comportamento desejado, mas **opt-in** (`integrarFinanceiro = false` por padrão) e rastreável (`documento = PV-n / RF-...`) |
| R7 | Cancelar pedido com título já baixado | Inconsistência financeira | Bloquear (3.3.4); nunca estornar baixa automaticamente |
| R8 | Concorrência (2 usuários vendendo o mesmo lote / numeração duplicada) | Saldo negativo / código repetido | `FOR UPDATE` no lote + advisory lock na numeração + `@@unique` |
| R9 | Fuso horário em validade (UTC × America/Belem) | Lote "vence" um dia antes/depois | Colunas `@db.Date`; `dataReferencia` calculada no fuso da filial; funções de diferença de dias em UTC date-only, testadas |
| R10 | Performance das agregações de estoque/painel | Lentidão com muitos lotes | `groupBy` por `loteId` + índices `[filialId, data]`, `[loteId]`; limitar listas a lotes com saldo por padrão |
| R11 | Edição de `nav-items.ts` | Menu quebrado | Apenas adicionar um objeto ao array; teste manual de cada perfil |
| R12 | Nome de modelo colidir com futuro módulo de estoque/compras | Refactor futuro | Nomes específicos (`ProdutoProducao`, `LocalArmazenamento`, `PedidoVenda`) e tabelas próprias |
| R13 | `ALTER TYPE ... ADD VALUE` em transação | Falha no deploy | Migration separada se necessário (2.6 item 6) |
| R14 **[FG]** | Implementar o módulo antes do recurso Fiscal × Gerencial | Schema não compila (enums/campos ausentes) | Checklist 6.0.0: confirmar que a migration `add_classificacao_fiscal` já está aplicada |

Validação de não-regressão obrigatória antes do merge: `npm run lint`, `npm run test` (suíte inteira, não só o módulo), `npm run build`, revisão manual do `migration.sql`, smoke test das telas existentes (contas a receber, fluxo de caixa, cadastros de clientes/fornecedores, auditoria) com cada perfil.

---

## 6. Checklist de Implementação Passo a Passo (para Claude Code)

> Executar **na ordem**. Cada bloco termina com verificação; não avançar com teste vermelho. Commits em Conventional Commits (`feat(producao): ...`, `test(producao): ...`), um por tarefa ou grupo pequeno — o release-please gera o CHANGELOG a partir deles. Trabalhar em branch `feat/producao-vendas` a partir de `staging`.

### 6.0 Preparação

- [ ] 6.0.0 **[FG]** Confirmar que `PLANO_IMPLEMENT_FISCAL-GERENCIAL.md` está implementado e em produção/staging (migration `add_classificacao_fiscal` aplicada, `src/server/services/classificacaoFiscal.ts` existente). Se não estiver, parar e implementá-lo primeiro.
- [ ] 6.0.1 Ler `AGENTS.md`, `docs/fases/fase-1-fundacao.md` (arquitetura/padrões), `node_modules/next/dist/docs/01-app` (rotas dinâmicas, Server Actions, `params` Promise).
- [ ] 6.0.2 Ler os arquivos-modelo: `cadastros/safras/*`, `server/services/safra.ts`, `server/services/titulo.ts`, `server/services/baixa.ts` (transação), `financeiro/_titulos/*` (listas dinâmicas, filtros URL), `financeiro/contas-a-receber/export/route.ts`, `api/v1/titulos/route.ts` + `.test.ts`, `server/services/financeiroTestFixtures.ts`.
- [ ] 6.0.3 `docker compose up -d && npm install && npm run db:migrate && npm run test` — registrar a linha de base (todos verdes).
- [ ] 6.0.4 Criar `docs/superpowers/specs/<data>-producao-vendas-design.md` resumindo este documento e as decisões D1–D6 confirmadas (padrão do repositório), e `docs/fases/fase-7-producao-vendas.md` + linha na tabela de `docs/fases/README.md`.

### 6.1 DB / Migrations

- [ ] 6.1.1 Adicionar os 12 enums (2.3) ao `schema.prisma`.
- [ ] 6.1.2 Adicionar os 16 modelos (2.4) ao final do `schema.prisma`.
- [ ] 6.1.3 Adicionar as back-relations (2.5) nos modelos existentes — **somente** as linhas listadas; (se D1) `PRODUCAO` no enum `Perfil`.
- [ ] 6.1.4 `npx prisma format` → `npx prisma migrate dev --name add_producao_vendas --create-only`. Inspecionar `migration.sql`: `grep -nE "ALTER TABLE \"(empresas|filiais|usuarios|clientes|fornecedores|safras|titulos|categorias_financeiras|parcelas|baixas)\"|DROP" migration.sql` deve retornar **apenas** linhas `ADD CONSTRAINT ... FOREIGN KEY` em que a tabela alterada é nova (ou nada). Qualquer outra coisa: parar.
- [ ] 6.1.5 Acrescentar as CHECK constraints (2.6 item 3) ao final do `migration.sql`.
- [ ] 6.1.6 `npm run db:migrate` (aplica) → `npm run db:generate` → `npm run build` (deve compilar; se D1, corrigir os `Record<Perfil,…>` apontados).
- [ ] 6.1.7 `npm run test` — suíte existente 100% verde (prova de não regressão do schema).
- [ ] 6.1.8 (Opcional) `prisma/seed-producao.ts` + script `db:seed:producao` (2.7); rodar e conferir dados.

### 6.2 Backend / API

**Fundação**
- [ ] 6.2.1 `src/lib/schemas/enumsProducao.ts` — consts `as const` espelhando os enums + `ROTULOS_*` (textos de `LISTAS`).
- [ ] 6.2.2 `permissions.ts`: novas `Acao` + matriz 5.1 + helpers booleanos. Testes em `permissions.test.ts` (novo `describe`, sem editar os existentes): cada perfil × ação da matriz.
- [ ] 6.2.3 `services/producao/calculosProducao.ts` + `calculosProducao.test.ts` — TDD de todas as funções da 3.5, incluindo casos da planilha:
  - `gerarCodigoLote("FA", 2026-09-10, 1) === "FA-260910-01"`; `gerarNumeroOp(2026-09-27, 1) === "OP-260927-01"`; sequência 100 → `-100`.
  - Líquido 56 − 0 = 56; % descarte com bruto 0 → `null`.
  - OP: fruto 100, água 20, polpa 90, resíduo 25, perda 3 → diferença 2, balanço 2/120 = 1,67 % → `OK` (tolerância 3 %); polpa 80 → diferença 12 → 10 % → `VERIFICAR`.
  - Branqueamento açaí 80 °C/10 s → `OK`; 79 °C → `VERIFICAR`; acerola → `NA`.
  - Status lote: saldo 0 → `ZERADO` (mesmo vencido); congelado com 30 dias → `VENCENDO`, 31 → `OK`; resfriado 1 dia → `VENCENDO`; −1 → `VENCIDO`.
  - Venda 14 kg × 4,285714 → valor 60,00 (arredondar a 2 casas na exibição/agregação).
  - Atraso: prevista 01/11, realizada 03/11 → 2; cancelada → `null`; sem realizada, ref 05/11 → 4.
- [ ] 6.2.4 `services/producao/numeracaoProducao.ts` (lock + count + retry P2002) + teste de integração com 2 criações concorrentes no mesmo dia (`Promise.all`) gerando `-01` e `-02`.
- [ ] 6.2.5 `services/producao/producaoTestFixtures.ts`: `criarFixtureProducao(sufixo, perfil)` (usa `criarFixtureFinanceiro` + frutas, produtos FA/AMC/ACC, talhão, local, insumo, config) e `limparFixtureProducao` (ordem da R5).

**Cadastros e configuração**
- [ ] 6.2.6 Schemas Zod + services (listar/criar/atualizar/definirAtivo) para `Fruta`, `ProdutoProducao` (código `^[A-Z]{2,6}$`, upper), `Talhao` (fruta da filial), `LocalArmazenamento`, `Insumo` — cópia do padrão `safra.ts` com auditoria. Testes: unicidade por filial, isolamento entre filiais, `FilialSomenteLeituraError`, `PermissionError`.
- [ ] 6.2.7 `perfilComercialCliente.ts` (upsert; valida cliente da empresa) + teste.
- [ ] 6.2.8 `configProducao.ts`: `obterConfigProducao(filialId)` (retorna defaults se não existir), `salvarConfigProducao` (upsert; valida categorias da filial e do `tipo` certo: RECEITA/DESPESA) + teste.

**Lançamentos**
- [ ] 6.2.9 `recepcaoFruto.ts`: criar (recepção + lote na transação), listar com filtros, atualizar (regras 3.3.2/3.3.6), excluir. Testes: código gerado, validade = data + dias, TERCEIRO sem fornecedor → erro, fornecedor de outra empresa → erro, editar peso abaixo do já movimentado → erro.
- [ ] 6.2.10 `estoqueProducao.ts`: `listarLotesComSaldo`, `obterSaldoLote(tx, loteId, opts)`, `bloquearLoteParaAtualizacao(tx, loteId, filialId)`. Testes de saldo combinando consumo + venda ATIVA + venda CANCELADA (ignorada) + ajustes ±.
- [ ] 6.2.11 `ordemProducao.ts`: criar/atualizar cabeçalho, adicionar/remover consumo (fruta igual, saldo, snapshot custo), insumo (snapshot), lote de polpa (fruta igual, local, validade, código), `obterOrdemComIndicadores`, encerrar/reabrir, `recalcularCustoItensVendaDaOp`. Testes: indicadores batem com 6.2.3; fruta diferente → erro; OP encerrada → edição bloqueada; custo/kg da polpa = (fruto + insumos)/polpa.
- [ ] 6.2.12 `pedidoVenda.ts`: criar (nº sequencial, itens, custo snapshot, saldo com `FOR UPDATE`, lote vencido/confirmação), listar com resumo, obter, atualizar (saldo excluindo o próprio pedido), cancelar (entrega + parcelas), registrar pagamento. Testes: saldo insuficiente → erro; com `bloquearSaldoNegativo=false` → permite e marca alerta; venda concorrente do último kg → só uma passa; cancelado devolve saldo.
- [ ] 6.2.13 `entrega.ts` (upsert por pedido, status, atraso) + teste.
- [ ] 6.2.14 `ajusteEstoque.ts` (criar com validação de saldo para negativos; excluir só ADMIN) + teste.
- [ ] 6.2.15 `integracaoFinanceiraProducao.ts` reutilizando `criarTitulo(..., tx)` e `cancelarParcela`; testes: título RECEBER criado com valor total e vínculo; idempotência; sem `titulo:escrever` → `PermissionError`; integração desligada → erro de configuração; cancelamento de pedido cancela parcela em aberto e bloqueia se houver baixa aprovada.

**Consultas**
- [ ] 6.2.16 `rastreabilidade.ts` (ascendente + descendente) + teste com cadeia recepção → OP → polpa → venda.
- [ ] 6.2.17 `painelProducao.ts` + teste com dataset controlado (conferir cada indicador da 3.3.7).
- [ ] 6.2.18 `relatoriosProducao.ts` (mensal, vendas, origem, processamento, estoque) + testes dos agregados principais (t/ha, ocupação %, top 10 ordenado).

**API REST (pode ser feita depois da UI)**
- [ ] 6.2.19 Rotas da 3.6 com `executarRotaApi`, resolução por código/CNPJ, conversão `ErroRegraProducao → ErroValidacaoApi`. Um `route.test.ts` por rota (200/201, 401 sem chave, 403 perfil sem permissão, 422 validação), padrão `api/v1/safras/route.test.ts`.
- [ ] 6.2.20 Atualizar `docs/api-v1.md` (seção nova).

### 6.3 Frontend / UI

- [ ] 6.3.1 `src/lib/formatacaoProducao.ts` (+ teste).
- [ ] 6.3.2 Seção "Produção e vendas" em `nav-items.ts` (4.1).
- [ ] 6.3.3 Cadastros: `producao/cadastros/page.tsx` (índice) + `frutas`, `produtos`, `talhoes`, `locais`, `insumos` (page + dialog + actions, cópia de `cadastros/safras`).
- [ ] 6.3.4 `producao/cadastros/clientes-comercial` e `producao/cadastros/configuracoes`.
- [ ] 6.3.5 `producao/recepcao` (lista, filtros URL + teste do parser, dialog com auxiliar de caixas, export).
- [ ] 6.3.6 `producao/ordens` (lista) e `producao/ordens/[id]` (cabeçalho, indicadores, consumos, polpa, insumos, encerrar/reabrir).
- [ ] 6.3.7 `producao/estoque` (lista + filtros + export).
- [ ] 6.3.8 `producao/vendas` (lista + dialog de pedido com itens dinâmicos + confirmação de lote vencido) e `producao/vendas/[id]` (detalhe, cancelar, pagamento, gerar título).
- [ ] 6.3.9 `producao/entregas` e `producao/ajustes`.
- [ ] 6.3.10 `producao/rastreabilidade` e `producao/lotes/[id]/etiqueta` (CSS de impressão).
- [ ] 6.3.11 `producao/painel`.
- [ ] 6.3.12 `producao/relatorios` (índice + 5 relatórios com gráficos e export).
- [ ] 6.3.13 (Se D1) adicionar `PRODUCAO` às opções de perfil em `usuarios/novo-usuario-dialog.tsx`, `usuarios/perfil-form.tsx` e `lib/schemas/usuario.ts`.
- [ ] 6.3.14 `content/ajuda/passo-a-passo.md`: seção "Produção e vendas" com a rotina semanal (adaptada da aba `INICIO`).

### 6.4 Testes / Validação

- [ ] 6.4.1 `npm run lint` sem erros novos.
- [ ] 6.4.2 `npm run test` — suíte **inteira** verde (existentes + novos).
- [ ] 6.4.3 `npm run build` — type-check completo.
- [ ] 6.4.4 Teste de aceitação manual reproduzindo a planilha (dataset da 1.4): cadastrar produtos/talhões/clientes; lançar as 16 recepções FA de set–out/2026; lançar os pedidos; conferir no Painel (out/2026): fruto de açaí recebido **1.820 kg**, faturamento **R$ 7.600,00**, kg vendidos **1.820**, preço médio **R$ 4,18/kg**, nº de pedidos **16**, ticket médio **R$ 475,00** — valores idênticos aos da aba `PAINEL` para 01–31/10/2026.
- [ ] 6.4.5 Cenário OP completo: recepção 100 kg FA → OP consome 100 kg, água 20 L, produz 50 kg AMC + 40 kg AGC, resíduo 27 kg, perda 1 kg → balanço OK; insumos 50 embalagens 1 kg + 4 h mão de obra → custo/kg = (custo fruto + 17,50 + 48)/90; vender 10 kg AMC; rastrear `AMC-...` → mostra o lote FA de origem e o cliente; rastrear o lote FA → mostra o cliente da polpa (descendente).
- [ ] 6.4.6 Segurança: com perfil CONSULTA nenhuma ação de escrita aparece nem funciona (chamar action diretamente → erro de permissão); filial com `podeAlterar = false` bloqueia escrita; ID de lote de outra filial → erro.
- [ ] 6.4.7 Regressão: smoke test de contas a pagar/receber, baixa+aprovação, conciliação, fluxo de caixa, orçamento, auditoria, cadastros de cliente/fornecedor com ADMINISTRADOR e FINANCEIRO.
- [ ] 6.4.8 Com `integrarFinanceiro = true`: pedido gera título em Contas a receber com documento `PV-<n>`; baixa pelo fluxo existente; fluxo de caixa reflete.
- [ ] 6.4.9 Deploy em `staging` (workflow de migration) → validar → PR para `main`.

### 6.5 (Opcional) Migração dos dados da planilha

- [ ] 6.5.1 `scripts/importar-planilha-producao.ts` (tsx, usa `exceljs` já instalado): lê `CAD_*`, `ENTRADA_FRUTO`, `PROCESSAMENTO`, `PROC_*`, `VENDAS`, `ENTREGAS`, `AJUSTES` (linhas a partir da 5; valores calculados), parâmetros `--arquivo`, `--filial-cnpjcpf`, `--usuario-email`, `--dry-run`.
- [ ] 6.5.2 Preservar códigos de lote/OP **exatamente** como estão na planilha (gravar como `codigoManual = true`) — já podem estar impressos em etiquetas/comunicados à ADEPARA; preservar nº de pedido.
- [ ] 6.5.3 Clientes/fornecedores da planilha sem CPF/CNPJ: relatório de pendências no `--dry-run` (não inventar documento); casar por nome com `Cliente`/`Fornecedor` existentes (normalizado).
- [ ] 6.5.3a **[FG]** A planilha não registra nota nas vendas nem nas recepções: parâmetro `--classificacao-padrao=FISCAL|GERENCIAL` (obrigatório), sobrescrito pelo `classificacaoFiscalPadrao` do cliente/fornecedor quando existir; recepções próprias ficam `null`.
- [ ] 6.5.4 Agrupar linhas de `VENDAS` por nº de pedido (cabeçalho = primeira linha); divergências de cliente/pagamento entre linhas do mesmo pedido → relatório.
- [ ] 6.5.5 Rodar em staging, conferir Painel × aba `PAINEL`, depois produção.

---

## Apêndice A — Dicionário campo a campo (planilha → modelo)

| Aba!coluna | Campo | Modelo.campo | Tipo/regra |
|---|---|---|---|
| ENTRADA_FRUTO!A | LOTE | `Lote.codigo` | gerado (3.3.1) |
| ENTRADA_FRUTO!B | Data recepção | `RecepcaoFruto.data` / `Lote.data` | date |
| ENTRADA_FRUTO!C | Produto (fruto) | `RecepcaoFruto.produtoId` / `Lote.produtoId` | produto FRUTO |
| ENTRADA_FRUTO!D | Origem / fornecedor | `tipoOrigem` + `fornecedorId` | enum + FK |
| ENTRADA_FRUTO!E | Talhão | `talhaoId` | FK |
| ENTRADA_FRUTO!F,G,H | Bruto, descarte, preço | `pesoBrutoKg`, `descarteKg`, `precoKg` | decimal |
| ENTRADA_FRUTO!I,J,K | Qualidade, romaneio/NF, obs | `qualidade`, `romaneio` + **[FG]** `numeroDocumentoFiscal` (quando o valor for nota), `obs` | classificação definida pela importação |
| ENTRADA_FRUTO!L | Lote manual | `Lote.codigo` + `codigoManual=true` | |
| ENTRADA_FRUTO!M–R | tipo, fruta, líquido, %, valor, idx | derivados | não persistir (exceto `Lote.quantidadeKg = líquido`) |
| PROCESSAMENTO!A–J | OP, data, fruta, responsável, branq. °C/s, água, resíduo, perda, obs | `OrdemProducao.*` | |
| PROCESSAMENTO!K–W | fruto, polpa, rendimento, balanço, status, custos, idx, nº lotes | derivados (`IndicadoresOrdem`) | |
| PROC_CONSUMO!A–D | OP, lote, kg, obs | `ConsumoOrdemProducao` | + `custoKg` snapshot |
| PROC_CONSUMO!E–N | data OP, produto, origem, custo, talhão, confere fruta, chaves, data recepção, fruta | derivados / validação bloqueante | |
| PROC_PRODUCAO!A–G | lote polpa, OP, produto, kg, embalagens, local, lote manual | `Lote` (POLPA) | |
| PROC_PRODUCAO!H–N | fabricação, validade, fruta, descrição, idx, chave, confere fruta | `Lote.data`, `Lote.dataValidade`; resto derivado | |
| PROC_INSUMOS!A–D | OP, insumo, qtd, obs | `InsumoOrdemProducao` | + `custoUnitario` snapshot |
| VENDAS!A,B,C,G,H,I,J | data, pedido, cliente, forma, status, data pgto, obs | `PedidoVenda.*` | cabeçalho |
| VENDAS!D,E,F | lote, kg, preço | `ItemPedidoVenda.*` | item |
| VENDAS!K–V | produto, descrição, categoria, fruta, valor, canal, custo, margem, chave, alerta, a receber | derivados (`PedidoVendaResumo`) | `custoKg` snapshot |
| ENTREGAS!A–H | pedido, prevista, realizada, local, responsável, status, recebido por, obs | `Entrega.*` | |
| ENTREGAS!I–L | cliente, kg, valor, atraso | derivados | |
| AJUSTES!A–E | data, lote, kg ±, motivo, obs | `AjusteEstoque.*` | |
| CAD_PRODUTOS!A–H | código…armazenamento | `ProdutoProducao.*` | |
| CAD_FORNECEDORES!A–F | nome, tipo, município, telefone, CPF/CNPJ, obs | `Fornecedor` existente (tipo → `tipoOrigem` da recepção) | |
| CAD_TALHOES!A–F | talhão, cultura, área, ano, espaçamento, obs | `Talhao.*` | |
| CAD_CLIENTES!A,E,F | nome, telefone, CPF/CNPJ | `Cliente` existente | |
| CAD_CLIENTES!B,C,D,G | canal, município, endereço, obs | `PerfilComercialCliente.*` | |
| CAD_LOCAIS!A–E | local, tipo, temperatura, capacidade, obs | `LocalArmazenamento.*` | |
| CAD_INSUMOS!A–D | insumo, unidade, custo, obs | `Insumo.*` | |
| CONFIG!B4 | nome da empresa | `Empresa.nomeFantasia` | existente |
| CONFIG!B5–B11 | ADEPARA, data ref., alertas, branqueamento, tolerância | `ConfigProducao.*` (data ref. = parâmetro de consulta) | |

## Apêndice B — Arquivos-modelo do repositório (copiar padrão)

| Para criar… | Copie a estrutura de… |
|---|---|
| Cadastro simples (page + dialog + actions + service + schema) | `src/app/(dashboard)/cadastros/safras/*`, `src/server/services/safra.ts`, `src/lib/schemas/safra.ts` |
| Service com validação de referências multi-tenant | `src/server/services/titulo.ts` (`validarReferenciasDoTitulo`) |
| Transação com auditoria | `src/server/services/baixa.ts`, `src/server/services/orcamento.ts` |
| Formulário com linhas dinâmicas | `src/app/(dashboard)/financeiro/_titulos/titulo-dialog-form.tsx` + `actions.ts` |
| Filtros na URL (+ teste) | `src/app/(dashboard)/financeiro/_titulos/filtro-titulos-url.ts` |
| Exportação CSV/XLSX | `src/app/(dashboard)/financeiro/contas-a-receber/export/route.ts` |
| Cards/gráficos | `src/app/(dashboard)/dashboard-executivo/*` |
| Rota REST + teste | `src/app/api/v1/titulos/route.ts`, `src/app/api/v1/safras/route.test.ts` |
| Fixture de testes de integração | `src/server/services/financeiroTestFixtures.ts` |
| Permissões + testes | `src/server/auth/permissions.ts`, `permissions.test.ts` |

---

> Nota de validação: o bloco Prisma deste documento foi conferido manualmente (relações nomeadas, lados inversos, unicidade 1:1). O `npx prisma format` + `migrate dev --create-only` da tarefa 6.1.4 é a validação definitiva.
