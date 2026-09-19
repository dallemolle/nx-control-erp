# Identidade visual por empresa (cor + logo)

## Contexto

Pedido do dono do produto: quando um usuário está logado numa empresa
específica, a interface deveria assumir uma cor predominante daquela
empresa e mostrar um logo pequeno — pra deixar claro visualmente qual
empresa está sendo movimentada, evitando erro operacional de quem tem
acesso a várias empresas.

Hoje existe um sistema de tema **pessoal**, não ligado à empresa: o
componente `ThemeToggle` (`src/app/(dashboard)/theme-toggle.tsx`) deixa
cada usuário escolher uma de 3 paletas fixas (`theme-a`/`theme-b`/`theme-c`)
× claro/escuro, persistidas via `next-themes` no `localStorage` do
navegador (chave `nx-tema`, ver `src/app/layout.tsx`). Cada paleta define
um conjunto fixo de CSS custom properties em `src/app/globals.css`
(`--sidebar`, `--sidebar-foreground`, `--sidebar-accent` etc.).

Decisão já confirmada com o usuário: a cor da empresa **sobrepõe** só a
cor de fundo da sidebar (o "predominante"), sem substituir a escolha
pessoal de paleta/claro-escuro — as duas coisas convivem. Contraste do
texto sobre essa cor é **calculado automaticamente** (sem campo manual
extra). Cor e logo são **opcionais por empresa**; nenhuma empresa
existente muda de aparência até o Administrador configurar. O logo
aparece pequeno no topo da sidebar, ao lado de "NX Control".

## Seção 1 — Dados

Dois campos novos em `Empresa` (`prisma/schema.prisma`), ambos opcionais:

```prisma
model Empresa {
  // ...campos existentes...
  corPrimaria  String?  // hex de 6 dígitos, ex.: "#0B2545" — cor de fundo da sidebar
  logoUrl      String?  // URL pública do blob no Vercel Blob
}
```

Migration hand-written (mesmo padrão já usado nesta sessão para o
rename `cnpj`→`cnpjCpf`): `ALTER TABLE "empresas" ADD COLUMN "corPrimaria" TEXT, ADD COLUMN "logoUrl" TEXT;` — sem `NOT NULL`, sem valor
default, então não há necessidade de backfill; todo registro existente
recebe `NULL` nas duas colunas automaticamente.

## Seção 2 — Cálculo de contraste (função pura)

Novo módulo `src/lib/corContraste.ts`:

```ts
/** Devolve preto ou branco — o que for mais legível sobre `corFundoHex`. Fórmula YIQ (percepção de brilho), limiar 128/255. */
export function corDeTextoContrastante(corFundoHex: string): "#000000" | "#ffffff" {
  const hex = corFundoHex.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000000" : "#ffffff";
}

/** Valida o formato #RRGGBB (hex de 6 dígitos, com #). */
export function corHexValida(valor: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(valor);
}
```

Testes puros em `src/lib/corContraste.test.ts`: preto (`#000000`) →
texto branco; branco (`#ffffff`) → texto preto; um tom escuro real
(`#0B2545`, o navy já usado hoje) → branco; um tom claro (`#F5D76E`) →
preto; `corHexValida` aceita `#0B2545`, rejeita `0B2545` (sem `#`),
`#fff` (3 dígitos), `#GGGGGG` (não-hex).

## Seção 3 — Schema e upload do logo

`src/lib/schemas/empresa.ts` ganha dois campos, ambos opcionais:

```ts
corPrimaria: z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || corHexValida(v), "Cor inválida"),
```

O logo **não** passa pelo Zod junto com o resto do formulário — mesma
separação já usada em `extratos/importar` (arquivo lido direto do
`FormData`, fora do schema). A action extrai `formData.get("logo")` como
`File | null` e `formData.get("removerLogo") === "true"` separadamente,
e repassa os dois pro service.

O checkbox "Usar cor personalizada" é quem decide se `corPrimaria` vale
alguma coisa, **não** o atributo `disabled` do `<input type="color">` —
um input desabilitado não é enviado no `FormData` pelo navegador, então
depender disso quebraria o fluxo. Em vez disso, a action normaliza os
dados brutos antes de validar:

