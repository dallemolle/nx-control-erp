# PLANO_IMPLEMENT_FISCAL-GERENCIAL — Classificação Fiscal × Gerencial dos Lançamentos Financeiros

> **Plano de implementação para o Claude Code.** Deve ser implementado **antes** do módulo descrito em `DOCTO_IMPLEMENT_PROD-VEND.md` (que já foi revisado para depender deste recurso — ver seção 7).
> Base analisada: commit `4467e3f` (branch `staging`), 17 migrations até `20260918000000_add_identidade_visual_empresa`.
> Stack e convenções: as mesmas do DOCTO (Next.js 16, Prisma 7, Zod 4, Vitest, Server Actions, `registrarAuditoria`, RBAC em `permissions.ts`). Ler `AGENTS.md` antes de codificar.

---

## 1. Visão Geral

### 1.1 Objetivo

Permitir que todo movimento financeiro da filial seja classificado como:

- **FISCAL** — lastreado em documento fiscal/oficial (NF-e, NFS-e, NFC-e, CT-e, nota do produtor, nota de entrada, guia de tributo, folha, tarifa bancária, contrato).
- **GERENCIAL** — negociação sem nota com pequenos clientes/fornecedores, controlada apenas internamente (com recibo, pedido interno ou sem comprovante).

E, a partir disso, permitir **filtrar e comparar** contas a pagar/receber, tesouraria, fluxos de caixa, orçamento e dashboard por classificação, além de um relatório próprio de **Fiscal × Gerencial** e **pendências fiscais** (título fiscal sem número de nota, sem chave ou sem anexo).

### 1.2 Diagnóstico do código atual (o que a análise encontrou)

| Ponto | Situação hoje | Consequência para o recurso |
|---|---|---|
| `Titulo.documento` (`String`, obrigatório) | Texto livre — é o único "número de documento" do título | Não dá para saber se é NF, recibo ou referência interna. Mantém-se como **referência interna**; os dados fiscais vão para campos próprios |
| `Anexo` (por título) | Já existe upload privado no Vercel Blob | Reaproveitado para guardar o PDF/XML da nota ou o recibo; vira critério de "pendência fiscal" |
| `LancamentoBancario` | Sem contraparte nem documento; `origem` = `MANUAL` / `BAIXA` / `TRANSFERENCIA` | Precisa de classificação própria (manuais e criados na conciliação) e herdada (baixas) |
| `aprovarBaixa()` (`server/services/baixa.ts`) | Cria o lançamento bancário copiando categoria/centros/safra/projeto do título | Ponto exato para **copiar também a classificação** do título |
| Fluxos realizados, orçamento realizado, por dimensão, dashboard, estratégico | Todos agregam `lancamentoBancario` com `conciliado: true` | Filtro por classificação entra como um `where` adicional nessas consultas |
| Fluxo projetado, orçamento projetado, por dimensão projetado, dashboard (aberto/aging) | Agregam `parcela` com `titulo` | Filtro entra como `titulo: { classificacaoFiscal }` |
| Filtros de títulos (`filtro-titulos-url.ts`, `FiltroTitulos`) | Parser de URL testado, reutilizado em páginas e exports | Ganha o parâmetro `classificacao` |
| API v1 (`/api/v1/titulos`, `/api/v1/lancamentos-bancarios`) e importação CSV (`importacaoTitulo.ts`) | Campos fixos | Ganham campos **opcionais** (compatível com clientes atuais da API/planilhas de importação) |
| `Cliente` / `Fornecedor` | Sem nenhuma informação fiscal além de `cnpjCpf` | Ganham `classificacaoFiscalPadrao` opcional — pré-preenche títulos do parceiro "que não emite nota" |
| **Dinheiro em espécie** | `conciliado = true` só acontece via extrato bancário (OFX/conciliação) | **Gap relevante:** acerto em dinheiro, típico das negociações sem nota, nunca entra no fluxo realizado/orçamento/dashboard. Tratado na Fase B (seção 2.6) |

### 1.3 Princípios de desenho

1. **Classificação é um atributo do título** (e, por cópia, dos lançamentos que ele gera). Não é um "segundo livro" separado: o mesmo cadastro, as mesmas telas, o mesmo saldo bancário.
2. **Padrão "Todos"** em todo filtro → com o filtro vazio, todas as telas e números existentes ficam **idênticos aos de hoje** (é o teste de não-regressão).
3. **Saldo bancário é físico e não se divide.** Contas bancárias não são fiscais nem gerenciais; só o *movimento* é. Quando filtrado, o fluxo mostra movimento do período, não saldo (ver 3.4).
4. **Transparência interna:** lançamentos gerenciais ficam visíveis a todos os perfis que já leem o financeiro, **incluindo AUDITOR**, e toda mudança de classificação é auditada com motivo. O recurso organiza a informação; não cria área oculta.
5. **Mudanças em tabelas existentes só aditivas:** colunas novas *nullable* ou com *default* constante (no Postgres ≥ 11 o `ADD COLUMN ... DEFAULT` é só metadado, sem reescrita da tabela). Nenhum campo existente muda de tipo, nome ou obrigatoriedade.

> **Observação de negócio (não é regra do sistema):** a obrigatoriedade de nota depende de cada operação (por exemplo, na compra de produtor rural pessoa física costuma caber ao comprador emitir **nota fiscal de entrada**). Por isso o tipo `NF_ENTRADA` está na lista: uma compra "do pequeno fornecedor que não emite nota" pode, conforme orientação do contador, virar FISCAL com nota emitida pela própria empresa. Vale validar os casos típicos com a contabilidade antes do go-live.

