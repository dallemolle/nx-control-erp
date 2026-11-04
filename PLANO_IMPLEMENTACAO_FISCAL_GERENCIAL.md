# PLANO_IMPLEMENTACAO_FISCAL_GERENCIAL — Documentos Fiscais × Gerenciais

> **Plano de implementação para o Claude Code.** Deve ser implementado **antes** do módulo de Produtos e Vendas (`DOCTO_IMPLEMENT_PROD-VEND.md`, que já depende deste recurso — ver seção 5).
> Base analisada: commit `723f337` (branch `staging`), 17 migrations até `20260918000000_add_identidade_visual_empresa`.
> Substitui o rascunho anterior `PLANO_IMPLEMENT_FISCAL-GERENCIAL.md` (mesmo conteúdo, reorganizado nesta estrutura e conferido contra o código atual).
> Stack: Next.js 16 (App Router, Server Actions), React 19, Prisma 7 + PostgreSQL, Zod 4, NextAuth v5, Tailwind 4 + shadcn/Base UI, Vitest. **Ler `AGENTS.md` antes de codificar** (Next 16 tem APIs diferentes das conhecidas).

---

## 0. Diagnóstico do código atual

### 0.1 Padrões de arquitetura que o plano segue

| Camada | Padrão encontrado | Onde |
|---|---|---|
| Banco | Prisma, `@@map` em snake_case plural (`titulos`, `lancamentos_bancarios`), colunas em camelCase, `Decimal(18,2)` para valores, enums Postgres nativos | `prisma/schema.prisma` |
| Migrations | `prisma migrate dev`; migrations com SQL manual de backfill quando necessário (ex.: `20260830011500_backfill_filial_matriz_e_vinculos`, `20260917194500_formatar_cnpj_cpf_existentes`); deploy via workflow `prisma-migrate.yml` | `prisma/migrations/` |
| Validação (DTO) | Schemas Zod em `src/lib/schemas/*.ts`; tipos inferidos (`TituloFormValues`); `superRefine` para regras condicionais (ex.: PIX em `cliente.ts`); opção "Nenhum" de `Select` usa a sentinela `SEM_VALOR = "__nenhum__"`, normalizada para `null` no service | `src/lib/schemas/` |
| Enums no cliente | Arrays `as const` espelhando os enums do Prisma | `src/lib/schemas/enums.ts` |
| Serviços | Funções em `src/server/services/*.ts` recebendo `SessaoAtiva`; checam `requirePermission(perfil, acao)` + `requireAlteracaoFilial(podeAlterarFilial)`; isolam por `filialId` da sessão; auditam com `registrarAuditoria({ entidade, acao, anterior, novo }, tx?)` | `src/server/services/`, `src/server/audit/registrar.ts` |
| Permissões | RBAC por `Perfil` (ADMINISTRADOR, FINANCEIRO, TESOURARIA, GESTOR, AUDITOR, CONSULTA) × `Acao` (`titulo:escrever`, `lancamento:ler`...); helpers booleanos `podeEscreverTitulo` etc. para a UI | `src/server/auth/permissions.ts` |
| Escopo de dados | Título, lançamento, conta, dimensões: **por filial**. Cliente/Fornecedor: **por empresa**. Dashboard executivo: **consolidado da empresa** (laço em todas as filiais) | services |
| UI | Server Components nas páginas + dialogs client (`*-dialog-form.tsx`) chamando Server Actions (`actions.ts`); filtros na URL com parser puro testado (`filtro-titulos-url.ts`); `Badge`, `Select`, `Card`, Recharts via `components/ui/chart` | `src/app/(dashboard)/` |
| API externa | REST `/api/v1/*` com chave de API (`executarRotaApi`), testes `route.test.ts` por rota; documentação em `docs/api-v1.md` | `src/app/api/v1/` |
| Exportação | `export/route.ts` por tela, CSV/Excel via `src/lib/export/` reutilizando o mesmo parser de filtros da página | `financeiro/*/export/` |

### 0.2 Pessoas (Clientes/Fornecedores)

- `Cliente` e `Fornecedor` são modelos separados, por **empresa**, com `nome`, `cnpjCpf` (único por empresa, formatado), contato e dados de pagamento (PIX/depósito).
- **Não existe** nenhuma informação fiscal: regime tributário, inscrição estadual, indicação de "emite nota". O tipo de pessoa (PF/PJ) só é deduzível pelo tamanho do `cnpjCpf` (`src/lib/cnpjCpf.ts`).

### 0.3 Títulos e lançamentos

| Ponto | Situação hoje | Consequência para o recurso |
|---|---|---|
| `Titulo.documento` (`String`, obrigatório) | Texto livre, é o único "número de documento" do título | Não dá para saber se é NF, recibo ou referência interna. **Continua sendo a referência interna**; os dados fiscais ganham campos próprios |
| `Parcela` / `Baixa` | Título 1→N parcelas; baixa com aprovação (`PENDENTE → APROVADO`) | A classificação fica no **título**; parcelas e baixas herdam por relação |
| `Anexo` (por título) | Upload privado no Vercel Blob | Reaproveitado para o PDF/XML da nota ou o recibo; serve de critério de "pendência fiscal" |
| `LancamentoBancario` | `origem` = `MANUAL` / `BAIXA` / `TRANSFERENCIA`; sem contraparte nem documento | Precisa de classificação **própria** (manuais e criados na conciliação) e **herdada** (baixas) |
| `aprovarBaixa()` (`server/services/baixa.ts:83`) | Cria o lançamento copiando categoria/centros/safra/projeto do título | Ponto exato para **copiar também a classificação** |
| `criarLancamentoDaLinha()` (`server/services/conciliacao.ts:398`) | Cria lançamento `MANUAL` já conciliado a partir da linha do extrato | Precisa receber a classificação (default `FISCAL`) |
| Fluxo realizado, orçamento realizado, por dimensão, dashboard | Agregam `lancamentoBancario` com `conciliado: true` | Filtro entra como `where` adicional |
| Fluxo projetado, orçamento projetado, por dimensão projetado, dashboard (aberto/aging) | Agregam `parcela` com `titulo` | Filtro entra como `titulo: { classificacaoFiscal }` |
| Filtros de títulos (`filtro-titulos-url.ts`) | Parser de URL testado, usado por páginas e exports | Ganha o parâmetro `classificacao` |
| API v1 (`/titulos`, `/lancamentos-bancarios`) e importação CSV (`importacaoTitulo.ts`) | Campos fixos | Ganham campos **opcionais** (compatível com integrações e planilhas atuais) |
| **Dinheiro em espécie** | `conciliado = true` só acontece via extrato | **Lacuna:** acerto em dinheiro, típico das negociações sem nota, nunca entra no realizado. Tratado na Fase B (2.6) |

### 0.4 Validações e permissões

