# Tema por empresa — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** importar por empresa um tema JSON (`nx-tema` v1) com cores claro/escuro, fontes do Google e raio, validado (formato + contraste), e aplicá-lo no painel; logo escuro e favicon por upload.

**Architecture:** funções puras em `src/lib/tema/` (schema Zod, validação, contraste, variáveis, CSS, URL de fontes); serviço `src/server/services/temaEmpresa.ts` grava em `Empresa.tema`; o layout do painel injeta um `<style>` gerado só a partir de valores validados; tela `/empresas/[id]/tema`.

**Tech Stack:** Next.js 16 App Router (ler `node_modules/next/dist/docs/` antes de mexer em metadata/route handlers), Prisma, Zod 4 (`z.toJSONSchema`), Vitest (rodar pelo **PowerShell**), Vercel Blob (mock nos testes, como `empresa.test.ts`).

**Spec:** [docs/superpowers/specs/2026-11-15-tema-por-empresa-design.md](../specs/2026-11-15-tema-por-empresa-design.md)

## Global Constraints

- O tema padrão do sistema (`globals.css`, variações A/B/C) **não muda**; empresa sem tema fica igual a hoje.
- Cores só `#RRGGBB`, normalizadas para minúsculas. Contraste mínimo 4,5:1 (WCAG 2.x).
- O CSS injetado contém só nomes de propriedade de uma lista fechada e valores que passaram na validação; nada do arquivo é copiado como texto livre.
- Fontes só pelo nome no Google Fonts (`^[A-Za-z0-9 ]{1,40}$`), pesos 400 e 700, `display=swap`.
- Gerenciar tema e marca exige `empresa:gerenciar` (Administrador).
- **Não rodar prettier em arquivos existentes**; formatar à mão (linhas até ~120). Não reescrever arquivos com `Get-Content | Set-Content` (corrompe acentos).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisão de implementação (registrar como ruling)

- **Fontes por regra, não por variável:** em `globals.css` o `@theme inline` mapeia `--font-sans`/`--font-heading` para `var(--font-sans)` (inline: o utilitário recebe o valor literal), então sobrescrever variáveis não troca a fonte. O CSS do tema aplica `font-family` direto: `html[class] { font-family: <texto> }` e `html[class] :is(h1, h2, h3, .font-heading) { font-family: <titulos> }`. `globals.css` não é tocado.

## Review Focus

1. Tema salvo no banco que deixou de ser válido → o layout ignora e mostra o padrão (sem erro na página). Teste na Task 4.
2. Diálogo (portal fora do layout) com as cores do tema → o seletor é `html[class]`, não um wrapper. Conferido na Task 7 (navegador).
3. Usuário com `theme-b-dark` salvo no navegador numa empresa com tema só claro → recebe o claro (o bloco claro vale para `html[class]` inteiro). Teste na Task 2 (`cssDoTema` sem escuro não gera seletor `-dark`).
4. Pilha de fontes com `"` desbalanceado ou `</style>` → recusada. Teste na Task 1.
5. Importar JSON que não é JSON (texto colado errado) → erro "JSON inválido", não exceção. Teste na Task 4.

---

### Task 1: Schema, validação e contraste

**Files:**
- Create: `src/lib/tema/schema.ts`, `src/lib/tema/contraste.ts`, `src/lib/tema/validar.ts`
- Test: `src/lib/tema/validar.test.ts`, `src/lib/tema/contraste.test.ts`
- Create (fixture usada nos testes): `public/temas/hortitex.json` (valores da tabela "Tema Hortitex" do spec)

**Interfaces (produz):**
- `PAPEIS_OBRIGATORIOS = ["fundo","texto","primaria","textoSobrePrimaria","sidebar","textoSobreSidebar"] as const`
- `PAPEIS_OPCIONAIS = ["cartao","apoio","textoSobreApoio","textoApagado","destaque","textoSobreDestaque","borda","foco","erro","cabecalho","textoCabecalho"] as const` (+ `graficos`: tupla de 5 cores)
- `temaSchema` (Zod 4, `z.strictObject` em todos os níveis); `type Tema = z.infer<typeof temaSchema>`; `type CoresModo = Tema["cores"]["claro"]`
- `contraste(a: string, b: string): number` — razão WCAG (luminância relativa sRGB), arredondada a 2 casas.
- `validarTema(entrada: unknown): { ok: true; tema: Tema; avisos: string[] } | { ok: false; erros: string[] }`