### 1.4 Decisões a confirmar (default adotado entre parênteses)

| # | Decisão | Default deste plano |
|---|---|---|
| FG1 | Classificação dos títulos/lançamentos **já existentes** | `FISCAL` (backfill). O relatório de pendências (títulos fiscais sem nº de nota) expõe os que precisam ser reclassificados; reclassificação individual pela edição do título |
| FG2 | Título FISCAL exige número da nota no cadastro? | **Não bloqueia** (a nota pode chegar depois); vira **pendência fiscal** até ser informado |
| FG3 | Permissão separada para lançar GERENCIAL? | **Não** — mesmas permissões de título/lançamento. (Alternativa pronta: ação `gerencial:escrever`, ver 5.1) |
| FG4 | Conta "Caixa (dinheiro em espécie)" | **Sim, Fase B** — conta do tipo `CAIXA` cujos lançamentos nascem conciliados |
| FG5 | Filtro no fluxo estratégico | **Não nesta entrega** (premissas do cenário usam a base total) |

---

## 2. Modelagem de Dados

### 2.1 Enums novos

```prisma
enum ClassificacaoFiscal {
  FISCAL
  GERENCIAL
}

enum TipoComprovante {
  // FISCAL
  NFE              // NF-e (modelo 55)
  NFCE             // NFC-e (modelo 65)
  NFSE             // NFS-e (serviços)
  CTE              // CT-e (frete)
  NF_PRODUTOR      // nota do produtor rural / NF avulsa
  NF_ENTRADA       // nota de entrada emitida pela própria empresa
  GUIA_TRIBUTO     // DARF, DAE, GPS, DAS...
  FOLHA_PAGAMENTO
  TARIFA_BANCARIA
  CONTRATO
  OUTRO_FISCAL
  // GERENCIAL
  RECIBO
  PEDIDO_INTERNO
  SEM_COMPROVANTE
}
```

Espelhar em `src/lib/schemas/enums.ts` **acrescentando** (sem alterar as consts existentes):

```ts
export const CLASSIFICACAO_FISCAL = ["FISCAL", "GERENCIAL"] as const;
export const TIPO_COMPROVANTE_FISCAL = ["NFE","NFCE","NFSE","CTE","NF_PRODUTOR","NF_ENTRADA","GUIA_TRIBUTO","FOLHA_PAGAMENTO","TARIFA_BANCARIA","CONTRATO","OUTRO_FISCAL"] as const;
export const TIPO_COMPROVANTE_GERENCIAL = ["RECIBO","PEDIDO_INTERNO","SEM_COMPROVANTE"] as const;
export const TIPO_COMPROVANTE = [...TIPO_COMPROVANTE_FISCAL, ...TIPO_COMPROVANTE_GERENCIAL] as const;
/** Tipos que identificam uma nota com número/série (e chave de 44 dígitos, quando houver). */
export const TIPOS_COM_NUMERO_NOTA = ["NFE","NFCE","NFSE","CTE","NF_PRODUTOR","NF_ENTRADA"] as const;
export const TIPOS_COM_CHAVE_ACESSO = ["NFE","NFCE","CTE"] as const;
export const ROTULOS_CLASSIFICACAO_FISCAL = { FISCAL: "Fiscal (com documento)", GERENCIAL: "Gerencial (sem nota)" } as const;
export const ROTULOS_TIPO_COMPROVANTE = { NFE: "NF-e", NFCE: "NFC-e", NFSE: "NFS-e", CTE: "CT-e", NF_PRODUTOR: "Nota do produtor / avulsa", NF_ENTRADA: "Nota de entrada (emissão própria)", GUIA_TRIBUTO: "Guia de tributo", FOLHA_PAGAMENTO: "Folha de pagamento", TARIFA_BANCARIA: "Tarifa bancária", CONTRATO: "Contrato", OUTRO_FISCAL: "Outro documento oficial", RECIBO: "Recibo", PEDIDO_INTERNO: "Pedido interno", SEM_COMPROVANTE: "Sem comprovante" } as const;
```

### 2.2 Campos novos em modelos existentes (todos aditivos)

```prisma
model Titulo {
  // ...campos existentes inalterados...
  classificacaoFiscal        ClassificacaoFiscal @default(FISCAL)
  tipoComprovante            TipoComprovante?
  numeroDocumentoFiscal      String?
  serieDocumentoFiscal       String?
  chaveAcesso                String?     // 44 dígitos, só números
  dataEmissaoDocumentoFiscal DateTime?
  motivoSemDocumento         String?     // GERENCIAL: ex. "produtor não emite nota"

  @@index([filialId, classificacaoFiscal])
  @@index([filialId, chaveAcesso])
}

model LancamentoBancario {
  // ...campos existentes inalterados...
  classificacaoFiscal ClassificacaoFiscal?   // null apenas para TRANSFERENCIA
  tipoComprovante     TipoComprovante?
  numeroComprovante   String?

  @@index([filialId, classificacaoFiscal, data])
}

model Cliente {
  // ...
  classificacaoFiscalPadrao ClassificacaoFiscal?   // pré-preenche novos títulos
}

model Fornecedor {
  // ...
  classificacaoFiscalPadrao ClassificacaoFiscal?
}
```