- Validação em duas camadas: Zod na Server Action/rota e regras de integridade no service (referências da mesma filial, contraparte da empresa, duplicidades). Erros de Zod viram mensagens por campo no form; na API viram 422 com `campos`.
- Nenhuma ação de permissão é específica por tipo de documento hoje. Leitura financeira (`titulo:ler`, `lancamento:ler`) é concedida a todos os perfis, inclusive AUDITOR e CONSULTA.

---

## 1. Visão Geral e Regras de Negócio

### 1.1 Conceitos

- **Documento FISCAL**: movimento lastreado em documento fiscal/oficial: NF-e, NFC-e, NFS-e, CT-e, nota do produtor/avulsa, nota de entrada emitida pela própria empresa, guia de tributo, folha de pagamento, tarifa bancária ou contrato. Entra na apuração de impostos e é o que a contabilidade enxerga.
- **Documento GERENCIAL**: negociação **sem nota** com clientes/fornecedores que não emitem documento fiscal, controlada apenas internamente (recibo, pedido interno ou sem comprovante). Afeta caixa, DRE gerencial e fluxo, mas **não** a apuração fiscal.

A classificação é um **atributo do título** (e, por cópia, dos lançamentos que ele gera). Não é um "segundo livro": mesmo cadastro, mesmas telas, mesmo saldo bancário.

### 1.2 Princípios de desenho

1. **Filtro padrão "Todos"** em toda tela/relatório. Com o filtro vazio, todos os números existentes ficam **idênticos aos de hoje** (é o teste de não regressão).
2. **Saldo bancário é físico e não se divide.** Contas bancárias não são fiscais nem gerenciais; só o *movimento* é. Visões filtradas mostram "acumulado do período", não saldo (3.5).
3. **Transparência interna:** gerenciais são visíveis a todos os perfis que já leem o financeiro, **incluindo AUDITOR**. Toda mudança de classificação é auditada com motivo. O recurso organiza a informação, não cria área oculta.
4. **Mudanças só aditivas** em tabelas existentes: colunas *nullable* ou com *default* constante. Nenhum campo existente muda de tipo, nome ou obrigatoriedade.

### 1.3 Regras de classificação automática

Ordem de resolução ao **criar** um título (`resolverClassificacao`):

1. Classificação **informada** explicitamente (form, API, CSV), se houver.
2. Senão, o **padrão da contraparte** (`Cliente/Fornecedor.classificacaoFiscalPadrao`), se configurado.
3. Senão, **`FISCAL`**.

| Origem do movimento | Classificação |
|---|---|
| Título novo | Regra acima |
| Lançamento de **baixa** aprovada | Copiada do título no momento da aprovação |
| Lançamento **manual** (tesouraria) | Informada no form; default `FISCAL` |
| Lançamento criado na **conciliação** (linha do extrato sem título) | Informada no form; default `FISCAL` (tarifas, IOF, rendimentos são documentos bancários) |
| **Transferência** entre contas | `null`: não é receita nem despesa; fica fora dos filtros e aparece só em "Todos" |
| Importação CSV | Coluna opcional; ausente → regra de criação |
| API v1 | Campo opcional; ausente → regra de criação |

Sugestão de UX (não é regra): ao cadastrar contraparte **pessoa física** (CPF), o form pode sugerir `GERENCIAL` como padrão, sem aplicar automaticamente.

### 1.4 Regras de transição (reclassificação)

| Transição | Quando acontece | Regra |
|---|---|---|
| GERENCIAL → FISCAL | Nota emitida depois (ex.: produtor emitiu nota avulsa; empresa emitiu nota de entrada) | Permitida, com **motivo obrigatório**; exige tipo de comprovante fiscal; número/chave podem vir depois (viram pendência) |
| FISCAL → GERENCIAL | Lançado como fiscal por engano | Permitida, com **motivo obrigatório**; dados de nota precisam ser apagados (CHECK de coerência) |
| Propagação | Qualquer reclassificação | Na **mesma transação**, `updateMany` nos lançamentos bancários das baixas do título; auditoria `RECLASSIFICAR` com `anterior/novo/motivo` |
| Filial somente leitura | — | Bloqueado (`requireAlteracaoFilial`) |

### 1.5 Regras de validação

| Regra | Onde | Severidade |
|---|---|---|
| `tipoComprovante` pertence ao grupo da classificação (fiscal × gerencial) | Zod + CHECK no banco | bloqueia |
| `chaveAcesso` só para `NFE`/`NFCE`/`CTE`; 44 dígitos; DV módulo 11 válido | Zod + CHECK (formato) | bloqueia |
| `chaveAcesso` única por filial entre títulos ativos | service | bloqueia: "Esta nota já está lançada no título <documento>" |
| Mesma `contraparte + tipoComprovante + série + número` já lançada | service | bloqueia (nota em duplicidade) |
| `numeroDocumentoFiscal` informado ⇒ `tipoComprovante` obrigatório | Zod | bloqueia |
| GERENCIAL com número/série/chave de nota | Zod | bloqueia |
| Alterar classificação sem `motivoReclassificacao` | Zod (edição) + service | bloqueia |
| FISCAL sem tipo/número/chave/anexo | Relatório de pendências | **não bloqueia** (a nota pode chegar depois) |

> **Observação de negócio:** a obrigatoriedade de nota depende de cada operação. Na compra de produtor rural pessoa física, por exemplo, costuma caber ao comprador emitir **nota de entrada**, por isso o tipo `NF_ENTRADA` existe. Uma compra "do fornecedor que não emite nota" pode, por orientação do contador, virar FISCAL com nota emitida pela própria empresa. Validar os casos típicos com a contabilidade antes do go-live.

### 1.6 Decisões (confirmadas em 2026-11-03)

| # | Decisão | Confirmado |
|---|---|---|
| FG1 | Classificação dos títulos/lançamentos **já existentes** | ✅ **`FISCAL`** (backfill). O relatório de pendências (fiscais sem nº de nota) expõe o que precisa ser reclassificado |
| FG2 | Título FISCAL exige nº da nota no cadastro? | ✅ **Não bloqueia**; vira pendência fiscal |
| FG3 | Permissão separada para lançar GERENCIAL? | ✅ **Não**: valem as mesmas permissões de hoje (o item 2.13 do checklist não se aplica) |
| FG4 | Conta "Caixa (dinheiro em espécie)" | ✅ **Fase B** (bloco 5 do checklist) |
| FG5 | Filtro no fluxo estratégico | ✅ **Não nesta entrega**; registrado em `docs/backlog.md` ("Classificação Fiscal × Gerencial") |

---

## 2. Alterações na Modelagem de Dados (Schema / Migrations)

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

Espelho em `src/lib/schemas/enums.ts`, **só acrescentando** (as consts existentes não mudam):