Regras do schema: `formato: z.literal("nx-tema")`, `versao: z.literal(1)`, `nome` 1–60 sem `<>{}`; cor `^#[0-9a-fA-F]{6}$` → `toLowerCase()`; `raio` `^(\d+(\.\d+)?)(px|rem)$` com teto 32px / 2rem; `fontes.{texto,titulos}`: `{ pilha, google? }`, `google` até 2 nomes `^[A-Za-z0-9 ]{1,40}$`; `pilha` ≤ 200 caracteres, cada item separado por vírgula = nome `^[A-Za-z0-9 -]{1,40}$` ou entre aspas duplas `^"[A-Za-z0-9 -]{1,40}"$` (aparar espaços).
Contraste em `validarTema` (por modo, após herança de `cabecalho`→`fundo` e `textoCabecalho`→`texto`): essenciais bloqueiam; secundários (`textoApagado`/`fundo`, `texto`/`cartao`, `textoSobreApoio`/`apoio`, `textoSobreDestaque`/`destaque`, `erro`/`fundo`, só quando os dois existem) viram avisos. Mensagem: `cores.<modo>.<papelTexto> sobre <papelFundo>: contraste 3,1:1 (mínimo 4,5:1)` (vírgula decimal). Erros do Zod viram `"<caminho.com.pontos>: <mensagem>"`.

- [ ] **Step 1: testes** (`hortitex = JSON.parse(readFileSync("public/temas/hortitex.json"))`)
  - `contraste("#000000","#ffffff")` = 21; `contraste("#ffffff","#ffffff")` = 1; simétrico.
  - `validarTema(hortitex)` → `ok: true`, `avisos` vazio.
  - recusas (cada uma `ok: false` com o caminho na mensagem): cor `"#fff"`, `"red"`, `"#gggggg"`; campo extra `cores.claro.corNova`; `formato: "outro"`; `versao: 2`; sem `cores.claro`; `raio: "40px"`, `"3rem"`, `"1em"`; `google: ["Carlito;x"]`; `pilha` com `url(x)`, com `;`, com `</style>` e com aspas desbalanceadas `"\"Calibri, Carlito"`.
  - par essencial ruim: claro com `texto: "#777777"` e `fundo: "#888888"` → erro contendo `cores.claro.texto sobre fundo`.
  - secundário ruim: hortitex com `textoApagado: "#d8d0c0"` → `ok: true` e um aviso contendo `textoApagado`.
  - cores em maiúsculas são normalizadas (`"#F7F1E3"` → `"#f7f1e3"`).
- [ ] **Step 2:** `npx vitest run src/lib/tema` → FAIL (módulos não existem).
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5:** commit `feat(tema): formato nx-tema, validação e contraste`.

### Task 2: Variáveis, CSS e URL das fontes

**Files:**
- Create: `src/lib/tema/css.ts`
- Test: `src/lib/tema/css.test.ts`

**Interfaces:**
- Consumes: `Tema`, `CoresModo` (Task 1); `tomDestaque`, `corDeTextoContrastante` (`src/lib/corContraste.ts`).
- Produces:
  - `PADRAO_CLARO` / `PADRAO_ESCURO`: `Record<string,string>` com os valores de `.theme-a` / `.theme-a-dark` de `globals.css` para `--muted-foreground`, `--border`, `--input`, `--destructive`, `--chart-1..5` (copiar literalmente).
  - `variaveisDoModo(cores: CoresModo, padrao: Record<string,string>): Record<string,string>` — mapeamento e herança da tabela "Papéis de cor" do spec; derivados da sidebar: `--sidebar-accent = tomDestaque(sidebar, 8)`, `--sidebar-primary = tomDestaque(sidebar, 16)`, `-foreground` de cada um por `corDeTextoContrastante`, `--sidebar-border = textoSobreSidebar + "1a"`; `--apoio` ausente → `tomDestaque(fundo, 4)`.
  - `variaveisDoTema(tema): { claro: Record<string,string>; escuro: Record<string,string> | null }`
  - `cssDoTema(tema): string` — `html[class]{…;font-family:…;--radius:…}` + (se escuro) `html[class*="-dark"]{…}` + regra de títulos; só propriedades de `NOMES_PERMITIDOS` (constante com todas as chaves de `variaveisDoModo`, `--radius`).
  - `urlGoogleFonts(tema): string | null` — `https://fonts.googleapis.com/css2?family=<Nome+Com+Mais>:wght@400;700&…&display=swap`, nomes únicos na ordem texto → títulos.
  - `temModoEscuro(tema): boolean`