Decisões de modelagem:

- **Colunas no próprio `Titulo`** (e não tabela 1:1 separada): cada consulta de fluxo/orçamento/dashboard filtra por elas — uma tabela à parte obrigaria um join em ~10 consultas. Com default/nullable, nenhum `create`/`select` existente quebra.
- **Cópia (denormalização) em `LancamentoBancario.classificacaoFiscal`**: as consultas de realizado fazem `groupBy` direto em `lancamento_bancario`; derivar via `baixa → parcela → titulo` impediria o `groupBy`. A consistência é garantida na aprovação da baixa e na reclassificação do título (3.2).
- **Uma nota → um título** (com N parcelas). Unicidade de `chaveAcesso` por filial é verificada no service (índice simples, não único, para evitar índice parcial que o Prisma não representa e acusaria *drift*).

### 2.3 Migration `add_classificacao_fiscal`

`npx prisma migrate dev --name add_classificacao_fiscal --create-only`, conferir o SQL e **acrescentar o backfill e as CHECKs**:

```sql
-- (gerado pelo Prisma) CREATE TYPE "ClassificacaoFiscal" ...; CREATE TYPE "TipoComprovante" ...;
-- (gerado) ALTER TABLE "titulos" ADD COLUMN "classificacaoFiscal" "ClassificacaoFiscal" NOT NULL DEFAULT 'FISCAL', ADD COLUMN ...;
-- (gerado) ALTER TABLE "lancamentos_bancarios" ADD COLUMN "classificacaoFiscal" "ClassificacaoFiscal", ...;
-- (gerado) ALTER TABLE "clientes" ADD COLUMN "classificacaoFiscalPadrao" "ClassificacaoFiscal";
-- (gerado) ALTER TABLE "fornecedores" ADD COLUMN "classificacaoFiscalPadrao" "ClassificacaoFiscal";
-- (gerado) CREATE INDEX ...

-- Backfill (FG1): lançamentos de baixa herdam do título; manuais = FISCAL; transferências ficam NULL
UPDATE "lancamentos_bancarios" l
   SET "classificacaoFiscal" = t."classificacaoFiscal"
  FROM "baixas" b
  JOIN "parcelas" p ON p."id" = b."parcelaId"
  JOIN "titulos"  t ON t."id" = p."tituloId"
 WHERE l."baixaId" = b."id";

UPDATE "lancamentos_bancarios" SET "classificacaoFiscal" = 'FISCAL'
 WHERE "classificacaoFiscal" IS NULL AND "origem" <> 'TRANSFERENCIA';

-- Integridade
ALTER TABLE "lancamentos_bancarios" ADD CONSTRAINT "lancamentos_classificacao_chk"
  CHECK ("origem" = 'TRANSFERENCIA' OR "classificacaoFiscal" IS NOT NULL);

ALTER TABLE "titulos" ADD CONSTRAINT "titulos_comprovante_coerente_chk" CHECK (
  "tipoComprovante" IS NULL
  OR ("classificacaoFiscal" = 'FISCAL'    AND "tipoComprovante" NOT IN ('RECIBO','PEDIDO_INTERNO','SEM_COMPROVANTE'))
  OR ("classificacaoFiscal" = 'GERENCIAL' AND "tipoComprovante"     IN ('RECIBO','PEDIDO_INTERNO','SEM_COMPROVANTE'))
);

ALTER TABLE "titulos" ADD CONSTRAINT "titulos_chave_acesso_chk"
  CHECK ("chaveAcesso" IS NULL OR "chaveAcesso" ~ '^[0-9]{44}$');
```

Checagem obrigatória antes de aplicar: o SQL não pode conter `DROP`, `ALTER COLUMN`, `RENAME` nem `SET NOT NULL` em coluna existente. Os únicos `ALTER TABLE` em tabelas existentes são `ADD COLUMN`, `ADD CONSTRAINT` e `CREATE INDEX`.

### 2.4 Fixtures de teste

`criarFixtureFinanceiro` / `limparFixtureFinanceiro` **não mudam** (as colunas têm default). Novos testes criam títulos com `classificacaoFiscal` explícito.

### 2.5 Seed

`prisma/seed.ts` não precisa mudar. Opcional: ao final, criar 1 título GERENCIAL de demonstração (somente se o usuário pedir).

### 2.6 Fase B — Conta "Caixa (dinheiro em espécie)" (FG4)

Motivo: o realizado só conta lançamentos `conciliado = true`, e hoje só a conciliação de extrato marca isso. Pagamento/recebimento em dinheiro — comum nas negociações sem nota — fica fora de fluxo realizado, orçamento e dashboard.

- `enum TipoContaBancaria` += `CAIXA` (migration própria `add_tipo_conta_caixa`, só `ALTER TYPE ... ADD VALUE`).
- `ContaBancaria.bancoId` continua obrigatório: o seed/migration cria (se não existir) o `Banco` sentinela `codigo = "CX"`, `nome = "Caixa interno (dinheiro em espécie)"`; agência/conta livres (ex.: `0000` / `CAIXA-MATRIZ`). Evita tornar `bancoId` opcional, o que mudaria tipos usados em várias telas.
- Lançamentos (manuais, de baixa, de transferência) em conta `CAIXA` são criados com `conciliado = true`. Pontos a alterar: `criarLancamentoManual`, `criarTransferencia` (lado da conta caixa), `aprovarBaixa` — com `conciliado: conta.tipo === "CAIXA"`.
- Conferência física do caixa usa o recurso já existente **"Informar saldo"** (`SaldoBancarioInformado`) × saldo contábil, na Tesouraria.
- A tela de conciliação esconde contas `CAIXA` do seletor de importação de extrato.