```ts
export const CLASSIFICACAO_FISCAL = ["FISCAL", "GERENCIAL"] as const;
export const TIPO_COMPROVANTE_FISCAL = ["NFE", "NFCE", "NFSE", "CTE", "NF_PRODUTOR", "NF_ENTRADA", "GUIA_TRIBUTO", "FOLHA_PAGAMENTO", "TARIFA_BANCARIA", "CONTRATO", "OUTRO_FISCAL"] as const;
export const TIPO_COMPROVANTE_GERENCIAL = ["RECIBO", "PEDIDO_INTERNO", "SEM_COMPROVANTE"] as const;
export const TIPO_COMPROVANTE = [...TIPO_COMPROVANTE_FISCAL, ...TIPO_COMPROVANTE_GERENCIAL] as const;
/** Tipos que identificam uma nota com número/série. */
export const TIPOS_COM_NUMERO_NOTA = ["NFE", "NFCE", "NFSE", "CTE", "NF_PRODUTOR", "NF_ENTRADA"] as const;
/** Tipos com chave de acesso de 44 dígitos. */
export const TIPOS_COM_CHAVE_ACESSO = ["NFE", "NFCE", "CTE"] as const;
export const ROTULOS_CLASSIFICACAO_FISCAL = { FISCAL: "Fiscal (com documento)", GERENCIAL: "Gerencial (sem nota)" } as const;
export const ROTULOS_TIPO_COMPROVANTE = { NFE: "NF-e", NFCE: "NFC-e", NFSE: "NFS-e", CTE: "CT-e", NF_PRODUTOR: "Nota do produtor / avulsa", NF_ENTRADA: "Nota de entrada (emissão própria)", GUIA_TRIBUTO: "Guia de tributo", FOLHA_PAGAMENTO: "Folha de pagamento", TARIFA_BANCARIA: "Tarifa bancária", CONTRATO: "Contrato", OUTRO_FISCAL: "Outro documento oficial", RECIBO: "Recibo", PEDIDO_INTERNO: "Pedido interno", SEM_COMPROVANTE: "Sem comprovante" } as const;
```

### 2.2 Campos novos (todos aditivos)

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
  classificacaoFiscal ClassificacaoFiscal? @default(FISCAL)   // null apenas para TRANSFERENCIA
  tipoComprovante     TipoComprovante?
  numeroComprovante   String?

  @@index([filialId, classificacaoFiscal, data])
}

model Cliente {
  // ...
  classificacaoFiscalPadrao ClassificacaoFiscal?   // null = sem padrão (cai em FISCAL)
}

model Fornecedor {
  // ...
  classificacaoFiscalPadrao ClassificacaoFiscal?
}
```

Correspondência com os campos sugeridos no pedido:

| Pedido | Modelagem adotada | Por quê |
|---|---|---|
| `tipo_documento: FISCAL \| GERENCIAL` | `Titulo.classificacaoFiscal` (+ cópia em `LancamentoBancario`) | Nome em camelCase como o resto do schema; "tipo" já é usado (`TipoTitulo`) |
| `exige_nota_fiscal: boolean` (na pessoa) | `classificacaoFiscalPadrao ClassificacaoFiscal?` | Três estados (Fiscal / Gerencial / sem padrão) em vez de dois; o `null` preserva o comportamento atual para todos os cadastros existentes |
| Chave DFe, série, número | `chaveAcesso`, `serieDocumentoFiscal`, `numeroDocumentoFiscal`, `dataEmissaoDocumentoFiscal`, `tipoComprovante` | O `documento` atual continua como referência interna |

Decisões de modelagem:

- **Colunas no próprio `Titulo`** (e não tabela 1:1): ~10 consultas de fluxo/orçamento/dashboard filtram por elas; uma tabela à parte obrigaria join em todas. Com default/nullable, nenhum `create`/`select` existente quebra.
- **`LancamentoBancario.classificacaoFiscal` é nullable com `@default(FISCAL)`** (corrigido na implementação): sem o default, a CHECK `lancamentos_classificacao_chk` faria falhar todo código que cria lançamento sem informar a classificação, inclusive o código em produção no intervalo entre a migration e o deploy e as fixtures de teste (47 testes quebraram na 1ª tentativa). Com o default, só `criarTransferencia` precisa gravar `null` explicitamente.
- **Cópia em `LancamentoBancario.classificacaoFiscal`**: as consultas de realizado fazem `groupBy` direto em `lancamentos_bancarios`; derivar via `baixa → parcela → titulo` impediria o `groupBy`. A consistência é garantida na aprovação da baixa e na reclassificação (1.4).
- **Uma nota → um título** (com N parcelas). Unicidade da chave por filial é verificada no service (índice simples, não único: índice parcial não é representável no Prisma e acusaria *drift*).
- Regime tributário / inscrição estadual da contraparte **não** entram agora (não são necessários para a classificação); ficam para o módulo de Vendas/NF-e, se houver emissão (seção 5).

### 2.3 Migration `add_classificacao_fiscal`

`npx prisma migrate dev --name add_classificacao_fiscal --create-only`, revisar o SQL gerado e **acrescentar backfill e CHECKs** ao final:

```sql
-- (gerado) CREATE TYPE "ClassificacaoFiscal" ...; CREATE TYPE "TipoComprovante" ...;
-- (gerado) ALTER TABLE "titulos" ADD COLUMN "classificacaoFiscal" "ClassificacaoFiscal" NOT NULL DEFAULT 'FISCAL', ADD COLUMN ...;
-- (gerado) ALTER TABLE "lancamentos_bancarios" ADD COLUMN "classificacaoFiscal" "ClassificacaoFiscal" DEFAULT 'FISCAL', ...;
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

UPDATE "lancamentos_bancarios" SET "classificacaoFiscal" = NULL
 WHERE "origem" = 'TRANSFERENCIA';

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

**Garantias de retrocompatibilidade:**

- No PostgreSQL ≥ 11, `ADD COLUMN ... DEFAULT <constante>` é só metadado (sem reescrever a tabela); colunas nullable idem.
- Revisão obrigatória do SQL antes de aplicar: **não pode conter** `DROP`, `ALTER COLUMN`, `RENAME` nem `SET NOT NULL` em coluna existente. Os únicos `ALTER TABLE` em tabelas existentes são `ADD COLUMN`, `ADD CONSTRAINT` e `CREATE INDEX`.
- O `lancamentos_classificacao_chk` é adicionado **depois** do backfill, então todas as linhas existentes já o satisfazem.
- Rollback: a migration é reversível manualmente (`DROP CONSTRAINT`/`DROP COLUMN`/`DROP TYPE`); deixar o SQL de reversão anotado no PR, sem migration "down" (o projeto não usa).

### 2.4 Fixtures e seed

- `criarFixtureFinanceiro` / `limparFixtureFinanceiro` (`financeiroTestFixtures.ts`) **não mudam** (colunas têm default). Testes novos criam títulos com `classificacaoFiscal` explícito.
- `prisma/seed.ts` não muda.