- [ ] **Step 1: testes**
  - Hortitex claro: `--background` `#f7f1e3`, `--primary` `#1f4d2e`, `--card` `#fbf7ee`, `--accent` `#ebe0c8`, `--chart-3` `#b83a24`, `--sidebar-border` `#f7f1e31a`.
  - herança: tema mínimo (só obrigatórios) → `--card` = `fundo`, `--ring` = `primaria`, `--app-header-background` = `fundo`, `--app-header-foreground` = `texto`, `--muted-foreground` = `PADRAO_CLARO["--muted-foreground"]`, `--secondary` = `tomDestaque(fundo, 4)`.
  - `cabecalho` sem `textoCabecalho` → `--app-header-foreground` = `corDeTextoContrastante(cabecalho)`.
  - sem `escuro`: `variaveisDoTema(t).escuro` = `null`; `cssDoTema(t)` não contém `-dark`.
  - `cssDoTema(hortitex)`: contém `html[class]{`, `html[class*="-dark"]{`, `font-family:"Calibri", Carlito, system-ui, sans-serif`, `--radius:12px`; toda declaração `--x:` tem `--x` em `NOMES_PERMITIDOS`.
  - `urlGoogleFonts(hortitex)` = `https://fonts.googleapis.com/css2?family=Carlito:wght@400;700&family=Caladea:wght@400;700&display=swap`; tema sem `google` → `null`.
- [ ] **Step 2:** `npx vitest run src/lib/tema/css.test.ts` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** commit `feat(tema): variáveis CSS e fontes do tema`.

### Task 3: Material de apoio (schema publicado, modelo para IA, README)

**Files:**
- Create: `scripts/gerar-schema-tema.ts` (escreve `public/temas/nx-tema.schema.json` com `JSON.stringify(z.toJSONSchema(temaSchema), null, 2) + "\n"`); `package.json` script `"tema:schema": "tsx scripts/gerar-schema-tema.ts"`
- Create: `public/temas/nx-tema.schema.json` (gerado), `public/temas/modelo-pedido-ia.md`, `docs/temas/README.md`
- Test: `src/lib/tema/material.test.ts`

`modelo-pedido-ia.md`: instrução para a IA devolver **só** o JSON `nx-tema` v1; lista dos papéis com o significado de cada um (tabela do spec, sem as variáveis CSS); regras: `#RRGGBB`, nenhum campo extra, `escuro` opcional, fontes só do Google Fonts pelo nome + pilha com alternativas, `raio` em px até 32; regra de contraste 4,5:1 nos pares essenciais e secundários, com a lista dos pares; o exemplo Hortitex completo no fim. `docs/temas/README.md`: o que é, onde importar (Empresas → Tema e marca), passo a passo com IA, como regerar o schema (`npm run tema:schema`), links para os arquivos de `public/temas/`.

- [ ] **Step 1: teste** `material.test.ts`: o conteúdo de `public/temas/nx-tema.schema.json` é igual a `JSON.stringify(z.toJSONSchema(temaSchema), null, 2) + "\n"`; `modelo-pedido-ia.md` contém `"nx-tema"` e `4,5:1`.
- [ ] **Step 2:** → FAIL; criar script, rodar `npx tsx scripts/gerar-schema-tema.ts`, escrever os dois `.md`; → PASS.
- [ ] **Step 3:** commit `docs(tema): schema publicado, modelo para IA e README`.

### Task 4: Banco e serviço do tema

**Files:**
- Modify: `prisma/schema.prisma` (`Empresa`: `tema Json?`, `logoEscuroUrl String?`, `faviconUrl String?`) + migration `tema_empresa` (depois `npx prisma generate`)
- Modify: `src/server/services/empresa.ts` — generalizar `processarLogo` para `processarImagemEmpresa(empresaId, urlAtual, arquivo, remover, tipo: "logo" | "logo-escuro" | "favicon")` (favicon aceita `image/png`, `image/svg+xml`, `image/x-icon`, `image/vnd.microsoft.icon`); `atualizarEmpresa` continua igual por fora
- Create: `src/server/services/temaEmpresa.ts`
- Test: `src/server/services/temaEmpresa.test.ts` (mock de `@vercel/blob` como `empresa.test.ts`; empresa criada com `criarEmpresa`)