---

## 3. Backend / Regras de negócio

### 3.1 Helper central — `src/server/services/classificacaoFiscal.ts` (novo)

```ts
export type FiltroClassificacao = ClassificacaoFiscal | undefined; // undefined = todos

export function whereLancamentoPorClassificacao(c: FiltroClassificacao) {
  return c ? { classificacaoFiscal: c } : {};
}
export function whereParcelaPorClassificacao(c: FiltroClassificacao) {
  return c ? { titulo: { classificacaoFiscal: c } } : {};
}
export function classificacaoDaUrl(valor: string | undefined): FiltroClassificacao; // aceita só FISCAL|GERENCIAL

/** Regras puras de coerência — usadas pelo Zod (superRefine), pelos services e pela importação CSV. */
export function validarComprovante(d: {
  classificacaoFiscal: ClassificacaoFiscal;
  tipoComprovante?: TipoComprovante | null;
  numeroDocumentoFiscal?: string | null;
  chaveAcesso?: string | null;
}): { campo: string; mensagem: string }[];

export function chaveAcessoValida(chave: string): boolean; // 44 dígitos + DV módulo 11 (pesos 2..9)
export function normalizarChaveAcesso(valor: string): string; // remove espaços/pontuação
export function resolverClassificacao(informada: ClassificacaoFiscal | undefined, padraoContraparte: ClassificacaoFiscal | null): ClassificacaoFiscal; // informada ?? padrão ?? "FISCAL"

export type PendenciaFiscal = "SEM_TIPO_DOCUMENTO" | "SEM_NUMERO_NOTA" | "SEM_CHAVE_ACESSO" | "SEM_ANEXO";
export function pendenciasFiscaisDoTitulo(t: {...}, quantidadeAnexos: number): PendenciaFiscal[];
```

Todas as funções puras com testes (`classificacaoFiscal.test.ts`), incluindo uma chave de acesso real válida e outra com DV alterado.

### 3.2 Regras de validação

| Regra | Onde | Severidade |
|---|---|---|
| `tipoComprovante` deve pertencer ao grupo da classificação (fiscal × gerencial) | Zod + CHECK | bloqueia |
| `chaveAcesso` só para `NFE`/`NFCE`/`CTE`; 44 dígitos; DV válido | Zod + CHECK (formato) | bloqueia |
| `chaveAcesso` única por filial (outro título ativo com a mesma chave) | service | bloqueia — "Esta nota já está lançada no título <documento>" |
| Mesmo `contraparte + tipoComprovante + serie + numeroDocumentoFiscal` já lançado | service | bloqueia — evita nota em duplicidade |
| `numeroDocumentoFiscal` informado ⇒ `tipoComprovante` obrigatório | Zod | bloqueia |
| FISCAL sem `tipoComprovante`/número/chave/anexo | relatório de pendências | **não bloqueia** (FG2) |
| GERENCIAL: dados de nota (`numeroDocumentoFiscal`, `serie`, `chave`) devem ficar vazios | Zod | bloqueia |
| **Alterar a classificação** de um título existente exige `motivoReclassificacao` | Zod (só na edição) + service | bloqueia |
| Classificação omitida na criação | service: `resolverClassificacao(informada, contraparte.classificacaoFiscalPadrao)` | — |

### 3.3 Alterações por arquivo (backend)