### 2.5 Matriz de compatibilidade dos registros legados

| Tabela | Registro antigo após a migration | Efeito |
|---|---|---|
| `titulos` | `classificacaoFiscal = FISCAL`, demais campos `null` | Aparece como Fiscal com pendência "sem tipo de documento" |
| `lancamentos_bancarios` (BAIXA) | Herda do título (FISCAL) | — |
| `lancamentos_bancarios` (MANUAL) | `FISCAL` | — |
| `lancamentos_bancarios` (TRANSFERENCIA) | `null` | Só em "Todos" |
| `clientes`, `fornecedores` | `classificacaoFiscalPadrao = null` | Novos títulos continuam nascendo FISCAL, como hoje |

### 2.6 Fase B: conta "Caixa (dinheiro em espécie)" (FG4)

Motivo: o realizado só conta lançamentos `conciliado = true`, e só a conciliação de extrato marca isso. Pagamento/recebimento em dinheiro, comum nas negociações sem nota, fica fora do realizado, do orçamento e do dashboard.

- `enum TipoContaBancaria` += `CAIXA` (migration própria `add_tipo_conta_caixa`, só `ALTER TYPE ... ADD VALUE`). Espelhar em `TIPO_CONTA_BANCARIA`.
- `ContaBancaria.bancoId` continua obrigatório: criar de forma idempotente o `Banco` sentinela `codigo = "CX"`, `nome = "Caixa interno (dinheiro em espécie)"`. Evita tornar `bancoId` opcional, o que mudaria tipos usados em várias telas.
- Lançamentos (manuais, de baixa, de transferência) em conta `CAIXA` nascem com `conciliado = true`: alterar `criarLancamentoManual`, `criarTransferencia` (lado da conta caixa) e `aprovarBaixa` com `conciliado: conta.tipo === "CAIXA"`.
- Conferência física do caixa: recurso já existente "Informar saldo" (`SaldoBancarioInformado`) × saldo contábil, na Tesouraria.
- A conciliação esconde contas `CAIXA` do seletor de importação de extrato.

---

## 3. Especificação do Backend e APIs

### 3.1 Helper central: `src/server/services/classificacaoFiscal.ts` (novo)

```ts
export type FiltroClassificacao = ClassificacaoFiscal | undefined; // undefined = todos

export function whereLancamentoPorClassificacao(c: FiltroClassificacao) {
  return c ? { classificacaoFiscal: c } : {};
}
export function whereParcelaPorClassificacao(c: FiltroClassificacao) {
  return c ? { titulo: { classificacaoFiscal: c } } : {};
}
/** Aceita só "FISCAL" | "GERENCIAL"; qualquer outro valor (inclusive SEM_VALOR) = todos. */
export function classificacaoDaUrl(valor: string | undefined): FiltroClassificacao;

/** Regras puras de coerência: usadas pelo Zod (superRefine), pelos services e pela importação CSV. */
export function validarComprovante(d: {
  classificacaoFiscal: ClassificacaoFiscal;
  tipoComprovante?: TipoComprovante | null;
  numeroDocumentoFiscal?: string | null;
  serieDocumentoFiscal?: string | null;
  chaveAcesso?: string | null;
}): { campo: string; mensagem: string }[];

export function normalizarChaveAcesso(valor: string): string;        // remove espaços/pontuação
export function chaveAcessoValida(chave: string): boolean;           // 44 dígitos + DV módulo 11 (pesos 2..9)
export function resolverClassificacao(
  informada: ClassificacaoFiscal | undefined,
  padraoContraparte: ClassificacaoFiscal | null,
): ClassificacaoFiscal;                                              // informada ?? padrão ?? "FISCAL"

export type PendenciaFiscal = "SEM_TIPO_DOCUMENTO" | "SEM_NUMERO_NOTA" | "SEM_CHAVE_ACESSO" | "SEM_ANEXO";
export function pendenciasFiscaisDoTitulo(
  t: { classificacaoFiscal: ClassificacaoFiscal; tipoComprovante: TipoComprovante | null; numeroDocumentoFiscal: string | null; chaveAcesso: string | null },
  quantidadeAnexos: number,
): PendenciaFiscal[];                                               // GERENCIAL → sempre []
```

Funções puras com testes (`classificacaoFiscal.test.ts`), incluindo uma chave de acesso real válida e a mesma com o DV alterado.

### 3.2 DTOs / schemas Zod

| Arquivo | Mudança |
|---|---|
| `lib/schemas/titulo.ts` | `camposComuns` ganha: `classificacaoFiscal: z.enum(CLASSIFICACAO_FISCAL).optional()`, `tipoComprovante: z.enum(TIPO_COMPROVANTE).optional().or(z.literal(SEM_VALOR))`, `numeroDocumentoFiscal`, `serieDocumentoFiscal`, `motivoSemDocumento`, `motivoReclassificacao` (string opcional ou `""`), `chaveAcesso` (com `transform(normalizarChaveAcesso)`), `dataEmissaoDocumentoFiscal: z.coerce.date().optional().or(z.literal(""))`. `superRefine` chamando `validarComprovante` quando houver classificação. **Sem `.default()` na classificação**, para o service distinguir "omitido" e aplicar o padrão da contraparte. `tituloHeaderSchema` e `tituloSchema` herdam automaticamente |
| `lib/schemas/lancamentoBancario.ts` | `lancamentoManualSchema` += `classificacaoFiscal: z.enum(CLASSIFICACAO_FISCAL).default("FISCAL")`, `tipoComprovante` e `numeroComprovante` opcionais (coerência de grupo via `superRefine`). `transferenciaSchema` e `saldoBancarioSchema` **não mudam** |
| `lib/schemas/conciliacao.ts` | `lancamentoDaLinhaSchema` += `classificacaoFiscal` (default `FISCAL`), `tipoComprovante?` |
| `lib/schemas/cliente.ts`, `fornecedor.ts` | `classificacaoFiscalPadrao: z.enum(CLASSIFICACAO_FISCAL).optional().or(z.literal(SEM_VALOR))` (mesmo padrão de `meioPagamento`) |

### 3.3 Services