**Interfaces:**
- Consumes: `validarTema` (Task 1).
- Produces:
  - `MSG_CONFIRMAR_AVISOS = "O tema tem avisos de contraste: confirme para aplicar"`
  - `analisarTexto(texto: string): ReturnType<typeof validarTema>` — `JSON.parse` em try; falha → `{ ok: false, erros: ["JSON inválido: <mensagem>"] }`.
  - `importarTema(sessao, empresaId: string, texto: string, confirmarAvisos: boolean): Promise<{ avisos: string[] }>` — erros → `throw new Error(erros.join("\n"))`; avisos sem confirmação → `throw new Error(MSG_CONFIRMAR_AVISOS)`; grava `tema` normalizado; audita `IMPORTAR_TEMA` (`anterior: { tema }`, `novo: { tema }`).
  - `restaurarTemaPadrao(sessao, empresaId): Promise<void>` — `tema = Prisma.DbNull`; audita `RESTAURAR_TEMA`.
  - `atualizarMarca(sessao, empresaId, arquivos: { logoEscuro: File | null; favicon: File | null; removerLogoEscuro: boolean; removerFavicon: boolean }): Promise<void>` — audita `ATUALIZAR_MARCA`.
  - `temaAplicavel(valor: Prisma.JsonValue | null): Tema | null` — `validarTema`; inválido → `console.warn` e `null`.
  - Todas: `requirePermission(sessao.perfil, "empresa:gerenciar")`; empresa inexistente → `"Empresa não encontrada"`.

- [ ] **Step 1: testes**
  - importar Hortitex grava (`empresa.tema.nome === "Hortitex"`) e audita `IMPORTAR_TEMA`.
  - tema com aviso: sem confirmar → rejeita `MSG_CONFIRMAR_AVISOS` e não grava; confirmando → grava e devolve `avisos.length > 0`.
  - texto `"{ nao é json"` → rejeita com mensagem começando por `JSON inválido`.
  - tema com erro → rejeita contendo o caminho; nada gravado.
  - restaurar → `tema` nulo, auditoria `RESTAURAR_TEMA`; logos intactos.
  - perfis `FINANCEIRO`, `GESTOR` → `PermissionError`; empresa `"inexistente"` → `"Empresa não encontrada"`.
  - `temaAplicavel({ formato: "nx-tema", versao: 99 })` → `null`; `temaAplicavel(hortitex)` → tema.
  - `atualizarMarca` com favicon PNG grava `faviconUrl` (URL do mock); favicon `text/plain` → erro de formato.
- [ ] **Step 2:** `npx vitest run src/server/services/temaEmpresa.test.ts src/server/services/empresa.test.ts` → FAIL.
- [ ] **Step 3:** migration + implementação.
- [ ] **Step 4:** → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** commit `feat(tema): tema e marca gravados na empresa`.

### Task 5: Aplicação no painel

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx` (style, links de fonte, `generateMetadata` com favicon, logo, modo do seletor)
- Modify: `src/app/(dashboard)/theme-toggle.tsx` (prop `modo`)
- Modify: `src/app/(dashboard)/sidebar.tsx` (sem mudança de props: o layout passa o `logoUrl` escolhido)
- Create: `src/app/(dashboard)/tema-empresa.tsx` — `TemaEmpresaHead({ tema }: { tema: Tema })` renderiza `<link rel="preconnect" href="https://fonts.googleapis.com">`, `<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="">`, `<link rel="stylesheet" href={urlGoogleFonts}>` (se houver) e `<style>{cssDoTema(tema)}</style>` (React 19 eleva `<link>`/`<style>` com `precedence`; usar `precedence="tema-empresa"` e `href` no `<style>`; conferir na doc do Next em `node_modules/next/dist/docs/`)
- Test: `src/app/(dashboard)/tema-empresa.test.ts` para a função pura `logoDaSidebar`

**Interfaces:**
- Consumes: `temaAplicavel` (Task 4); `cssDoTema`, `urlGoogleFonts`, `temModoEscuro`, `variaveisDoTema` (Task 2).
- Produces: `logoDaSidebar({ tema, logoUrl, logoEscuroUrl, corPrimaria }): string | null` (em `tema-empresa.tsx` ou `src/lib/tema/logo.ts`) — cor da sidebar = `variaveisDoTema(tema).claro["--sidebar"]` (com tema) ou `corPrimaria`; se `corDeTextoContrastante(cor) === "#ffffff"` → `logoEscuroUrl ?? logoUrl`, senão `logoUrl`; sem cor → `logoUrl`.
- `ThemeToggle({ modo }: { modo: "livre" | "claro-escuro" | "so-claro" })`: `so-claro` → `null`; `claro-escuro` → só o grupo "Aparência" (Claro = `theme-a`, Escuro = `theme-a-dark`); `livre` → como hoje.

No layout: com tema aplicável, `estiloSidebar` = `undefined` (o tema já define a sidebar) e o seletor recebe `temModoEscuro(tema) ? "claro-escuro" : "so-claro"`. `generateMetadata`: busca a empresa da sessão e devolve `{ icons: { icon: faviconUrl } }` quando houver.

- [ ] **Step 1: testes** de `logoDaSidebar`: Hortitex (sidebar verde-escura) → `logoEscuroUrl`; sem `logoEscuroUrl` → `logoUrl`; tema com sidebar clara (`#f7f1e3`) → `logoUrl`; sem tema e sem `corPrimaria` → `logoUrl`.
- [ ] **Step 2:** → FAIL; implementar; → PASS; `npx tsc --noEmit` e `npx eslint "src/app/(dashboard)"` limpos.
- [ ] **Step 3:** commit `feat(tema): tema da empresa aplicado no painel`.