| Arquivo | Mudança |
|---|---|
| `lib/schemas/titulo.ts` | `camposComuns` ganha: `classificacaoFiscal: z.enum(CLASSIFICACAO_FISCAL).optional()`, `tipoComprovante: z.enum(TIPO_COMPROVANTE).optional().or(z.literal(SEM_VALOR))`, `numeroDocumentoFiscal`, `serieDocumentoFiscal`, `chaveAcesso` (transform `normalizarChaveAcesso`), `dataEmissaoDocumentoFiscal: z.coerce.date().optional().or(z.literal(""))`, `motivoSemDocumento`, `motivoReclassificacao` (opcionais), + `superRefine(validarComprovante)` quando houver classificação. **Sem `.default()`** na classificação, para o service distinguir "omitido" e aplicar o padrão da contraparte |
| `server/services/titulo.ts` | `camposNormalizados()` inclui os campos fiscais (normalizando `SEM_VALOR`/vazio → `null`); `criarTitulo()` resolve a classificação e roda as checagens de duplicidade; `atualizarTitulo()`: se a classificação mudou → exige motivo, faz `updateMany` em `lancamentoBancario` (`where: { baixa: { parcela: { tituloId: id } } }`) **na mesma transação** e audita com ação `RECLASSIFICAR` (`anterior/novo` na mesma forma — incluir os campos novos no objeto `anterior`); `FiltroTitulos` += `classificacao?: ClassificacaoFiscal` aplicado no `where`; `listarTitulos` inclui `_count: { select: { anexos: true } }` para a coluna de pendências |
| `server/services/baixa.ts` | `aprovarBaixa()`: o `lancamentoBancario.create` passa a gravar `classificacaoFiscal: parcela.titulo.classificacaoFiscal`, `tipoComprovante` e `numeroComprovante: parcela.titulo.numeroDocumentoFiscal` |
| `lib/schemas/lancamentoBancario.ts` | `lancamentoManualSchema` += `classificacaoFiscal: z.enum(CLASSIFICACAO_FISCAL).default("FISCAL")`, `tipoComprovante` e `numeroComprovante` opcionais (com coerência de grupo). `transferenciaSchema` não muda |
| `server/services/lancamentoBancario.ts` | `criarLancamentoManual` grava os campos; `criarTransferencia` deixa `null`; `listarLancamentos(filialId, filtros?)` aceita `classificacao` (parâmetro opcional ao final) |
| `server/services/conciliacao.ts` | `criarLancamentoEConciliar` (linha ~431): dados do form + `classificacaoFiscal` (default `FISCAL`) |
| `server/services/fluxoDeCaixa.ts` | `listarFluxoDeCaixaRealizado(sessao, granularidade, data, opcoes = {})` — `opcoes.classificacao` entra no `findMany` dos lançamentos; **`buscarSaldoEmCaixaAte` não muda** (saldo é físico). Retorno ganha `filtrado: boolean` |
| `server/services/fluxoDeCaixaProjetado.ts` | `buscarParcelasEmAbertoNoPeriodo(filialId, inicio, fim, classificacao?)` e `listarFluxoDeCaixaProjetado(..., opcoes = {})` |
| `server/services/fluxoDeCaixaPorDimensao.ts` | realizado + projetado com `opcoes.classificacao` |
| `server/services/orcamento.ts` | `buscarRealizadoPorCategoria`, `buscarProjetadoPorCategoria`, `listarComparativoOrcamento` com `opcoes.classificacao` (o **orçado** não é filtrado) |
| `server/services/orcamentoSafra.ts` | idem, para o comparativo entre safras |
| `server/services/dashboardExecutivo.ts` | KPIs atuais **inalterados**; nova função `obterResumoFiscalGerencial(sessao, mes)` (3.5) |
| `server/services/importacaoTitulo.ts` | colunas CSV opcionais `classificacaoFiscal` (aceita `FISCAL`/`GERENCIAL`/`F`/`G`, sem diferenciar maiúsculas), `tipoComprovante`, `numeroDocumentoFiscal`, `serieDocumentoFiscal`, `chaveAcesso`; arquivo sem essas colunas continua válido |
| `lib/schemas/cliente.ts`, `fornecedor.ts` + services | `classificacaoFiscalPadrao: z.enum(CLASSIFICACAO_FISCAL).optional().or(z.literal(SEM_VALOR))`; incluir no objeto `anterior` da auditoria |
| `server/services/relatorioFiscalGerencial.ts` (novo) | 3.5 |

Convenção para os parâmetros novos: **sempre opcionais, no final da assinatura** (`opcoes: { classificacao?: ClassificacaoFiscal } = {}`). Nenhuma chamada existente precisa mudar, e todos os testes atuais seguem válidos.

### 3.4 Semântica do fluxo de caixa filtrado

- **Sem filtro:** exatamente como hoje (saldo inicial, entradas, saídas, geração, saldo final).
- **Com filtro FISCAL ou GERENCIAL:** entradas, saídas e geração líquida só do movimento daquela classificação; **saldo inicial/final substituídos por "acumulado no período"** (começa em zero). As transferências (classificação `null`) ficam fora — entre contas da mesma filial elas se anulam. A página mostra o aviso: *"Visão filtrada: mostra apenas o movimento classificado como X. O saldo bancário é único e aparece só na visão 'Todos'."*
- **Projetado filtrado:** mesma regra (acumulado das parcelas em aberto daquela classificação, sem o saldo de caixa de hoje).

### 3.5 Relatório e indicadores Fiscal × Gerencial

`relatorioFiscalGerencial.ts`:

```ts
obterComparativoMensal(sessao, ano): Array<{
  mes: number;
  entradasFiscal: number; entradasGerencial: number;
  saidasFiscal: number;   saidasGerencial: number;
  percentualGerencialEntradas: number | null; percentualGerencialSaidas: number | null;
}>                                         // realizado: lançamentos conciliados, transferências excluídas

obterEmAbertoPorClassificacao(sessao): { receberFiscal; receberGerencial; pagarFiscal; pagarGerencial }  // saldo das parcelas em aberto

obterTopContrapartesGerenciais(sessao, de, ate, limite = 10): Array<{ contraparteId; nome; tipo: "CLIENTE"|"FORNECEDOR"; quantidadeTitulos; valorTotal }>

listarPendenciasFiscais(sessao, filtros?): Array<{ tituloId; documento; contraparte; tipo; emissao; valor; pendencias: PendenciaFiscal[] }>
```

`dashboardExecutivo.ts → obterResumoFiscalGerencial(sessao, mes)`: entradas e saídas do mês por classificação, % gerencial das entradas, nº de pendências fiscais.

Permissão: `titulo:ler` **e** `lancamento:ler` (o mesmo de quem já vê os dados de origem).

### 3.6 API REST v1 (compatível com os clientes atuais)