| Arquivo | Mudança |
|---|---|
| `server/services/titulo.ts` | `camposNormalizados()` inclui os campos fiscais (`SEM_VALOR`/`""` → `null`). `criarTitulo()`: busca `classificacaoFiscalPadrao` da contraparte, aplica `resolverClassificacao`, roda as checagens de duplicidade (chave por filial; contraparte+tipo+série+número). `atualizarTitulo()`: se a classificação mudou → exige motivo, faz `tx.lancamentoBancario.updateMany({ where: { baixa: { parcela: { tituloId: id } } }, data: { classificacaoFiscal, tipoComprovante, numeroComprovante } })` **na mesma transação** e audita com ação `RECLASSIFICAR`; os campos novos entram no objeto `anterior` (linha ~251, mesma forma do `novo`) para o diff não acusar tudo alterado. `FiltroTitulos` += `classificacao?: ClassificacaoFiscal`, aplicado no `where` de `listarTitulos`; `listarTitulos` inclui `_count: { select: { anexos: true } }` para a coluna de pendências |
| `server/services/baixa.ts` | `aprovarBaixa()` (linha 102): o `lancamentoBancario.create` grava `classificacaoFiscal: parcela.titulo.classificacaoFiscal`, `tipoComprovante: parcela.titulo.tipoComprovante`, `numeroComprovante: parcela.titulo.numeroDocumentoFiscal` (o `include: { titulo: true }` já traz os campos) |
| `server/services/lancamentoBancario.ts` | `criarLancamentoManual` grava os campos; `criarTransferencia` deixa `null` explicitamente; `listarLancamentos(filialId, opcoes = {})` aceita `opcoes.classificacao` |
| `server/services/conciliacao.ts` | `criarLancamentoDaLinha` (linha 398): `dados` += `classificacaoFiscal`, `tipoComprovante`; gravados no `create` (linha 432) |
| `server/services/cliente.ts`, `fornecedor.ts` | Gravar `classificacaoFiscalPadrao` (normalizando `SEM_VALOR`); incluir no `anterior` da auditoria |
| `server/services/fluxoDeCaixa.ts` | `listarFluxoDeCaixaRealizado(..., opcoes = {})`: `opcoes.classificacao` entra no `findMany` dos lançamentos; **`buscarSaldoEmCaixaAte` não muda** (saldo é físico). Retorno ganha `filtrado: boolean` |
| `server/services/fluxoDeCaixaProjetado.ts` | `buscarParcelasEmAbertoNoPeriodo(filialId, inicio, fim, classificacao?)` e `listarFluxoDeCaixaProjetado(..., opcoes = {})` |
| `server/services/fluxoDeCaixaPorDimensao.ts` | `buscarRealizadoPorDimensaoNoPeriodo`, `buscarProjetadoPorDimensaoNoPeriodo` e `listarFluxoDeCaixaPorDimensao` com `opcoes.classificacao` |
| `server/services/orcamento.ts` | `buscarRealizadoPorCategoria`, `buscarProjetadoPorCategoria`, `listarComparativoOrcamento` com `opcoes.classificacao` (o **orçado** não é filtrado) |
| `server/services/orcamentoSafra.ts` | `listarComparativoSafras(sessao, opcoes = {})` |
| `server/services/dashboardExecutivo.ts` | `buscarIndicadoresExecutivos` e `buscarGraficosExecutivos` **inalterados**; nova `buscarResumoFiscalGerencial(sessao)`, consolidada por empresa no mesmo laço de filiais e com a mesma permissão `dashboardExecutivo:ler` |
| `server/services/importacaoTitulo.ts` | Colunas CSV opcionais `classificacaoFiscal` (aceita `FISCAL`/`GERENCIAL`/`F`/`G`, sem diferenciar maiúsculas), `tipoComprovante`, `numeroDocumentoFiscal`, `serieDocumentoFiscal`, `chaveAcesso`; erros de `validarComprovante` viram erros da linha. **Arquivo sem essas colunas continua válido** |
| `server/services/relatorioFiscalGerencial.ts` (novo) | 3.5 |

**Convenção para os parâmetros novos:** sempre opcionais, no **final** da assinatura (`opcoes: { classificacao?: ClassificacaoFiscal } = {}`). Nenhuma chamada existente precisa mudar e todos os testes atuais continuam válidos.

### 3.4 Regras de filtro nas listagens

| Valor | Títulos / parcelas | Lançamentos |
|---|---|---|
| ausente, `""` ou `SEM_VALOR` (**Todos**) | sem `where` extra (consulta idêntica à atual) | sem `where` extra; inclui transferências |
| `FISCAL` | `titulo.classificacaoFiscal = FISCAL` | `classificacaoFiscal = FISCAL` (exclui transferências) |
| `GERENCIAL` | `titulo.classificacaoFiscal = GERENCIAL` | `classificacaoFiscal = GERENCIAL` (exclui transferências) |
| valor inválido | tratado como Todos (mesmo comportamento de `statusOuUndefined`) | idem |

Parâmetro de URL único em todo o sistema: `?classificacao=FISCAL|GERENCIAL`.

### 3.5 Semântica do fluxo filtrado e relatório Fiscal × Gerencial

**Fluxo de caixa:**

- **Sem filtro:** exatamente como hoje (saldo inicial, entradas, saídas, geração, saldo final).
- **FISCAL ou GERENCIAL:** entradas, saídas e geração líquida só da classificação; saldo inicial/final substituídos por **"acumulado no período"** (começa em zero). Transferências ficam fora (entre contas da mesma filial elas se anulam). Aviso na página: *"Visão filtrada: mostra apenas o movimento classificado como X. O saldo bancário é único e aparece só na visão 'Todos'."*
- **Projetado filtrado:** mesma regra (acumulado das parcelas em aberto daquela classificação, sem o saldo de caixa de hoje).

**`relatorioFiscalGerencial.ts`** (escopo: filial ativa; permissão `titulo:ler` **e** `lancamento:ler`):

```ts
obterComparativoMensal(sessao, ano): Array<{
  mes: number;
  entradasFiscal: number; entradasGerencial: number;
  saidasFiscal: number;   saidasGerencial: number;
  percentualGerencialEntradas: number | null; percentualGerencialSaidas: number | null;
}>   // realizado: lançamentos conciliados, sem transferências

obterEmAbertoPorClassificacao(sessao): { receberFiscal; receberGerencial; pagarFiscal; pagarGerencial }

obterTopContrapartesGerenciais(sessao, de, ate, limite = 10): Array<{
  contraparteId; nome; tipo: "CLIENTE" | "FORNECEDOR"; quantidadeTitulos; valorTotal;
}>

listarPendenciasFiscais(sessao, filtros?: { pendencia?: PendenciaFiscal; tipo?: TipoTitulo }): Array<{
  tituloId; documento; contraparte; tipo; emissao; valor; pendencias: PendenciaFiscal[];
}>
```

### 3.6 Permissões e auditoria

- **Nenhuma ação nova obrigatória** (FG3): título FISCAL ou GERENCIAL usa `titulo:escrever`; lançamento manual usa `lancamento:escrever`; reclassificar usa `titulo:escrever` + motivo + auditoria; padrão da contraparte usa `cadastro:escrever`.
- Leitura: quem tem `titulo:ler`/`lancamento:ler` vê as duas classificações (AUDITOR e GESTOR incluídos).
- **Se FG3 = sim:** adicionar `"gerencial:escrever"` ao tipo `Acao` (ADMINISTRADOR, FINANCEIRO e TESOURARIA por padrão), exigida no service quando `classificacaoFiscal === "GERENCIAL"` na criação e na reclassificação; helper `podeEscreverGerencial(perfil, podeAlterarFilial)` para esconder a opção no form; teste em `permissions.test.ts`.
- Auditoria: `Titulo` (`CRIAR`/`ATUALIZAR` com campos fiscais no diff; `RECLASSIFICAR` com `motivo`), `LancamentoBancario` (`CRIAR` com classificação), `Cliente`/`Fornecedor` (`ATUALIZAR` com o padrão).