### Task 6: Tela Tema e marca

**Files:**
- Modify: `src/app/(dashboard)/empresas/page.tsx` (botão "Tema e marca" → `/empresas/${id}/tema`)
- Create: `src/app/(dashboard)/empresas/[id]/tema/page.tsx`, `actions.ts`, `importar-tema-form.tsx` (client), `previa-tema.tsx`, `marca-form.tsx` (client), `exportar/route.ts`

**Interfaces:**
- Consumes: Task 4 (`analisarTexto`, `importarTema`, `restaurarTemaPadrao`, `atualizarMarca`), Task 2 (`variaveisDoTema`, `urlGoogleFonts`).
- Actions (todas `requireSessaoAtiva`, erros como `{ erro }`):
  - `validarTemaAction(prev, formData)` → `{ erros?: string[]; avisos?: string[]; texto?: string; previa?: { claro: Record<string,string>; escuro: Record<string,string> | null; fontes: { texto?: string; titulos?: string; url: string | null } } }` (lê `arquivo` File ou `texto`; não grava).
  - `aplicarTemaAction(prev, formData)` (`texto`, `confirmarAvisos`) → `importarTema`; `revalidatePath("/", "layout")`.
  - `restaurarTemaAction`, `atualizarMarcaAction` — idem.
- `exportar/route.ts`: GET, 403 sem `empresa:gerenciar`, 404 sem tema; `Content-Disposition: attachment; filename="tema-<nomeFantasia-sem-acentos>.json"`.
- `PreviaTema({ variaveis, fontes, logoUrl })`: um bloco com `style` = as variáveis (claro e escuro lado a lado) mostrando botão primário, texto, texto apagado, cartão, faixa da sidebar com logo e "Aa" nas duas fontes (carrega o `<link>` das fontes).

- [ ] **Step 1:** implementar a página: cabeçalho com o nome do tema atual ou "Padrão do sistema"; Exportar (link) e Restaurar padrão (diálogo de confirmação); formulário Importar (arquivo `.json` ou textarea) → Validar → erros em lista vermelha, avisos em lista âmbar com checkbox "Aplicar mesmo com os avisos", prévia, Aplicar; seção Marca (3 uploads com prévia e "remover"); links `/temas/nx-tema.schema.json`, `/temas/modelo-pedido-ia.md`, `/temas/hortitex.json` com `download`.
- [ ] **Step 2:** `npx tsc --noEmit`, `npx eslint "src/app/(dashboard)/empresas"` limpos; suíte `npx vitest run` → PASS.
- [ ] **Step 3:** commit `feat(tema): tela de tema e marca da empresa`.

### Task 7: Ajuda, fase e conferência no navegador

**Files:**
- Modify: `content/ajuda/passo-a-passo.md` (seção de Empresas: tema e marca, fluxo com IA), `docs/fases/fase-1-fundacao.md` (conclusão: identidade visual evoluída para tema por empresa, 2026-11-15), spec → "Status: implementada (2026-11-15)"

- [ ] **Step 1:** textos.
- [ ] **Step 2: navegador:** script temporário cria uma empresa de teste com acesso do admin; importar `public/temas/hortitex.json` pela tela; conferir claro e escuro (seletor só Claro/Escuro), um diálogo aberto com as cores da marca, fontes Caladea/Carlito carregadas (`document.fonts.check('16px Carlito')`), exportar baixa o JSON, restaurar volta ao padrão; empresa sem tema igual a antes; 390px sem rolagem horizontal. Limpar dados, apagar script e `.playwright-mcp/`.
- [ ] **Step 3:** suíte inteira `npx vitest run` → PASS.
- [ ] **Step 4:** commit `docs(tema): ajuda e registro da fase`.