| Rota | Mudança |
|---|---|
| `POST /api/v1/titulos` | `CorpoTitulo` += `classificacaoFiscal?`, `tipoComprovante?`, `numeroDocumentoFiscal?`, `serieDocumentoFiscal?`, `chaveAcesso?`, `dataEmissaoDocumentoFiscal?`, `motivoSemDocumento?`. Omitidos → padrão da contraparte → `FISCAL`. Regras da 3.2 violadas → 422 com `campos` |
| `GET /api/v1/titulos?tipo=...&classificacao=FISCAL\|GERENCIAL` | parâmetro opcional; o JSON passa a trazer os campos novos (adição de propriedades — não quebra quem consome) |
| `POST /api/v1/lancamentos-bancarios` | `classificacaoFiscal?` (default `FISCAL`), `tipoComprovante?`, `numeroComprovante?` |
| `GET /api/v1/lancamentos-bancarios?classificacao=` | opcional |
| `GET /api/v1/clientes`, `/fornecedores` | passam a devolver `classificacaoFiscalPadrao` |

Atualizar `docs/api-v1.md` (exemplos + tabela de campos).

### 3.7 Exportações

`contas-a-pagar/export`, `contas-a-receber/export`: colunas novas **ao final** (Classificação, Tipo de comprovante, Nº nota, Série, Chave de acesso, Pendências) e respeito ao filtro `classificacao` da URL. `fluxo-de-caixa/export`: respeita o filtro; na visão filtrada exporta "acumulado" no lugar de saldo. Novo `controladoria/fiscal-gerencial/export`.

---

## 4. Frontend / UI

### 4.1 Telas alteradas

| Tela / componente | Mudança |
|---|---|
| `financeiro/_titulos/titulo-dialog-form.tsx` | Nova seção **"Documento fiscal"** (abaixo de "Documento"): `Select` Classificação (Fiscal / Gerencial); `Select` Tipo de comprovante (opções filtradas pela classificação); Nº da nota, Série, Chave de acesso (só para NF-e/NFC-e/CT-e, com contador 0/44 e validação do DV no cliente usando `chaveAcessoValida`), Data de emissão da nota; para GERENCIAL, "Motivo sem nota". Ao escolher a contraparte, pré-seleciona `classificacaoFiscalPadrao` (só na criação). Na edição, se a classificação mudar, aparece o campo obrigatório "Motivo da reclassificação" |
| `financeiro/_titulos/titulo-table.tsx` | `Badge` "Fiscal"/"Gerencial" na coluna Documento (variante `secondary` para gerencial) + ícone de alerta com *tooltip* listando as pendências fiscais |
| `financeiro/_titulos/barra-de-filtros.tsx` + `filtro-titulos-url.ts` (+ testes) | Filtro **Classificação: Todos / Fiscal / Gerencial** (`classificacao` em `CAMPOS_FILTRO_TITULOS`) — vale para Contas a pagar, Contas a receber e os exports |
| `financeiro/_titulos/importar-csv-dialog.tsx` | Texto de ajuda com as colunas opcionais novas |
| `financeiro/tesouraria/lancamento-dialog-form.tsx` | Classificação (default Fiscal), Tipo de comprovante e Nº do comprovante |
| `financeiro/tesouraria/page.tsx` | Coluna/`Badge` de classificação na lista de lançamentos; filtro `classificacao` |
| `financeiro/conciliacao/criar-lancamento-dialog-form.tsx` | Classificação (default Fiscal) |
| `financeiro/fluxo-de-caixa`, `fluxo-de-caixa-projetado` | Seletor de classificação (padrão Todos) + aviso da visão filtrada (3.4); colunas de saldo viram "Acumulado" quando filtrado |
| `controladoria/orcamento`, `fluxo-por-dimensao`, `comparacao-safras` | Mesmo seletor de classificação |
| `dashboard-executivo/page.tsx` | Novo bloco de `Card`s "Fiscal × gerencial (mês)": entradas fiscal, entradas gerencial, % gerencial, pendências fiscais (com link para o relatório) |
| `cadastros/clientes/cliente-dialog-form.tsx`, `cadastros/fornecedores/fornecedor-dialog-form.tsx` | `Select` "Classificação padrão dos títulos": Nenhuma / Fiscal / Gerencial (ajuda: "use Gerencial para parceiros que não emitem nota") |
| `content/ajuda/passo-a-passo.md` | Seção "Lançamentos fiscais e gerenciais" + verbete no glossário |

Componente compartilhado novo: `src/app/(dashboard)/_shared/seletor-classificacao.tsx` (client; atualiza o parâmetro `classificacao` da URL preservando os demais — mesmo padrão dos seletores de período/modo já existentes, com teste da função pura que monta a URL).

### 4.2 Tela nova

`/controladoria/fiscal-gerencial` (item novo na seção "Controladoria" do `nav-items.ts`, sem `permitido` — protegido por `requirePermission` na página):

1. Seletor de ano (`controladoria/_shared/seletor-ano-mes.tsx`).
2. Tabela mensal da 3.5 + gráfico de barras empilhadas (Recharts via `components/ui/chart`).
3. Cards "Em aberto": a receber fiscal/gerencial, a pagar fiscal/gerencial.
4. Top 10 contrapartes gerenciais no período.
5. **Pendências fiscais** (tabela com link para o título e filtro por tipo de pendência).
6. `ExportarLinks`.

---

## 5. Segurança e Impacto

### 5.1 Permissões