```ts
const dadosBrutos = Object.fromEntries(formData);
if (dadosBrutos.usarCorPersonalizada !== "true") dadosBrutos.corPrimaria = "";
const parsed = empresaSchema.safeParse(dadosBrutos);
```

O input de cor fica sempre habilitado (só visualmente esmaecido via CSS
quando o checkbox está desmarcado, sem `disabled`); o checkbox é a
única fonte de verdade sobre se o valor deve ser considerado.

Upload em `src/server/services/empresa.ts`, reaproveitando `@vercel/blob`
(já usado por `anexo.ts`) — mas **público**, diferente dos anexos: um
logo de empresa não é dado sensível, então evita replicar a rota privada
autenticada de proxy.

```ts
export const TAMANHO_MAXIMO_LOGO_BYTES = 1 * 1024 * 1024; // 1MB
const TIPOS_LOGO_ACEITOS = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

async function processarLogo(
  empresaId: string,
  logoUrlAtual: string | null,
  arquivo: File | null,
  removerLogo: boolean,
): Promise<string | null | undefined> {
  // undefined = não mexe no campo; null = limpa; string = nova url
  if (arquivo && arquivo.size > 0) {
    if (arquivo.size > TAMANHO_MAXIMO_LOGO_BYTES) {
      throw new Error(`Logo maior que o limite de ${TAMANHO_MAXIMO_LOGO_BYTES / (1024 * 1024)} MB`);
    }
    if (!TIPOS_LOGO_ACEITOS.includes(arquivo.type)) {
      throw new Error("Formato de logo não aceito — use PNG, JPG, SVG ou WebP");
    }
    if (logoUrlAtual) await del(logoUrlAtual).catch(() => {});
    const blob = await put(`empresas/${empresaId}/logo-${Date.now()}`, arquivo, {
      access: "public",
    });
    return blob.url;
  }
  if (removerLogo && logoUrlAtual) {
    await del(logoUrlAtual).catch(() => {});
    return null;
  }
  return undefined;
}
```

(`Date.now()` no nome do arquivo em vez de `allowOverwrite` — evita
problema de cache de CDN servindo a imagem antiga sob a mesma URL depois
de trocar o logo; o blob anterior é apagado explicitamente antes.)

`criarEmpresa`/`atualizarEmpresa` chamam `processarLogo` antes do
`prisma.empresa.create`/`update`, e só incluem `logoUrl` no `data` do
Prisma quando o retorno não é `undefined` (spread condicional). O campo
`corPrimaria` do Zod (já `null`/string) vai direto no `data`, igual aos
demais campos hoje.

## Seção 4 — Aplicação visual

`src/app/(dashboard)/layout.tsx` (server component, já busca `empresa`
hoje) calcula o estilo antes de renderizar:

```ts
const estiloSidebar: React.CSSProperties | undefined = empresa.corPrimaria
  ? ({
      "--sidebar": empresa.corPrimaria,
      "--sidebar-foreground": corDeTextoContrastante(empresa.corPrimaria),
    } as React.CSSProperties)
  : undefined;
```

`<Sidebar perfil={sessao.perfil} versaoInfo={versaoInfo} estilo={estiloSidebar} logoUrl={empresa.logoUrl} />`.

`Sidebar` (`src/app/(dashboard)/sidebar.tsx`) aplica `style={estilo}` na
`<nav>` raiz — sobrescreve só `--sidebar`/`--sidebar-foreground` via CSS
custom property em cascata; tudo mais (bordas, `--sidebar-accent` do
hover/item ativo, claro/escuro) continua vindo da paleta pessoal
escolhida via `next-themes`, sem conflito. Sem `corPrimaria`, `estilo`
é `undefined` e nada muda.

No topo da sidebar, ao lado do texto "NX Control": se `logoUrl` existir,
uma `<img>` pequena (ex. `h-6 w-6 rounded object-contain`); sem
`logoUrl`, nada aparece ali (layout igual ao de hoje).