### 3.7 API REST v1 (compatível com integrações atuais)

| Rota | Mudança |
|---|---|
| `POST /api/v1/titulos` | Corpo += `classificacaoFiscal?`, `tipoComprovante?`, `numeroDocumentoFiscal?`, `serieDocumentoFiscal?`, `chaveAcesso?`, `dataEmissaoDocumentoFiscal?`, `motivoSemDocumento?`. Omitidos → padrão da contraparte → `FISCAL`. Regras da 1.5 violadas → **422** com `campos` |
| `GET /api/v1/titulos?classificacao=FISCAL\|GERENCIAL` | Parâmetro opcional; JSON passa a trazer os campos novos (só adição de propriedades) |
| `POST /api/v1/lancamentos-bancarios` | `classificacaoFiscal?` (default `FISCAL`), `tipoComprovante?`, `numeroComprovante?` |
| `GET /api/v1/lancamentos-bancarios?classificacao=` | Opcional |
| `POST/GET /api/v1/clientes`, `/fornecedores` | Aceitam e devolvem `classificacaoFiscalPadrao` (opcional) |

Atualizar `docs/api-v1.md` (tabela de campos + exemplos).

### 3.8 Exportações

- `contas-a-pagar/export`, `contas-a-receber/export`: colunas novas **ao final** (Classificação, Tipo de comprovante, Nº nota, Série, Chave de acesso, Pendências) e respeito ao `classificacao` da URL (via `CAMPOS_FILTRO_TITULOS`).
- `fluxo-de-caixa/export`: respeita o filtro; na visão filtrada exporta "Acumulado" no lugar de saldo.
- Novo `controladoria/fiscal-gerencial/export`.

---

## 4. Ajustes no Frontend / UI

### 4.1 Formulários de cadastro

| Componente | Mudança |
|---|---|
| `cadastros/clientes/cliente-dialog-form.tsx`, `cadastros/fornecedores/fornecedor-dialog-form.tsx` | `Select` **"Classificação padrão dos títulos"**: Nenhuma / Fiscal / Gerencial. Ajuda: *"Use Gerencial para parceiros que não emitem nota. Novos títulos deste parceiro já virão com essa classificação."* |
| `financeiro/_titulos/titulo-dialog-form.tsx` | Nova seção **"Documento fiscal"** abaixo de "Documento": `Select` Classificação (Fiscal / Gerencial); `Select` Tipo de comprovante (opções filtradas pela classificação); Nº da nota, Série e Data de emissão (só para `TIPOS_COM_NUMERO_NOTA`); Chave de acesso (só NF-e/NFC-e/CT-e, contador 0/44 e validação do DV no cliente com `chaveAcessoValida`); para GERENCIAL, "Motivo sem nota". Ao escolher a contraparte, **na criação**, pré-seleciona `classificacaoFiscalPadrao`. Na **edição**, se a classificação mudar, aparece "Motivo da reclassificação" (obrigatório) |
| `financeiro/tesouraria/lancamento-dialog-form.tsx` | Classificação (default Fiscal), Tipo de comprovante, Nº do comprovante |
| `financeiro/conciliacao/criar-lancamento-dialog-form.tsx` | Classificação (default Fiscal) e Tipo de comprovante |
| `financeiro/_titulos/importar-csv-dialog.tsx` | Texto de ajuda com as colunas opcionais novas |

### 4.2 Badges / tags nas listagens

- Componente novo `src/app/(dashboard)/_shared/badge-classificacao.tsx`: `Badge` "Fiscal" (variante `outline`) / "Gerencial" (variante `secondary`); `null` (transferência) não renderiza nada. Texto sempre visível (não depender só de cor, por acessibilidade).
- `financeiro/_titulos/titulo-table.tsx`: badge na coluna Documento, com o nº da nota abaixo quando houver; ícone de alerta com *tooltip* listando as pendências fiscais (`pendenciasFiscaisDoTitulo`).
- `financeiro/tesouraria/page.tsx`: badge na lista de lançamentos.

### 4.3 Filtros

- Componente novo `src/app/(dashboard)/_shared/seletor-classificacao.tsx` (client): `Select` **Todos / Fiscal / Gerencial** que atualiza `classificacao` na URL preservando os demais parâmetros; mesmo padrão de `seletor-periodo.tsx`/`seletor-modo.tsx`, com função pura de montagem da URL testada.
- `financeiro/_titulos/barra-de-filtros.tsx` + `filtro-titulos-url.ts`: `classificacao` em `CAMPOS_FILTRO_TITULOS` e em `filtroTitulosDaUrl` (usando `classificacaoDaUrl`); testes em `filtro-titulos-url.test.ts` e `barra-de-filtros.test.ts`. Vale para Contas a pagar, Contas a receber e exports.
- Tesouraria, `fluxo-de-caixa`, `fluxo-de-caixa-projetado`, `controladoria/orcamento`, `fluxo-por-dimensao`, `comparacao-safras`: `SeletorClassificacao` (padrão Todos). Nos fluxos, aviso da visão filtrada e colunas de saldo renomeadas para "Acumulado" quando filtrado (3.5).

### 4.4 Dashboard e tela nova

- `dashboard-executivo/page.tsx`: bloco de `Card`s **"Fiscal × gerencial (mês)"**: entradas fiscal, entradas gerencial, % gerencial, nº de pendências fiscais (link para o relatório).
- Nova página `/controladoria/fiscal-gerencial` (item em "Controladoria" no `nav-items.ts`; protegida por `requirePermission` na página):
  1. Seletor de ano (`controladoria/_shared/seletor-ano-mes.tsx`).
  2. Tabela mensal + gráfico de barras empilhadas (Recharts via `components/ui/chart`).
  3. Cards "Em aberto": a receber fiscal/gerencial, a pagar fiscal/gerencial.
  4. Top 10 contrapartes gerenciais no período.
  5. **Pendências fiscais**: tabela com link para o título e filtro por tipo de pendência.
  6. `ExportarLinks`.
- `content/ajuda/passo-a-passo.md`: seção "Lançamentos fiscais e gerenciais" + verbete no glossário.

---

## 5. Matriz de Impacto em Módulos Futuros