- **Nenhuma ação nova obrigatória** (FG3): criar/editar título FISCAL ou GERENCIAL usa `titulo:escrever`; lançamento manual usa `lancamento:escrever`; reclassificar usa `titulo:escrever` + motivo + auditoria.
- Leitura: perfis com `titulo:ler`/`lancamento:ler` veem as duas classificações. **AUDITOR e GESTOR enxergam os gerenciais** (princípio 1.3-4).
- Se FG3 = "sim": adicionar `Acao` `"gerencial:escrever"` (ADMINISTRADOR + FINANCEIRO + TESOURARIA por padrão), exigida no service quando `classificacaoFiscal === "GERENCIAL"` na criação e na reclassificação; helper `podeEscreverGerencial` para esconder a opção no form.
- Auditoria: `Titulo` (`CRIAR`/`ATUALIZAR` com os campos fiscais no diff; `RECLASSIFICAR` com `motivo`), `LancamentoBancario` (`CRIAR` com classificação), `Cliente`/`Fornecedor` (`ATUALIZAR` com o padrão).

### 5.2 Riscos de regressão

| # | Risco | Mitigação |
|---|---|---|
| F1 | `ADD COLUMN` em `titulos`/`lancamentos_bancarios`/`clientes`/`fornecedores` | Só colunas nullable ou com default constante (sem reescrita da tabela no PG ≥ 11); revisão do SQL (2.3); `db:deploy` em staging primeiro |
| F2 | Backfill classificar errado dados históricos | FG1 explícito + relatório de pendências + reclassificação auditada |
| F3 | Números dos relatórios mudarem | Filtro padrão "Todos" = consulta atual sem `where` extra. Teste: cada service chamado sem `opcoes` devolve o mesmo resultado de antes (testes existentes intactos + testes novos com dados mistos verificando Todos = Fiscal + Gerencial) |
| F4 | Lançamento de baixa com classificação divergente do título | Cópia na aprovação + `updateMany` na reclassificação, na mesma transação; teste de integração |
| F5 | Diff de auditoria acusar tudo alterado | Incluir os campos novos no objeto `anterior` de `atualizarTitulo`, `atualizarCliente`, `atualizarFornecedor` (mesma forma do `novo`) |
| F6 | Clientes da API/CSV quebrarem | Campos novos opcionais; respostas só ganham propriedades; testes de rota existentes rodam sem alteração |
| F7 | Saldo "fiscal" enganoso | Saldo nunca é dividido; visão filtrada mostra "acumulado" com aviso (3.4) |
| F8 | Conta CAIXA (Fase B) aparecer na conciliação de extrato | Filtrar `tipo !== "CAIXA"` no seletor da conciliação |
| F9 | Prisma acusar *drift* por índice parcial | Não usar índice parcial; unicidade da chave verificada no service |

---

## 6. Checklist de Implementação (Claude Code)

> Branch `feat/classificacao-fiscal-gerencial` a partir de `staging`. Conventional Commits (`feat(financeiro): ...`). Não avançar com teste vermelho.

### 6.0 Preparação
- [ ] 6.0.1 Ler `AGENTS.md`, este plano, `server/services/titulo.ts`, `baixa.ts`, `lancamentoBancario.ts`, `fluxoDeCaixa*.ts`, `orcamento*.ts`, `dashboardExecutivo.ts`, `importacaoTitulo.ts`, `financeiro/_titulos/*`.
- [ ] 6.0.2 `npm run test` — linha de base verde. Registrar os números de fluxo realizado/projetado e do dashboard da base de dev (para comparar no fim).
- [ ] 6.0.3 Criar `docs/superpowers/specs/2026-11-03-classificacao-fiscal-gerencial-design.md` (resumo + decisões FG1–FG5 confirmadas) e a entrada em `docs/backlog.md`/fases.

### 6.1 DB / Migrations
- [ ] 6.1.1 Enums + campos (2.1, 2.2) no `schema.prisma`.
- [ ] 6.1.2 `migrate dev --create-only`, revisar o SQL, acrescentar backfill e CHECKs (2.3).
- [ ] 6.1.3 `npm run db:migrate && npm run db:generate && npm run build && npm run test` — **suíte existente 100% verde sem nenhuma mudança de teste**.
- [ ] 6.1.4 Conferir no banco de dev: `SELECT "classificacaoFiscal", "origem", count(*) FROM lancamentos_bancarios GROUP BY 1,2` (transferências = NULL; demais preenchidos).

### 6.2 Backend
- [ ] 6.2.1 Consts/rótulos em `lib/schemas/enums.ts` (só acréscimos).
- [ ] 6.2.2 `classificacaoFiscal.ts` + testes (DV da chave, coerência do grupo, pendências, `resolverClassificacao`, `classificacaoDaUrl`).
- [ ] 6.2.3 Schemas de título/lançamento/cliente/fornecedor (3.3).
- [ ] 6.2.4 `titulo.ts`: criação (padrão da contraparte, duplicidade de nota/chave), atualização (reclassificação + propagação + auditoria), filtro. Testes de integração: padrão do fornecedor aplicado; chave duplicada → erro; reclassificar propaga para lançamentos de baixas aprovadas; sem motivo → erro; título de outra filial com a mesma chave **não** conflita.
- [ ] 6.2.5 `baixa.ts`: cópia na aprovação + teste.
- [ ] 6.2.6 `lancamentoBancario.ts` e `conciliacao.ts` + testes.
- [ ] 6.2.7 `opcoes.classificacao` em fluxo realizado, projetado, por dimensão, orçamento, comparação de safras. Para cada um, teste com dataset misto: `Todos = Fiscal + Gerencial` nas entradas/saídas, e sem `opcoes` = resultado anterior.
- [ ] 6.2.8 `relatorioFiscalGerencial.ts` + `obterResumoFiscalGerencial` + testes.
- [ ] 6.2.9 `importacaoTitulo.ts` (colunas opcionais) + teste com CSV antigo (sem colunas novas) e novo.
- [ ] 6.2.10 API v1 (3.6) + `route.test.ts` cobrindo: corpo antigo continua 201; classificação inválida → 422; `?classificacao=` filtra.
- [ ] 6.2.11 Exports (3.7).