**Limitação aceita conscientemente**: `--sidebar-accent` (cor do
hover/item ativo do menu) não é recalculado a partir da cor da empresa —
continua vindo da paleta pessoal. Nas paletas A (navy), esse valor é um
overlay translúcido (`#ffffff1f`) que se adapta visualmente a qualquer
cor de fundo por baixo; nas paletas B/C (claras), é uma cor sólida fixa,
então o hover pode destoar levemente da cor da empresa quando o usuário
tem uma dessas paletas selecionada. Não compromete legibilidade — é uma
melhoria possível pra uma iteração futura, não bloqueante pra esta.

## Seção 5 — UI de cadastro

`src/app/(dashboard)/empresas/empresa-dialog-form.tsx` ganha dois campos
novos, depois de "Moeda padrão":

- **Cor personalizada**: um checkbox "Usar cor personalizada nesta
  empresa" (`name="usarCorPersonalizada"`, `value="true"`) ao lado do
  `<input type="color" name="corPrimaria">` — desmarcado, a action
  ignora o valor do input (ver Seção 3, normalização antes do
  `safeParse`). Editando uma empresa que já tem `corPrimaria`, o
  checkbox começa marcado e o input pré-preenchido.
- **Logo**: `<input type="file" name="logo" accept="image/png,image/jpeg,image/svg+xml,image/webp">`.
  Editando uma empresa que já tem `logoUrl`, mostra uma prévia pequena
  da imagem atual + um checkbox "Remover logo atual" (`name="removerLogo"`,
  `value="true"`) — selecionar um arquivo novo tem prioridade sobre esse
  checkbox (a action já resolve essa precedência: `arquivo` truthy vence
  antes de checar `removerLogo`).

`src/app/(dashboard)/empresas/actions.ts`: as duas actions passam a
extrair `logo`/`removerLogo` do `FormData` direto (fora do
`empresaSchema.safeParse`) e repassar pro service.

## Seção 6 — Testes de integração

Em `src/server/services/empresa.test.ts` (arquivo já existe, mais
casos):
- `criarEmpresa`/`atualizarEmpresa` sem `corPrimaria`/logo: `null` nos
  dois campos, comportamento idêntico ao de hoje.
- `atualizarEmpresa` com `corPrimaria` válida: persiste o hex.
- `atualizarEmpresa` com `corPrimaria` inválida (schema): erro antes de
  chegar no service (testado na camada do schema, não do service).
- Upload de logo: usa um mock de `@vercel/blob` (`vi.mock("@vercel/blob")`,
  mesmo padrão de `anexo.test.ts`) — `put` retorna uma URL fake,
  `atualizarEmpresa` grava essa URL em `logoUrl`.
- Trocar o logo existente: `del` é chamado com a URL antiga antes do
  `put` da nova.
- `removerLogo: true` sem novo arquivo: `logoUrl` vira `null`, `del`
  chamado com a URL antiga.
- Arquivo maior que 1MB ou tipo não aceito: lança erro, `logoUrl` não
  muda.

Verificação visual (Playwright, fora da suíte automatizada, mesmo
padrão já usado nesta sessão): cadastrar uma empresa com cor clara e
outra com cor escura, conferir que o texto da sidebar fica legível nas
duas, e que o logo aparece no topo quando configurado.

## Arquivos afetados (resumo)

- `prisma/schema.prisma` (editar — 2 campos novos em `Empresa`).
- `prisma/migrations/<timestamp>_add_identidade_visual_empresa/migration.sql` (novo).
- `src/lib/corContraste.ts` (novo).
- `src/lib/corContraste.test.ts` (novo).
- `src/lib/schemas/empresa.ts` (editar — campo `corPrimaria`).
- `src/server/services/empresa.ts` (editar — `processarLogo` + uso em
  `criarEmpresa`/`atualizarEmpresa`).
- `src/server/services/empresa.test.ts` (editar — casos novos).
- `src/app/(dashboard)/empresas/actions.ts` (editar — extrair
  `logo`/`removerLogo` do `FormData`).
- `src/app/(dashboard)/empresas/empresa-dialog-form.tsx` (editar —
  campos de cor e logo).
- `src/app/(dashboard)/layout.tsx` (editar — calcular `estiloSidebar`).
- `src/app/(dashboard)/sidebar.tsx` (editar — prop `estilo` + `logoUrl`,
  `<img>` condicional no topo).