| Módulo futuro | O que este plano já entrega | O que o módulo futuro acrescenta |
|---|---|---|
| **Vendas** (`PedidoVenda`) | Enums `ClassificacaoFiscal`/`TipoComprovante`; `Cliente.classificacaoFiscalPadrao`; `resolverClassificacao`/`validarComprovante` reutilizáveis | `PedidoVenda.classificacaoFiscal` (obrigatória, padrão do cliente → FISCAL) + dados do comprovante; **venda FISCAL → NF-e/NFC-e (DANFE / cupom)**; **venda GERENCIAL → recibo/pedido interno** impresso; título a receber gerado herda classificação e nota; `documento` interno = `PV-<n>` |
| **Compras / recepção de produtos** (`RecepcaoFruto`) | `Fornecedor.classificacaoFiscalPadrao`; tipo `NF_ENTRADA` e `NF_PRODUTOR` | Classificação e comprovante na recepção de terceiro (produção própria = `null`); título a pagar herda; `documento` = `RF-<lote>` |
| **Produtos / estoque** | Nada específico | Estoque é **único** (físico, como o saldo bancário); a classificação vive no documento de entrada/saída, não no produto. Relatórios de giro/margem filtram por `classificacao` do documento |
| **Emissão de NF-e** (se houver) | Campos `chaveAcesso`, série, número, data de emissão; unicidade da chave por filial | Integração com emissor/SEFAZ preenche esses campos automaticamente; regime tributário, IE e endereço fiscal no cadastro de pessoa; XML do DFe guardado como `Anexo` |
| **DRE / apuração de impostos** | Filtro `classificacao` em todo realizado/projetado; relatório Fiscal × Gerencial | DRE fiscal = filtro `FISCAL`; DRE gerencial = "Todos"; base de apuração usa só `FISCAL` com tipo de comprovante |
| **Fluxo de caixa** | Visões filtradas com "acumulado" | Nenhuma mudança adicional |

O `DOCTO_IMPLEMENT_PROD-VEND.md` (Revisão 1.1) já foi ajustado para essas dependências, com os trechos marcados **[FG]**: cabeçalho com pré-requisito, 1.5 Integração, 2.4 modelos `RecepcaoFruto`/`PedidoVenda`, 2.6 CHECKs, 3.3.x regras e painel, 3.5/3.6 schemas e API, 4.2 telas, R14 em riscos, checklist 6.0.0 e importação com `--classificacao-padrao`.

---

## 6. Checklist de Execução Passo a Passo (Claude Code Executable)

> Branch `feat/classificacao-fiscal-gerencial` a partir de `staging`. Conventional Commits (`feat(financeiro): ...`). **Não avançar com teste vermelho.** Antes de começar: ler `AGENTS.md`, este plano e os arquivos citados; rodar `npm run test` para ter a linha de base verde e anotar os números de fluxo realizado/projetado e do dashboard da base de dev (para comparar no fim). Decisões FG1–FG5 já confirmadas (1.6).

### 1. `[ ] Banco de Dados & Migrations`

- [x] 1.1 Adicionar enums `ClassificacaoFiscal` e `TipoComprovante` ao `schema.prisma` (2.1).
- [x] 1.2 Adicionar campos e índices em `Titulo`, `LancamentoBancario`, `Cliente`, `Fornecedor` (2.2).
- [x] 1.3 `npx prisma migrate dev --name add_classificacao_fiscal --create-only`.
- [x] 1.4 Revisar o SQL: só `CREATE TYPE`, `ADD COLUMN`, `CREATE INDEX`; nada de `DROP`/`ALTER COLUMN`/`RENAME`/`SET NOT NULL` em coluna existente.
- [x] 1.5 Acrescentar ao final o backfill e as CHECKs (2.3).
- [x] 1.6 `npm run db:migrate && npm run db:generate`.
- [x] 1.7 `tsc --noEmit && npm run test`: **suíte existente 100% verde sem alterar nenhum teste** (499/499).
- [x] 1.8 Conferido no banco de dev: 17 títulos e 18 lançamentos (15 manuais, 3 de baixa) ficaram FISCAL; não havia transferências.
- [x] 1.9 Commit `feat(db): classificação fiscal × gerencial (migration aditiva)`.

### 2. `[x] Backend (Tipos, DTOs, Services, Routes)`

- [x] 2.1 Consts e rótulos em `lib/schemas/enums.ts` (só acréscimos).
- [x] 2.2 Regras puras em **`src/lib/classificacaoFiscal.ts`** (+ `classificacaoFiscal.test.ts`), reexportadas por `server/services/classificacaoFiscal.ts`, que acrescenta `where*PorClassificacao`, `ErroClassificacaoFiscal` e `garantirComprovanteValido`. *Ajuste:* as regras ficaram em `lib/` porque schemas Zod e o formulário (navegador) também as usam; o import pelo caminho do servidor, citado no DOCTO, continua válido.
- [x] 2.3 Schemas Zod: `titulo.ts` (objeto base + `superRefine` nos dois schemas — Zod 4 não permite `.extend` após refinamento), `lancamentoBancario.ts`, `conciliacao.ts`, `cliente.ts`, `fornecedor.ts`. *Ajuste:* a classificação do lançamento é `.optional()` (não `.default`), e o service aplica FISCAL — `.default` tornaria o campo obrigatório no tipo e quebraria quem já chama o service.
- [x] 2.4 `cliente.ts`/`fornecedor.ts` (services): gravar e auditar `classificacaoFiscalPadrao` + testes.
- [x] 2.5 `titulo.ts` + `tituloClassificacao.test.ts` (13 testes). *Acréscimo:* na edição, campo fiscal **ausente** mantém o valor gravado (vazio limpa) — quem não conhece os campos novos não apaga dados da nota.
- [x] 2.6 `baixa.ts`: cópia da classificação em `aprovarBaixa` (coberto pelo teste de reclassificação).
- [x] 2.7 `lancamentoBancario.ts` (manual, transferência `null`, filtro) e `conciliacao.ts` (`criarLancamentoDaLinha`) + testes.
- [x] 2.8 `opcoes.classificacao` em fluxo realizado, projetado, por dimensão, orçamento e comparação de safras + `classificacaoRelatorios.test.ts`. *Ajuste:* o retorno do fluxo **não** ganhou `filtrado`; na visão filtrada o saldo inicial é 0 (acumulado) e a página, que passa o filtro, troca os rótulos. O projetado filtrado não emite alerta de saldo negativo.
- [x] 2.9 `relatorioFiscalGerencial.ts` + `buscarResumoFiscalGerencial` (dashboard) + testes.
- [x] 2.10 `importacaoTitulo.ts` (colunas opcionais) + testes (CSV antigo segue válido; erros por linha; sem classificação valida contra o padrão da contraparte; nota repetida no mesmo arquivo derruba a importação).
- [x] 2.11 API v1 + `route.test.ts`. `?classificacao=` inválido → 422 (`classificacaoDaQuery`).
- [x] 2.12 Exports de contas a pagar/receber (colunas fiscais ao final) e fluxo de caixa (filtro + "Acumulado") + `docs/api-v1.md`. O filtro `classificacao` em `filtro-titulos-url.ts` (previsto em 3.5) foi feito aqui, porque os exports dependem dele. O export de `/controladoria/fiscal-gerencial` fica com a página (3.11).
- [x] 2.13 ~~(Só se FG3 = sim)~~ **Não se aplica** (FG3 = não). Ação `gerencial:escrever` + `podeEscreverGerencial` + testes em `permissions.test.ts`.
- [x] 2.14 Commits `96a01de`, `ce35bbb`, `86c5789`. Suíte: 572 testes passando.