### 6.3 Frontend
- [ ] 6.3.1 `_shared/seletor-classificacao.tsx` (+ teste da função de URL).
- [ ] 6.3.2 Form, tabela, filtros e ajuda do CSV dos títulos (4.1).
- [ ] 6.3.3 Tesouraria e conciliação.
- [ ] 6.3.4 Fluxos, orçamento, por dimensão, comparação de safras (seletor + visão filtrada).
- [ ] 6.3.5 Cadastros de cliente/fornecedor (padrão).
- [ ] 6.3.6 Dashboard (bloco novo).
- [ ] 6.3.7 `/controladoria/fiscal-gerencial` + item no menu.
- [ ] 6.3.8 `content/ajuda/passo-a-passo.md`.

### 6.4 Validação
- [ ] 6.4.1 `npm run lint`, `npm run test` (suíte inteira), `npm run build`.
- [ ] 6.4.2 Com filtro "Todos", os números de 6.0.2 batem exatamente.
- [ ] 6.4.3 Cenário: fornecedor "Produtor X" com padrão Gerencial → novo título vem Gerencial com "Recibo"; baixa aprovada → lançamento gerencial; fluxo filtrado "Gerencial" mostra só ele; reclassificar para Fiscal com NF-e (chave válida) → lançamento acompanha; auditoria mostra `RECLASSIFICAR` com motivo.
- [ ] 6.4.4 Título fiscal sem número aparece em Pendências; ao anexar a nota e informar o número, sai da lista.
- [ ] 6.4.5 Perfis: CONSULTA/AUDITOR veem gerenciais e não editam; filial somente-leitura bloqueia reclassificação.
- [ ] 6.4.6 Staging (workflow de migration) → validação → PR para `main`.

### 6.5 Fase B — Conta Caixa (se FG4 = sim)
- [ ] 6.5.1 Migration `add_tipo_conta_caixa` (`ALTER TYPE "TipoContaBancaria" ADD VALUE 'CAIXA'`) + criação idempotente do `Banco` sentinela `CX`.
- [ ] 6.5.2 `conciliado: conta.tipo === "CAIXA"` em `criarLancamentoManual`, `criarTransferencia`, `aprovarBaixa` + testes (dinheiro entra no fluxo realizado sem extrato).
- [ ] 6.5.3 Conciliação esconde contas CAIXA; formulário de conta bancária mostra o tipo "Caixa (dinheiro em espécie)" com o banco sentinela pré-selecionado.
- [ ] 6.5.4 Ajuda: conferência do caixa via "Informar saldo".

---

## 7. Impacto no `DOCTO_IMPLEMENT_PROD-VEND.md` (alterações já aplicadas — Revisão 1.1)

| Seção do DOCTO | Alteração |
|---|---|
| Cabeçalho | Nota de revisão + **pré-requisito**: este plano implementado (enums `ClassificacaoFiscal`/`TipoComprovante` e campos em `Titulo`/`Cliente`/`Fornecedor` já existentes) |
| 1.5 Integração | Nova linha: classificação fiscal × gerencial em recepções e pedidos, herdada pelos títulos gerados |
| 2.4 `RecepcaoFruto` | `romaneioNf` substituído por `romaneio` + `classificacaoFiscal` (null para produção própria), `tipoComprovante`, `numeroDocumentoFiscal`, `serieDocumentoFiscal`, `chaveAcesso` |
| 2.4 `PedidoVenda` | + `classificacaoFiscal` (obrigatória, padrão do cliente → FISCAL), `tipoComprovante`, `numeroDocumentoFiscal`, `serieDocumentoFiscal`, `chaveAcesso` |
| 2.6 CHECKs | Coerência comprovante × classificação; terceiro exige classificação |
| 3.3.2 / 3.3.4 | Regras de classificação/comprovante (reusando `validarComprovante`) |
| 3.3.7 Painel e REL_VENDAS / REL_ORIGEM | Faturamento e compra de fruto separados em fiscal × gerencial; filtro `classificacao` em painel e relatórios |
| 3.3.8 Integração financeira | Títulos gerados herdam classificação e dados da nota; `documento` interno continua `PV-<n>` / `RF-<lote>` |
| 3.5 Schemas, 3.6 API | Campos novos no schema de recepção/pedido e nos corpos da API |
| 4.2 Telas | Seção "Documento fiscal" nos dialogs de recepção e pedido; `Badge` e filtro nas listas |
| 5.2 Riscos | Nova linha R14 (dependência deste recurso) |
| 6.0 / 6.5 / Apêndice A | Pré-requisito no checklist; importação da planilha com `--classificacao-padrao` (a planilha não registra nota nas vendas); dicionário atualizado |