### 3. `[x] Frontend (Formulários, Listagens, Filtros)`

- [x] 3.1 `_shared/badge-classificacao.tsx` e `_shared/seletor-classificacao.tsx` (+ teste da função de URL).
- [x] 3.2 Cadastros de cliente e fornecedor: `Select` de classificação padrão.
- [x] 3.3 `titulo-dialog-form.tsx`: seção "Documento fiscal", pré-seleção pelo padrão da contraparte, motivo de reclassificação na edição.
- [x] 3.4 `titulo-table.tsx`: badge + nº da nota + alerta de pendências.
- [x] 3.5 `barra-de-filtros.tsx`: filtro Classificação (o parser `filtro-titulos-url.ts` + testes já foi feito em 2.12).
- [x] 3.6 `importar-csv-dialog.tsx`: ajuda com as colunas novas.
- [x] 3.7 Tesouraria (form, badge, filtro) e conciliação (form de criar lançamento).
- [x] 3.8 Fluxo realizado e projetado: seletor + aviso + "Acumulado" na visão filtrada.
- [x] 3.9 Orçamento, fluxo por dimensão, comparação de safras: seletor.
- [x] 3.10 Dashboard executivo: bloco "Fiscal × gerencial (mês)".
- [x] 3.11 `/controladoria/fiscal-gerencial` + item no `nav-items.ts` + export (comparativo mensal e pendências). *Acréscimos:* `_shared/campos-classificacao-lancamento.tsx` (tesouraria + conciliação), `AvisoVisaoFiltrada` nos fluxos; diálogos longos ganharam rolagem (`max-h-[90vh]`).
- [x] 3.12 `content/ajuda/passo-a-passo.md`.

### 4. `[ ] Validação & Testes`

- [x] 4.1 `npm run lint`, `npm run test` (suíte inteira), `npm run build`.
- [x] 4.2 **Não regressão:** com filtro "Todos", os números anotados antes de começar batem exatamente (fluxo realizado, projetado, dashboard). *Coberto por `classificacaoRelatorios.test.ts` (sem `opcoes` = resultado de antes; Todos = Fiscal + Gerencial).*
- [x] 4.3 Cenário ponta a ponta no app (`npm run dev`): fornecedor "Produtor X" com padrão Gerencial → novo título vem Gerencial; tipo "Recibo" → baixa aprovada → lançamento Gerencial → fluxo filtrado "Gerencial" mostra só ele → reclassificar para Fiscal com NF-e (chave válida) e motivo → lançamento acompanha → auditoria mostra `RECLASSIFICAR` com motivo. *Feito no navegador em 2026-11-03 (fornecedor → título Gerencial/Recibo → lista e filtro → reclassificação para NF-e com aviso de DV → auditoria `RECLASSIFICAR` → tela Fiscal × gerencial → fluxo filtrado). A propagação aos lançamentos de baixa foi verificada pelo teste de integração, não pela UI.*
- [x] 4.4 Pendências: título fiscal sem número aparece no relatório; ao informar o número/chave e anexar a nota, sai da lista. *(testes de `relatorioFiscalGerencial` e `pendenciasFiscaisDoTitulo`; a lista com título sem nota foi vista na tela)*
- [x] 4.5 Duplicidade: cadastrar a mesma chave em outro título da filial → erro; em outra filial → permitido. *(testes de integração)*
- [ ] 4.6 Perfis: CONSULTA/AUDITOR veem gerenciais e não editam; filial somente leitura bloqueia reclassificação. *Pendente: conferência manual com usuários desses perfis (as permissões não mudaram; a edição continua exigindo `titulo:escrever` + filial com alteração).*
- [x] 4.7 API: integração antiga (corpo sem campos novos) segue funcionando; CSV antigo importa sem erro. *(testes de rota e de importação)*
- [ ] 4.8 Deploy em staging via workflow de migration → validação com dados reais → PR para `main`.

### 5. `[ ] Fase B — Conta Caixa (se FG4 = sim)`

- [ ] 5.1 Migration `add_tipo_conta_caixa` (`ALTER TYPE "TipoContaBancaria" ADD VALUE 'CAIXA'`) + criação idempotente do `Banco` sentinela `CX`; espelhar em `TIPO_CONTA_BANCARIA`.
- [ ] 5.2 `conciliado: conta.tipo === "CAIXA"` em `criarLancamentoManual`, `criarTransferencia`, `aprovarBaixa` + testes (dinheiro entra no realizado sem extrato).
- [ ] 5.3 Conciliação esconde contas CAIXA; form de conta bancária oferece o tipo "Caixa (dinheiro em espécie)" com o banco sentinela pré-selecionado.
- [ ] 5.4 Ajuda: conferência do caixa via "Informar saldo".

---

## Apêndice: Riscos de regressão e mitigação

| # | Risco | Mitigação |
|---|---|---|
| F1 | `ADD COLUMN` em tabelas grandes | Só colunas nullable ou com default constante (sem reescrita no PG ≥ 11); revisão do SQL (2.3); staging primeiro |
| F2 | Backfill classificar errado o histórico | FG1 explícito + relatório de pendências + reclassificação auditada |
| F3 | Números dos relatórios mudarem | Filtro padrão "Todos" = consulta atual sem `where` extra; teste "sem `opcoes` = antes" em cada service |
| F4 | Lançamento de baixa divergente do título | Cópia na aprovação + `updateMany` na reclassificação, na mesma transação; teste de integração |
| F5 | Diff de auditoria acusar tudo alterado | Campos novos no `anterior` de `atualizarTitulo`/`atualizarCliente`/`atualizarFornecedor`, na mesma forma do `novo` |
| F6 | Integrações da API/planilhas quebrarem | Campos novos opcionais; respostas só ganham propriedades; testes de rota existentes rodam sem alteração |
| F7 | Saldo "fiscal" enganoso | Saldo nunca é dividido; visão filtrada mostra "acumulado" com aviso |
| F8 | Conta CAIXA na conciliação de extrato | Filtrar `tipo !== "CAIXA"` no seletor |
| F9 | Prisma acusar *drift* | Sem índice parcial; unicidade da chave no service; CHECKs adicionadas por SQL não geram drift |
