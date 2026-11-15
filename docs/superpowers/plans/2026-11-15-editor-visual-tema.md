# Editor visual do tema — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** editar o tema da empresa na tela `/empresas/[id]/tema` com seletores por papel, fontes, raio e prévia ao vivo, validando no navegador e salvando pelo `importarTema` que já existe.

**Architecture:** toda a lógica fica em funções puras de `src/lib/tema/` (tema padrão em `nx-tema`, pares de contraste compartilhados com `validarTema`, reducer do editor), testadas com Vitest em ambiente node. Os componentes cliente em `src/app/(dashboard)/empresas/[id]/tema/` só despacham ações para o reducer e desenham o estado. Salvar chama o `aplicarTemaAction` existente (valida de novo no servidor, grava, audita `IMPORTAR_TEMA`, revalida o layout).

**Tech Stack:** Next.js 16 App Router (ler `node_modules/next/dist/docs/` antes de usar APIs de navegação/actions), React 19 (`useReducer`, `useTransition`), Zod 4, Vitest (rodar pelo **PowerShell**), componentes `@/components/ui` (Base UI), Playwright MCP para a conferência no navegador.

**Spec:** [docs/superpowers/specs/2026-11-15-editor-visual-tema-design.md](../specs/2026-11-15-editor-visual-tema-design.md)

## Global Constraints

- **Sem mudança de banco, de formato `nx-tema` nem do serviço `temaEmpresa`** (exceto mover `analisarTexto` para `src/lib/tema/validar.ts`, mantendo a reexportação).
- O tema padrão do sistema (`globals.css`) **não muda**; empresa sem tema continua igual a antes.
- Cores só `#RRGGBB` em minúsculas; contraste mínimo 4,5:1; essenciais bloqueiam o Salvar, secundários só avisam (mesmas regras de `validarTema`).
- Gerenciar tema exige `empresa:gerenciar` (já garantido pela página e por `importarTema`).
- Textos da interface em português, sem jargão ("Automático (herda de Fundo)", não "fallback").
- Layout sem rolagem horizontal em 390px.
- **Não rodar prettier em arquivos existentes**; formatar à mão (linhas até ~120). Não reescrever arquivos com `Get-Content | Set-Content` (corrompe acentos).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisões de implementação (ajustes à spec, registrar na spec ao final)

1. **Salvar reaproveita `aplicarTemaAction`** (`empresaId`, `texto`, `confirmarAvisos`); não se cria `salvarTemaAction`. O editor chama a action direto (`await aplicarTemaAction({}, formData)`) dentro de `startTransition`.
2. **Exportar é feito no cliente** a partir do estado do editor (`Blob` + link temporário). A rota `empresas/[id]/tema/exportar/route.ts` é removida.
3. **`paresDeContraste` fica em `validar.ts`** e o próprio `validarTema` passa a usá-lo: editor e servidor usam o mesmo cálculo, sem lista duplicada.
4. **`analisarTexto` vai para `src/lib/tema/validar.ts`** (o serviço importa um módulo com Prisma, que não pode ir para o cliente); `temaEmpresa.ts` reexporta.
5. `validarTemaAction`, `EstadoValidacao`, `importar-tema-form.tsx` e `RestaurarTemaForm` deixam de ser usados e são removidos.
6. Grupos recolhíveis com `<details>`/`<summary>` nativos (o `Accordion` do projeto tem estilo de sidebar).

## Review Focus

1. Selo de contraste e resumo de erros nunca discordam do servidor → os dois usam `paresDeContraste`/`validarTema` (Task 2).
2. Desmarcar "Automático" num papel opcional e marcar de novo → o papel some do JSON (não fica com valor) (Task 3).
3. Alterações não salvas detectadas mesmo quando a ordem das chaves muda → `temasIguais` com chaves ordenadas (Task 3).
4. Nome de fonte inválido sendo digitado → a prévia não monta URL do Google com caracteres inválidos (Task 3, `urlFontesDaPrevia`).
5. Tema gravado inválido → editor abre no padrão com aviso, sem erro na página (Task 3 e Task 5).

---

### Task 1: Tema padrão do sistema em `nx-tema`

**Files:**
- Create: `src/lib/tema/padrao.ts`
- Test: `src/lib/tema/padrao.test.ts`

**Interfaces:**
- Consumes: `Tema` (`src/lib/tema/schema.ts`), `validarTema` (`src/lib/tema/validar.ts`)
- Produces: `TEMA_PADRAO: Tema` (nome `"Padrão do sistema"`, claro e escuro, sem fontes e sem raio)

Valores tirados de `src/app/globals.css` (`.theme-a` e `.theme-a-dark`). Conversões de `oklch` acromático para hex: `oklch(1 0 0)` = `#ffffff`, `oklch(0.145 0 0)` = `#0a0a0a`, `oklch(0.97 0 0)` = `#f5f5f5`. Papéis cujo padrão tem cor saturada em `oklch` ou transparência (`borda`, `textoApagado` e `erro` do claro; `borda` e `erro` do escuro) ficam **ausentes** = "Automático" (padrão do sistema).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { TEMA_PADRAO } from "./padrao";
import { validarTema } from "./validar";

describe("TEMA_PADRAO", () => {
  test("passa na validação sem erros nem avisos", () => {
    expect(validarTema(TEMA_PADRAO)).toMatchObject({ ok: true, avisos: [] });
  });

  test("tem claro e escuro e deixa no automático o que não cabe em #RRGGBB", () => {
    expect(TEMA_PADRAO.cores.escuro).toBeDefined();
    expect(TEMA_PADRAO.cores.claro.borda).toBeUndefined();
    expect(TEMA_PADRAO.cores.claro.erro).toBeUndefined();
    expect(TEMA_PADRAO.cores.escuro?.borda).toBeUndefined();
    expect(TEMA_PADRAO.fontes).toBeUndefined();
    expect(TEMA_PADRAO.raio).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tema/padrao.test.ts`
Expected: FAIL (`Cannot find module './padrao'`)

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Tema } from "./schema";

/**
 * Padrão do sistema (globals.css, `.theme-a` e `.theme-a-dark`) no formato `nx-tema`, ponto de partida do
 * editor. oklch acromático convertido: oklch(1 0 0) = #ffffff, oklch(0.145 0 0) = #0a0a0a,
 * oklch(0.97 0 0) = #f5f5f5. Borda, texto apagado e erro com oklch saturado ou transparência ficam de fora
 * (no editor: "Automático", que é o padrão do sistema).
 */
export const TEMA_PADRAO: Tema = {
  formato: "nx-tema",
  versao: 1,
  nome: "Padrão do sistema",
  cores: {
    claro: {
      fundo: "#ffffff",
      texto: "#0a0a0a",
      primaria: "#0b2545",
      textoSobrePrimaria: "#ffffff",
      sidebar: "#0b2545",
      textoSobreSidebar: "#ffffff",
      cartao: "#ffffff",
      apoio: "#f5f5f5",
      textoSobreApoio: "#0b2545",
      destaque: "#f5f5f5",
      textoSobreDestaque: "#0b2545",
      foco: "#6fa8dc",
      cabecalho: "#ffffff",
      textoCabecalho: "#0a0a0a",
      graficos: ["#bfd9ef", "#8fbee0", "#6fa8dc", "#3d5a78", "#0b2545"],
    },
    escuro: {
      fundo: "#10151d",
      texto: "#f2f5f8",
      primaria: "#6fa8dc",
      textoSobrePrimaria: "#0b2545",
      sidebar: "#060f1d",
      textoSobreSidebar: "#f2f5f8",
      cartao: "#161d27",
      apoio: "#1e2733",
      textoSobreApoio: "#f2f5f8",
      textoApagado: "#93a3b8",
      destaque: "#1e2733",
      textoSobreDestaque: "#f2f5f8",
      foco: "#6fa8dc",
      cabecalho: "#161d27",
      textoCabecalho: "#f2f5f8",
      graficos: ["#6fa8dc", "#8fbee0", "#bfd9ef", "#3d5a78", "#1b3a5c"],
    },
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tema/padrao.test.ts`
Expected: PASS (2 testes). Se algum par de contraste falhar, **não** troque a cor do padrão: confira a conversão com o valor de `globals.css` e informe.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/tema/padrao.ts src/lib/tema/padrao.test.ts
git commit -m @'
feat(tema): tema padrão do sistema no formato nx-tema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 2: Pares de contraste compartilhados e `analisarTexto` no cliente

**Files:**
- Modify: `src/lib/tema/validar.ts` (todo o arquivo, ~66 linhas)
- Modify: `src/server/services/temaEmpresa.ts:1-19` (remove a função local, importa e reexporta)
- Test: `src/lib/tema/validar.test.ts` (acrescentar ao final)

**Interfaces:**
- Consumes: `contraste`, `CONTRASTE_MINIMO` (`./contraste`); `temaSchema`, `CoresModo`, `Tema` (`./schema`)
- Produces:
  - `type PapelCor = keyof Omit<CoresModo, "graficos">`
  - `type ParContraste = { texto: PapelCor; fundo: PapelCor; razao: number; nivel: "essencial" | "secundario"; ok: boolean }`
  - `paresDeContraste(cores: CoresModo): ParContraste[]` (herança de cabeçalho aplicada; pares com um lado ausente não aparecem)
  - `mensagemContraste(modo: string, par: ParContraste): string`
  - `analisarTexto(texto: string): ResultadoValidacao` (agora em `validar.ts`)
  - `validarTema` com o mesmo comportamento de antes

- [ ] **Step 1: Write the failing tests** (acrescentar em `validar.test.ts`; ajustar o import do topo para `import { analisarTexto, paresDeContraste, validarTema } from "./validar";`)

```ts
describe("paresDeContraste", () => {
  test("lista essenciais e secundários com razão e situação", () => {
    const pares = paresDeContraste({ ...hortitex().cores.claro, texto: "#777777", fundo: "#888888" });
    const textoFundo = pares.find((p) => p.texto === "texto" && p.fundo === "fundo");
    expect(textoFundo).toMatchObject({ nivel: "essencial", ok: false });
    expect(textoFundo!.razao).toBeLessThan(4.5);
    expect(pares.find((p) => p.texto === "textoApagado")).toMatchObject({ nivel: "secundario" });
  });

  test("cabeçalho ausente herda fundo e texto", () => {
    const { cabecalho: _c, textoCabecalho: _t, ...cores } = hortitex().cores.claro;
    const par = paresDeContraste(cores).find((p) => p.texto === "textoCabecalho");
    expect(par).toMatchObject({ fundo: "cabecalho", ok: true });
  });

  test("concorda com validarTema: essencial ruim vira erro, secundário ruim vira aviso", () => {
    const ruim = com((t) => (t.cores.claro.textoSobrePrimaria = t.cores.claro.primaria));
    const r = validarTema(ruim);
    expect(r.ok).toBe(false);
    const falhas = paresDeContraste(ruim.cores.claro).filter((p) => p.nivel === "essencial" && !p.ok);
    expect(falhas.map((p) => p.texto)).toEqual(["textoSobrePrimaria"]);
  });
});

describe("analisarTexto", () => {
  test("texto que não é JSON vira erro, não exceção", () => {
    const r = analisarTexto("{ não é json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros[0]).toContain("JSON inválido");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tema/validar.test.ts`
Expected: FAIL (`paresDeContraste`/`analisarTexto` não exportados)

- [ ] **Step 3: Write implementation** (substituir `validar.ts` inteiro)

```ts
import { z } from "zod";
import { contraste, CONTRASTE_MINIMO } from "./contraste";
import { temaSchema, type CoresModo, type Tema } from "./schema";

export type ResultadoValidacao = { ok: true; tema: Tema; avisos: string[] } | { ok: false; erros: string[] };

export type PapelCor = keyof Omit<CoresModo, "graficos">;

export type ParContraste = {
  texto: PapelCor;
  fundo: PapelCor;
  razao: number;
  nivel: "essencial" | "secundario";
  ok: boolean;
};

/** Pares texto/fundo que bloqueiam a importação abaixo do mínimo. */
const ESSENCIAIS: [PapelCor, PapelCor][] = [
  ["texto", "fundo"],
  ["textoSobrePrimaria", "primaria"],
  ["textoSobreSidebar", "sidebar"],
  ["textoCabecalho", "cabecalho"],
];

/** Pares que só geram aviso. */
const SECUNDARIOS: [PapelCor, PapelCor][] = [
  ["textoApagado", "fundo"],
  ["texto", "cartao"],
  ["textoSobreApoio", "apoio"],
  ["textoSobreDestaque", "destaque"],
  ["erro", "fundo"],
];

const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Cabeçalho herda do fundo e o texto do cabeçalho herda do texto, como na aplicação. */
function comHeranca(cores: CoresModo): Partial<Record<PapelCor, string>> {
  return {
    ...cores,
    cabecalho: cores.cabecalho ?? cores.fundo,
    textoCabecalho: cores.textoCabecalho ?? (cores.cabecalho ? undefined : cores.texto),
  };
}

/** Contraste de cada par (essenciais primeiro); pares com um dos lados ausente ficam de fora. */
export function paresDeContraste(cores: CoresModo): ParContraste[] {
  const c = comHeranca(cores);
  const avaliar = (pares: [PapelCor, PapelCor][], nivel: ParContraste["nivel"]): ParContraste[] =>
    pares.flatMap(([texto, fundo]) => {
      const corTexto = c[texto];
      const corFundo = c[fundo];
      if (!corTexto || !corFundo) return [];
      const razao = contraste(corTexto, corFundo);
      return [{ texto, fundo, razao, nivel, ok: razao >= CONTRASTE_MINIMO }];
    });
  return [...avaliar(ESSENCIAIS, "essencial"), ...avaliar(SECUNDARIOS, "secundario")];
}

export function mensagemContraste(modo: string, par: ParContraste): string {
  return `cores.${modo}.${par.texto} sobre ${par.fundo}: contraste ${DECIMAL.format(par.razao)}:1 (mínimo ${DECIMAL.format(CONTRASTE_MINIMO)}:1)`;
}

function falhas(modo: string, cores: CoresModo, nivel: ParContraste["nivel"]): string[] {
  return paresDeContraste(cores)
    .filter((par) => par.nivel === nivel && !par.ok)
    .map((par) => mensagemContraste(modo, par));
}

/** Valida um tema `nx-tema` v1: formato (Zod) e contraste (WCAG). */
export function validarTema(entrada: unknown): ResultadoValidacao {
  const resultado = temaSchema.safeParse(entrada, { error: z.locales.pt().localeError });
  if (!resultado.success) {
    return {
      ok: false,
      erros: resultado.error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`),
    };
  }
  const tema = resultado.data;
  const modos = Object.entries(tema.cores).filter((par): par is [string, CoresModo] => par[1] !== undefined);
  const erros = modos.flatMap(([modo, cores]) => falhas(modo, cores, "essencial"));
  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, tema, avisos: modos.flatMap(([modo, cores]) => falhas(modo, cores, "secundario")) };
}

/** JSON colado ou enviado → validação; texto que não é JSON vira erro, não exceção. */
export function analisarTexto(texto: string): ResultadoValidacao {
  try {
    return validarTema(JSON.parse(texto));
  } catch (erro) {
    return { ok: false, erros: [`JSON inválido: ${erro instanceof Error ? erro.message : String(erro)}`] };
  }
}
```

Em `src/server/services/temaEmpresa.ts`, trocar as linhas 7 e 12–19 por:

```ts
import { analisarTexto, validarTema } from "@/lib/tema/validar";
```

e, logo abaixo de `MSG_CONFIRMAR_AVISOS`:

```ts
export { analisarTexto };
```

(o import de `ResultadoValidacao` deixa de ser usado; remova-o.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/tema src/server/services/temaEmpresa.test.ts`
Expected: PASS em todos (os testes antigos de mensagens continuam valendo)

- [ ] **Step 5: Commit**

```powershell
git add src/lib/tema/validar.ts src/lib/tema/validar.test.ts src/server/services/temaEmpresa.ts
git commit -m @'
refactor(tema): pares de contraste compartilhados e análise do JSON no cliente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 3: Estado do editor (funções puras e reducer)

**Files:**
- Create: `src/lib/tema/editor.ts`
- Test: `src/lib/tema/editor.test.ts`

**Interfaces:**
- Consumes: `TEMA_PADRAO` (Task 1); `validarTema`, `paresDeContraste`, `mensagemContraste`, `PapelCor`, `ParContraste` (Task 2); `PAPEIS_OBRIGATORIOS`, `Tema`, `CoresModo` (`schema.ts`); `variaveisDoTema`, `urlGoogleFonts` (`css.ts`)
- Produces:
  - `type Modo = "claro" | "escuro"`
  - `type FonteTema = NonNullable<NonNullable<Tema["fontes"]>["texto"]>`
  - `type TipoFonte = "sans" | "serif"`
  - `type EstadoEditor = { tema: Tema; salvo: Tema; modo: Modo }`
  - `type AcaoEditor` (ver código)
  - `temaInicial(temaSalvo: unknown, nomeEmpresa: string): { tema: Tema; aviso: string | null }`
  - `estadoInicial(tema: Tema): EstadoEditor`
  - `reduzirEditor(estado: EstadoEditor, acao: AcaoEditor): EstadoEditor`
  - `pilhaDaFonte(google: string, tipo: TipoFonte): string`, `tipoDaPilha(pilha: string): TipoFonte`
  - `valorEfetivo(tema: Tema, modo: Modo, papel: PapelCor): string` (cor em uso, para iniciar o seletor ao sair do automático)
  - `graficosEfetivos(tema: Tema, modo: Modo): string[]`
  - `diagnostico(tema: Tema): { erros: string[]; avisos: string[] }`
  - `paresDoModo(tema: Tema, modo: Modo): ParContraste[]`
  - `temasIguais(a: Tema, b: Tema): boolean`
  - `urlFontesDaPrevia(tema: Tema): string | null`
  - `nomeArquivoTema(nomeEmpresa: string): string` (ex.: `"tema-hortitex.json"`)
  - `ROTULOS: Record<PapelCor, string>`, `HERANCA: Partial<Record<PapelCor, string>>`

- [ ] **Step 1: Write the failing tests**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  diagnostico,
  estadoInicial,
  nomeArquivoTema,
  pilhaDaFonte,
  reduzirEditor,
  temaInicial,
  temasIguais,
  tipoDaPilha,
  urlFontesDaPrevia,
  valorEfetivo,
  type AcaoEditor,
  type EstadoEditor,
} from "./editor";
import { TEMA_PADRAO } from "./padrao";
import { temaSchema, type Tema } from "./schema";
import { validarTema } from "./validar";

const hortitex = (): Tema => temaSchema.parse(JSON.parse(readFileSync("public/temas/hortitex.json", "utf8")));
const aplicar = (estado: EstadoEditor, ...acoes: AcaoEditor[]) => acoes.reduce(reduzirEditor, estado);

describe("temaInicial", () => {
  test("usa o tema salvo válido", () => {
    expect(temaInicial(hortitex(), "X")).toEqual({ tema: hortitex(), aviso: null });
  });

  test("sem tema: padrão do sistema com o nome da empresa", () => {
    const { tema, aviso } = temaInicial(null, "Hortitex");
    expect(aviso).toBeNull();
    expect(tema.nome).toBe("Hortitex");
    expect(tema.cores).toEqual(TEMA_PADRAO.cores);
  });

  test("tema salvo inválido: padrão com aviso", () => {
    const { tema, aviso } = temaInicial({ formato: "outro" }, "X");
    expect(tema.cores).toEqual(TEMA_PADRAO.cores);
    expect(aviso).toContain("não passa mais na validação");
  });
});

describe("reduzirEditor", () => {
  const inicial = () => estadoInicial(hortitex());

  test("cor: normaliza para minúsculas e não muta o estado anterior", () => {
    const antes = inicial();
    const depois = reduzirEditor(antes, { tipo: "cor", papel: "primaria", valor: "#ABCDEF" });
    expect(depois.tema.cores.claro.primaria).toBe("#abcdef");
    expect(antes.tema.cores.claro.primaria).toBe(hortitex().cores.claro.primaria);
  });

  test("cor no modo escuro edita o escuro", () => {
    const e = aplicar(inicial(), { tipo: "modo", modo: "escuro" }, { tipo: "cor", papel: "fundo", valor: "#000000" });
    expect(e.tema.cores.escuro?.fundo).toBe("#000000");
    expect(e.tema.cores.claro.fundo).toBe(hortitex().cores.claro.fundo);
  });

  test("undefined remove papel opcional e ignora obrigatório", () => {
    const e = aplicar(inicial(), { tipo: "cor", papel: "cartao", valor: undefined });
    expect("cartao" in e.tema.cores.claro).toBe(false);
    const f = aplicar(inicial(), { tipo: "cor", papel: "fundo", valor: undefined });
    expect(f.tema.cores.claro.fundo).toBe(hortitex().cores.claro.fundo);
  });

  test("valor que não é #RRGGBB é ignorado", () => {
    const e = aplicar(inicial(), { tipo: "cor", papel: "primaria", valor: "#abc" });
    expect(e.tema.cores.claro.primaria).toBe(hortitex().cores.claro.primaria);
  });

  test("gráficos: cor individual e automático", () => {
    const sem = aplicar(inicial(), { tipo: "graficosAutomaticos", ligado: true });
    expect(sem.tema.cores.claro.graficos).toBeUndefined();
    const com = aplicar(sem, { tipo: "graficosAutomaticos", ligado: false }, { tipo: "grafico", indice: 2, valor: "#112233" });
    expect(com.tema.cores.claro.graficos).toHaveLength(5);
    expect(com.tema.cores.claro.graficos?.[2]).toBe("#112233");
  });

  test("modo escuro: desligar remove e volta para o claro; ligar copia o padrão", () => {
    const desligado = aplicar(inicial(), { tipo: "modo", modo: "escuro" }, { tipo: "modoEscuro", ligado: false });
    expect(desligado.tema.cores.escuro).toBeUndefined();
    expect(desligado.modo).toBe("claro");
    const ligado = aplicar(desligado, { tipo: "modoEscuro", ligado: true });
    expect(ligado.tema.cores.escuro).toEqual(TEMA_PADRAO.cores.escuro);
  });

  test("modo escuro sem escuro no tema é ignorado", () => {
    const e = aplicar(inicial(), { tipo: "modoEscuro", ligado: false }, { tipo: "modo", modo: "escuro" });
    expect(e.modo).toBe("claro");
  });

  test("fonte e raio: definir e remover", () => {
    const fonte = { pilha: pilhaDaFonte("Lato", "sans"), google: ["Lato"] };
    const e = aplicar(inicial(), { tipo: "fonte", grupo: "texto", fonte }, { tipo: "raio", px: 8 });
    expect(e.tema.fontes?.texto).toEqual(fonte);
    expect(e.tema.raio).toBe("8px");
    const sem = aplicar(
      estadoInicial(TEMA_PADRAO),
      { tipo: "fonte", grupo: "texto", fonte },
      { tipo: "fonte", grupo: "texto", fonte: undefined },
      { tipo: "raio", px: undefined },
    );
    expect(sem.tema.fontes).toBeUndefined();
    expect(sem.tema.raio).toBeUndefined();
  });

  test("carregar troca o tema e mantém o salvo; descartar volta; salvo/restaurado atualizam a referência", () => {
    const carregado = aplicar(estadoInicial(TEMA_PADRAO), { tipo: "carregar", tema: hortitex() });
    expect(carregado.tema).toEqual(hortitex());
    expect(carregado.salvo).toEqual(TEMA_PADRAO);
    expect(aplicar(carregado, { tipo: "descartar" }).tema).toEqual(TEMA_PADRAO);
    expect(aplicar(carregado, { tipo: "salvo" }).salvo).toEqual(hortitex());
    const restaurado = aplicar(carregado, { tipo: "restaurado", tema: TEMA_PADRAO });
    expect(restaurado.tema).toEqual(TEMA_PADRAO);
    expect(restaurado.salvo).toEqual(TEMA_PADRAO);
  });
});

describe("auxiliares", () => {
  test("pilhaDaFonte gera pilha válida no schema e tipoDaPilha reconhece", () => {
    for (const tipo of ["sans", "serif"] as const) {
      const pilha = pilhaDaFonte("Open Sans", tipo);
      const tema = { ...TEMA_PADRAO, fontes: { texto: { pilha, google: ["Open Sans"] } } };
      expect(validarTema(tema).ok).toBe(true);
      expect(tipoDaPilha(pilha)).toBe(tipo);
    }
  });

  test("valorEfetivo mostra a herança (cartão → fundo) e cai num cinza se o padrão não for #RRGGBB", () => {
    const { cartao: _c, borda: _b, ...claro } = hortitex().cores.claro;
    const tema = { ...hortitex(), cores: { ...hortitex().cores, claro } };
    expect(valorEfetivo(tema, "claro", "cartao")).toBe(claro.fundo);
    expect(valorEfetivo(tema, "claro", "borda")).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("diagnostico: erros e avisos ao mesmo tempo", () => {
    const tema = structuredClone(hortitex());
    tema.cores.claro.textoSobrePrimaria = tema.cores.claro.primaria;
    tema.cores.claro.textoApagado = "#d8d0c0";
    const d = diagnostico(tema);
    expect(d.erros.join()).toContain("textoSobrePrimaria");
    expect(d.avisos.join()).toContain("textoApagado");
    expect(diagnostico(hortitex())).toEqual({ erros: [], avisos: [] });
  });

  test("temasIguais ignora a ordem das chaves", () => {
    const a = hortitex();
    const { fundo, ...resto } = a.cores.claro;
    const b = { ...a, cores: { ...a.cores, claro: { ...resto, fundo } } };
    expect(temasIguais(a, b)).toBe(true);
    expect(temasIguais(a, { ...a, nome: "Outro" })).toBe(false);
  });

  test("urlFontesDaPrevia ignora nomes inválidos", () => {
    const tema = { ...TEMA_PADRAO, fontes: { texto: { pilha: "Lato, sans-serif", google: ["Lat;o"] } } };
    expect(urlFontesDaPrevia(tema)).toBeNull();
    expect(urlFontesDaPrevia(hortitex())).toContain("family=Carlito");
  });

  test("nomeArquivoTema tira acentos e espaços", () => {
    expect(nomeArquivoTema("Hortitex Hortaliças")).toBe("tema-hortitex-hortalicas.json");
    expect(nomeArquivoTema("***")).toBe("tema-empresa.json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tema/editor.test.ts`
Expected: FAIL (`Cannot find module './editor'`)

- [ ] **Step 3: Write implementation**

```ts
import { urlGoogleFonts, variaveisDoTema } from "./css";
import { TEMA_PADRAO } from "./padrao";
import { PAPEIS_OBRIGATORIOS, type CoresModo, type Tema } from "./schema";
import { mensagemContraste, paresDeContraste, validarTema, type PapelCor, type ParContraste } from "./validar";

export type Modo = "claro" | "escuro";
export type FonteTema = NonNullable<NonNullable<Tema["fontes"]>["texto"]>;
export type TipoFonte = "sans" | "serif";
export type EstadoEditor = { tema: Tema; salvo: Tema; modo: Modo };

export type AcaoEditor =
  | { tipo: "cor"; papel: PapelCor; valor: string | undefined }
  | { tipo: "grafico"; indice: number; valor: string }
  | { tipo: "graficosAutomaticos"; ligado: boolean }
  | { tipo: "modoEscuro"; ligado: boolean }
  | { tipo: "modo"; modo: Modo }
  | { tipo: "nome"; nome: string }
  | { tipo: "fonte"; grupo: "texto" | "titulos"; fonte: FonteTema | undefined }
  | { tipo: "raio"; px: number | undefined }
  | { tipo: "carregar"; tema: Tema }
  | { tipo: "descartar" }
  | { tipo: "salvo" }
  | { tipo: "restaurado"; tema: Tema };

export const ROTULOS: Record<PapelCor, string> = {
  fundo: "Fundo",
  texto: "Texto",
  primaria: "Primária",
  textoSobrePrimaria: "Texto sobre a primária",
  sidebar: "Barra lateral",
  textoSobreSidebar: "Texto da barra lateral",
  cartao: "Cartão",
  apoio: "Apoio",
  textoSobreApoio: "Texto sobre o apoio",
  textoApagado: "Texto apagado",
  destaque: "Destaque (hover e seleção)",
  textoSobreDestaque: "Texto sobre o destaque",
  borda: "Borda",
  foco: "Foco",
  erro: "Erro",
  cabecalho: "Cabeçalho",
  textoCabecalho: "Texto do cabeçalho",
};

/** De onde vem a cor de um papel opcional no automático (tabela de papéis da spec da entrega 1). */
export const HERANCA: Partial<Record<PapelCor, string>> = {
  cartao: "Fundo",
  apoio: "Fundo, um tom deslocado",
  textoSobreApoio: "Texto",
  textoApagado: "padrão do sistema",
  destaque: "Apoio",
  textoSobreDestaque: "Texto",
  borda: "padrão do sistema",
  foco: "Primária",
  erro: "padrão do sistema",
  cabecalho: "Fundo",
  textoCabecalho: "Texto",
};

const VARIAVEL: Record<PapelCor, string> = {
  fundo: "--background",
  texto: "--foreground",
  primaria: "--primary",
  textoSobrePrimaria: "--primary-foreground",
  sidebar: "--sidebar",
  textoSobreSidebar: "--sidebar-foreground",
  cartao: "--card",
  apoio: "--secondary",
  textoSobreApoio: "--secondary-foreground",
  textoApagado: "--muted-foreground",
  destaque: "--accent",
  textoSobreDestaque: "--accent-foreground",
  borda: "--border",
  foco: "--ring",
  erro: "--destructive",
  cabecalho: "--app-header-background",
  textoCabecalho: "--app-header-foreground",
};

const HEX = /^#[0-9a-f]{6}$/;
const NOME_GOOGLE = /^[A-Za-z0-9 ]{1,40}$/;
const CINZA = "#808080";
const OBRIGATORIOS: readonly string[] = PAPEIS_OBRIGATORIOS;

export function temaInicial(temaSalvo: unknown, nomeEmpresa: string): { tema: Tema; aviso: string | null } {
  const padrao = { ...TEMA_PADRAO, nome: nomeEmpresa.slice(0, 60) };
  if (temaSalvo === null || temaSalvo === undefined) return { tema: padrao, aviso: null };
  const resultado = validarTema(temaSalvo);
  if (resultado.ok) return { tema: resultado.tema, aviso: null };
  return {
    tema: padrao,
    aviso: "O tema gravado não passa mais na validação; o editor começou do padrão do sistema.",
  };
}

export function estadoInicial(tema: Tema): EstadoEditor {
  return { tema, salvo: tema, modo: "claro" };
}

function coresDoModo(tema: Tema, modo: Modo): CoresModo {
  return modo === "escuro" && tema.cores.escuro ? tema.cores.escuro : tema.cores.claro;
}

function comCores(tema: Tema, modo: Modo, cores: CoresModo): Tema {
  return { ...tema, cores: { ...tema.cores, [modo]: cores } };
}

function semChave<T extends object>(objeto: T, chave: string): T {
  const copia = { ...objeto } as Record<string, unknown>;
  delete copia[chave];
  return copia as T;
}

export function graficosEfetivos(tema: Tema, modo: Modo): string[] {
  const variaveis = variaveisDoTema(tema)[modo] ?? variaveisDoTema(tema).claro;
  return [1, 2, 3, 4, 5].map((n) => {
    const valor = variaveis[`--chart-${n}`];
    return HEX.test(valor) ? valor : CINZA;
  });
}

/** Cor em uso para o papel (com herança); cinza quando o padrão não é #RRGGBB (oklch ou transparência). */
export function valorEfetivo(tema: Tema, modo: Modo, papel: PapelCor): string {
  const variaveis = variaveisDoTema(tema)[modo] ?? variaveisDoTema(tema).claro;
  const valor = variaveis[VARIAVEL[papel]];
  return HEX.test(valor) ? valor : CINZA;
}

function comTema(estado: EstadoEditor, novo: Tema): EstadoEditor {
  return { ...estado, tema: novo };
}

export function reduzirEditor(estado: EstadoEditor, acao: AcaoEditor): EstadoEditor {
  const { modo } = estado;
  const atual = estado.tema;
  const cores = coresDoModo(atual, modo);
  switch (acao.tipo) {
    case "cor": {
      if (acao.valor === undefined) {
        if (OBRIGATORIOS.includes(acao.papel)) return estado;
        return comTema(estado, comCores(atual, modo, semChave(cores, acao.papel)));
      }
      const valor = acao.valor.toLowerCase();
      if (!HEX.test(valor)) return estado;
      return comTema(estado, comCores(atual, modo, { ...cores, [acao.papel]: valor }));
    }
    case "grafico": {
      const valor = acao.valor.toLowerCase();
      if (!HEX.test(valor) || acao.indice < 0 || acao.indice > 4) return estado;
      const lista = [...(cores.graficos ?? graficosEfetivos(atual, modo))];
      lista[acao.indice] = valor;
      return comTema(estado, comCores(atual, modo, { ...cores, graficos: lista as CoresModo["graficos"] }));
    }
    case "graficosAutomaticos": {
      if (acao.ligado) return comTema(estado, comCores(atual, modo, semChave(cores, "graficos")));
      const lista = graficosEfetivos(atual, modo) as CoresModo["graficos"];
      return comTema(estado, comCores(atual, modo, { ...cores, graficos: lista }));
    }
    case "modoEscuro": {
      if (acao.ligado) {
        if (atual.cores.escuro) return estado;
        return comTema(estado, { ...atual, cores: { ...atual.cores, escuro: TEMA_PADRAO.cores.escuro } });
      }
      return { ...estado, modo: "claro", tema: { ...atual, cores: semChave(atual.cores, "escuro") } };
    }
    case "modo":
      if (acao.modo === "escuro" && !atual.cores.escuro) return estado;
      return { ...estado, modo: acao.modo };
    case "nome":
      return comTema(estado, { ...atual, nome: acao.nome });
    case "fonte": {
      const fontes = acao.fonte
        ? { ...atual.fontes, [acao.grupo]: acao.fonte }
        : semChave(atual.fontes ?? {}, acao.grupo);
      if (Object.keys(fontes).length === 0) return comTema(estado, semChave(atual, "fontes"));
      return comTema(estado, { ...atual, fontes });
    }
    case "raio":
      if (acao.px === undefined) return comTema(estado, semChave(atual, "raio"));
      return comTema(estado, { ...atual, raio: `${Math.min(32, Math.max(0, Math.round(acao.px)))}px` });
    case "carregar":
      return { ...estado, tema: acao.tema, modo: "claro" };
    case "descartar":
      return { ...estado, tema: estado.salvo, modo: "claro" };
    case "salvo":
      return { ...estado, salvo: atual };
    case "restaurado":
      return { tema: acao.tema, salvo: acao.tema, modo: "claro" };
  }
}

export function pilhaDaFonte(google: string, tipo: TipoFonte): string {
  return tipo === "serif" ? `"${google}", Georgia, serif` : `"${google}", system-ui, sans-serif`;
}

export function tipoDaPilha(pilha: string): TipoFonte {
  const ultima = pilha.split(",").at(-1)?.trim();
  return ultima === "serif" ? "serif" : "sans";
}

export function paresDoModo(tema: Tema, modo: Modo): ParContraste[] {
  return paresDeContraste(coresDoModo(tema, modo));
}

/** Erros que bloqueiam o Salvar e avisos de contraste, mesmo quando há erros (o validarTema para no 1º). */
export function diagnostico(tema: Tema): { erros: string[]; avisos: string[] } {
  const resultado = validarTema(tema);
  const modos = (["claro", "escuro"] as const).filter((modo) => modo === "claro" || tema.cores.escuro);
  const avisos = modos.flatMap((modo) =>
    paresDoModo(tema, modo)
      .filter((par) => par.nivel === "secundario" && !par.ok)
      .map((par) => mensagemContraste(modo, par)),
  );
  return { erros: resultado.ok ? [] : resultado.erros, avisos };
}

function ordenado(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenado);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor)
        .sort()
        .map((chave) => [chave, ordenado((valor as Record<string, unknown>)[chave])]),
    );
  }
  return valor;
}

export function temasIguais(a: Tema, b: Tema): boolean {
  return JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
}

/** URL do Google Fonts só com os nomes válidos (o nome pode estar sendo digitado). */
export function urlFontesDaPrevia(tema: Tema): string | null {
  const limpar = (fonte: FonteTema | undefined) =>
    fonte ? { ...fonte, google: fonte.google?.filter((nome) => NOME_GOOGLE.test(nome)) } : undefined;
  return urlGoogleFonts({
    ...tema,
    fontes: { texto: limpar(tema.fontes?.texto), titulos: limpar(tema.fontes?.titulos) },
  });
}

export function nomeArquivoTema(nomeEmpresa: string): string {
  const base = nomeEmpresa
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `tema-${base || "empresa"}.json`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tema`
Expected: PASS em todos. Depois: `npx tsc --noEmit` sem erros novos.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/tema/editor.ts src/lib/tema/editor.test.ts
git commit -m @'
feat(tema): estado do editor visual (reducer e auxiliares)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 4: Componentes de campo e prévia de um modo

**Files:**
- Create: `src/app/(dashboard)/empresas/[id]/tema/campo-cor.tsx`
- Create: `src/app/(dashboard)/empresas/[id]/tema/campos-fonte-raio.tsx`
- Modify: `src/app/(dashboard)/empresas/[id]/tema/previa-tema.tsx` (todo o arquivo)

**Interfaces:**
- Consumes: `ROTULOS`, `HERANCA`, `pilhaDaFonte`, `tipoDaPilha`, `FonteTema`, `TipoFonte`, `AcaoEditor` (Task 3); `ParContraste`, `PapelCor` (Task 2)
- Produces:
  - `CampoCor({ papel, valor, efetivo, opcional, pares, onChange }: { papel: PapelCor; valor: string | undefined; efetivo: string; opcional: boolean; pares: ParContraste[]; onChange: (valor: string | undefined) => void })`
  - `Grupo({ titulo, aberto, children }: { titulo: string; aberto?: boolean; children: ReactNode })`
  - `CamposFonte({ grupo, fonte, onChange }: { grupo: "texto" | "titulos"; fonte: FonteTema | undefined; onChange: (fonte: FonteTema | undefined) => void })`
  - `CampoRaio({ raio, onChange }: { raio: string | undefined; onChange: (px: number | undefined) => void })`
  - `type PreviaTema = { variaveis: Record<string, string>; raio: string | null; fonteTexto: string | null; fonteTitulos: string | null }`
  - `PreviaDoTema({ previa, logoUrl, logoEscuroUrl }: { previa: PreviaTema; logoUrl: string | null; logoEscuroUrl: string | null })` (um modo só; o `<link>` das fontes passa a ser do editor)

Não há testes de componente (Vitest roda em `node`). A conferência é na Task 6.

- [ ] **Step 1: `campo-cor.tsx`**

```tsx
"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { HERANCA, ROTULOS } from "@/lib/tema/editor";
import type { PapelCor, ParContraste } from "@/lib/tema/validar";

const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function Selo({ par }: { par: ParContraste }) {
  const cor = par.ok
    ? "text-muted-foreground"
    : par.nivel === "essencial"
      ? "text-destructive font-medium"
      : "text-amber-700 dark:text-amber-400 font-medium";
  return (
    <span className={`text-xs ${cor}`} title={`Contraste com ${ROTULOS[par.fundo]}`}>
      {par.ok ? "✓" : par.nivel === "essencial" ? "✕" : "⚠"} {DECIMAL.format(par.razao)}:1 com {ROTULOS[par.fundo]}
    </span>
  );
}

/** Seletor de cor de um papel: amostra nativa + hex digitado + selo de contraste; opcional tem "Automático". */
export function CampoCor({
  papel,
  valor,
  efetivo,
  opcional,
  pares,
  onChange,
}: {
  papel: PapelCor;
  valor: string | undefined;
  efetivo: string;
  opcional: boolean;
  pares: ParContraste[];
  onChange: (valor: string | undefined) => void;
}) {
  const id = useId();
  const automatico = valor === undefined;
  const [texto, setTexto] = useState(valor ?? efetivo);
  useEffect(() => setTexto(valor ?? efetivo), [valor, efetivo]);
  const textoValido = /^#[0-9a-fA-F]{6}$/.test(texto);
  const meus = pares.filter((par) => par.texto === papel);
  const problema = meus.find((par) => !par.ok);

  return (
    <div className="space-y-1" data-papel={papel} data-problema={problema ? problema.nivel : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="min-w-40 flex-1 text-sm">
          {ROTULOS[papel]}
        </label>
        <input
          type="color"
          aria-label={`${ROTULOS[papel]}: escolher cor`}
          value={valor ?? efetivo}
          disabled={automatico}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Input
          id={id}
          value={texto}
          disabled={automatico}
          aria-invalid={!textoValido}
          spellCheck={false}
          className="h-8 w-24 font-mono text-xs"
          onChange={(e) => {
            setTexto(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value);
          }}
          onBlur={() => setTexto(valor ?? efetivo)}
        />
      </div>
      {opcional ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={automatico} onChange={(e) => onChange(e.target.checked ? undefined : efetivo)} />
          Automático (herda de {HERANCA[papel]})
        </label>
      ) : null}
      {meus.length > 0 ? (
        <div className="flex flex-wrap gap-x-3">
          {meus.map((par) => (
            <Selo key={par.fundo} par={par} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Grupo recolhível de campos. */
export function Grupo({ titulo, aberto = false, children }: { titulo: string; aberto?: boolean; children: ReactNode }) {
  return (
    <details open={aberto} className="group rounded-lg border">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium select-none">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
        {titulo}
      </summary>
      <div className="space-y-4 border-t px-3 py-3">{children}</div>
    </details>
  );
}
```

- [ ] **Step 2: `campos-fonte-raio.tsx`**

```tsx
"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { pilhaDaFonte, tipoDaPilha, type FonteTema, type TipoFonte } from "@/lib/tema/editor";

const ROTULO = { texto: "Fonte do texto", titulos: "Fonte dos títulos" } as const;

/** Fonte do Google + sans/serif (pilha montada sozinha) ou pilha avançada; vazio = fonte padrão. */
export function CamposFonte({
  grupo,
  fonte,
  onChange,
}: {
  grupo: "texto" | "titulos";
  fonte: FonteTema | undefined;
  onChange: (fonte: FonteTema | undefined) => void;
}) {
  const id = useId();
  const google = fonte?.google?.[0] ?? "";
  const tipo = fonte ? tipoDaPilha(fonte.pilha) : "sans";
  const montar = (nome: string, novoTipo: TipoFonte) =>
    onChange(nome.trim() ? { pilha: pilhaDaFonte(nome.trim(), novoTipo), google: [nome.trim()] } : undefined);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{ROTULO[grupo]}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          aria-label={`${ROTULO[grupo]}: nome no Google Fonts`}
          placeholder="Nome no Google Fonts (vazio = padrão)"
          value={google}
          className="h-8 min-w-48 flex-1"
          onChange={(e) => montar(e.target.value, tipo)}
        />
        <select
          aria-label={`${ROTULO[grupo]}: tipo`}
          value={tipo}
          disabled={!fonte}
          onChange={(e) => fonte && google && montar(google, e.target.value as TipoFonte)}
          className="h-8 rounded-lg border bg-transparent px-2 text-sm"
        >
          <option value="sans">Sem serifa</option>
          <option value="serif">Com serifa</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        Se o nome não existir no Google Fonts, vale a fonte alternativa da pilha.
      </p>
      {fonte ? (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Pilha avançada</summary>
          <Input
            aria-label={`${ROTULO[grupo]}: pilha completa`}
            value={fonte.pilha}
            spellCheck={false}
            className="mt-1 h-8 font-mono text-xs"
            onChange={(e) => onChange({ ...fonte, pilha: e.target.value })}
          />
        </details>
      ) : null}
    </fieldset>
  );
}

function emPx(raio: string): number {
  const numero = parseFloat(raio);
  return raio.endsWith("rem") ? numero * 16 : numero;
}

/** Raio de 0 a 32px; "Automático" = raio padrão do sistema. */
export function CampoRaio({ raio, onChange }: { raio: string | undefined; onChange: (px: number | undefined) => void }) {
  const px = raio ? emPx(raio) : 10;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Arredondamento dos cantos</legend>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={32}
          step={1}
          value={px}
          disabled={raio === undefined}
          aria-label="Raio dos cantos em pixels"
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-12 text-right font-mono text-xs">{raio === undefined ? "padrão" : `${px}px`}</span>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={raio === undefined} onChange={(e) => onChange(e.target.checked ? undefined : px)} />
        Automático (padrão do sistema)
      </label>
    </fieldset>
  );
}
```

- [ ] **Step 3: `previa-tema.tsx`** (substituir o arquivo inteiro: um modo por vez, tipo local)

```tsx
import type { CSSProperties } from "react";
import { corDeTextoContrastante } from "@/lib/corContraste";

export type PreviaTema = {
  variaveis: Record<string, string>;
  raio: string | null;
  fonteTexto: string | null;
  fonteTitulos: string | null;
};

/** Amostra de um modo do tema, com as variáveis aplicadas só neste bloco. */
export function PreviaDoTema({
  previa,
  logoUrl,
  logoEscuroUrl,
}: {
  previa: PreviaTema;
  logoUrl: string | null;
  logoEscuroUrl: string | null;
}) {
  const { variaveis } = previa;
  const logo = corDeTextoContrastante(variaveis["--sidebar"]) === "#ffffff" ? (logoEscuroUrl ?? logoUrl) : logoUrl;
  const estilo = {
    ...variaveis,
    ...(previa.raio ? { "--radius": previa.raio } : {}),
    background: "var(--background)",
    color: "var(--foreground)",
    fontFamily: previa.fonteTexto ?? undefined,
  } as CSSProperties;
  const raio = { borderRadius: "var(--radius)" };

  return (
    <div style={estilo} className="overflow-hidden rounded-lg border border-[var(--border)]">
      <div
        className="flex items-center justify-between px-4 py-2 text-sm"
        style={{ background: "var(--app-header-background)", color: "var(--app-header-foreground)" }}
      >
        <span className="font-medium">Cabeçalho</span>
        <span className="text-xs opacity-80">Usuário</span>
      </div>
      <div className="flex min-h-48 flex-col sm:flex-row">
        <div
          className="flex items-center gap-2 p-3 text-sm sm:w-36 sm:flex-col sm:items-start"
          style={{ background: "var(--sidebar)", color: "var(--sidebar-foreground)" }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="size-6 rounded object-contain" />
          ) : null}
          <span className="font-semibold">Menu</span>
          <span className="rounded px-2 py-1" style={{ background: "var(--sidebar-accent)" }}>
            Item ativo
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <p className="text-lg font-semibold" style={{ fontFamily: previa.fonteTitulos ?? undefined }}>
            Título com a fonte da marca
          </p>
          <p className="text-sm">Texto principal sobre o fundo.</p>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Texto apagado: legendas e dicas.
          </p>
          <div className="space-y-2 border p-3" style={{ ...raio, background: "var(--card)", borderColor: "var(--border)" }}>
            <p className="text-sm">Cartão</p>
            <div className="flex flex-wrap gap-2">
              <span
                className="px-3 py-1.5 text-sm font-medium"
                style={{ ...raio, background: "var(--primary)", color: "var(--primary-foreground)", outline: "2px solid var(--ring)", outlineOffset: 2 }}
              >
                Botão primário (com foco)
              </span>
              <span
                className="px-3 py-1.5 text-sm"
                style={{ ...raio, background: "var(--secondary)", color: "var(--secondary-foreground)" }}
              >
                Secundário
              </span>
              <span
                className="px-3 py-1.5 text-sm"
                style={{ ...raio, background: "var(--accent)", color: "var(--accent-foreground)" }}
              >
                Destaque
              </span>
              <span className="px-3 py-1.5 text-sm" style={{ color: "var(--destructive)" }}>
                Erro
              </span>
            </div>
          </div>
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="h-3 flex-1 rounded-sm" style={{ background: `var(--chart-${n})` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: só erros em `importar-tema-form.tsx`/`actions.ts` por causa do `PreviaTema` antigo (resolvidos na Task 5). Nenhum erro nos três arquivos desta task.

- [ ] **Step 5: Commit**

```powershell
git add "src/app/(dashboard)/empresas/[id]/tema/campo-cor.tsx" "src/app/(dashboard)/empresas/[id]/tema/campos-fonte-raio.tsx" "src/app/(dashboard)/empresas/[id]/tema/previa-tema.tsx"
git commit -m @'
feat(tema): campos de cor, fonte e raio e prévia por modo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 5: Editor na página e limpeza do fluxo antigo

**Files:**
- Create: `src/app/(dashboard)/empresas/[id]/tema/editor-tema.tsx`
- Modify: `src/app/(dashboard)/empresas/[id]/tema/page.tsx` (todo o arquivo)
- Modify: `src/app/(dashboard)/empresas/[id]/tema/actions.ts` (remover `PreviaTema`, `EstadoValidacao`, `validarTemaAction`, `textoDoTema` e os imports que sobrarem)
- Modify: `src/app/(dashboard)/empresas/[id]/tema/marca-form.tsx:98-114` (remover `RestaurarTemaForm`)
- Delete: `src/app/(dashboard)/empresas/[id]/tema/importar-tema-form.tsx`
- Delete: `src/app/(dashboard)/empresas/[id]/tema/exportar/route.ts`

**Interfaces:**
- Consumes: tudo da Task 3; `CampoCor`, `Grupo`, `CamposFonte`, `CampoRaio`, `PreviaDoTema` (Task 4); `aplicarTemaAction`, `restaurarTemaAction`, `FormState` (`actions.ts`); `MSG_CONFIRMAR_AVISOS` **não** é importado (vem de módulo com Prisma) — o editor pede a confirmação antes de enviar.
- Produces: `EditorTema({ empresaId, nomeEmpresa, temaInicial, aviso, temTemaGravado, logoUrl, logoEscuroUrl }: { empresaId: string; nomeEmpresa: string; temaInicial: Tema; aviso: string | null; temTemaGravado: boolean; logoUrl: string | null; logoEscuroUrl: string | null })`

- [ ] **Step 1: `editor-tema.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { variaveisDoTema } from "@/lib/tema/css";
import {
  diagnostico,
  estadoInicial,
  graficosEfetivos,
  nomeArquivoTema,
  paresDoModo,
  reduzirEditor,
  temaInicial as temaInicialDe,
  temasIguais,
  urlFontesDaPrevia,
  valorEfetivo,
  type Modo,
} from "@/lib/tema/editor";
import type { Tema } from "@/lib/tema/schema";
import { analisarTexto, type PapelCor } from "@/lib/tema/validar";
import { aplicarTemaAction, restaurarTemaAction } from "./actions";
import { CampoCor, Grupo } from "./campo-cor";
import { CampoRaio, CamposFonte } from "./campos-fonte-raio";
import { PreviaDoTema } from "./previa-tema";

const GRUPOS: { titulo: string; papeis: PapelCor[]; aberto?: boolean }[] = [
  {
    titulo: "Essenciais",
    papeis: ["fundo", "texto", "primaria", "textoSobrePrimaria", "sidebar", "textoSobreSidebar"],
    aberto: true,
  },
  {
    titulo: "Superfícies e apoio",
    papeis: ["cartao", "apoio", "textoSobreApoio", "textoApagado", "destaque", "textoSobreDestaque"],
  },
  { titulo: "Cabeçalho, foco, borda e erro", papeis: ["cabecalho", "textoCabecalho", "foco", "borda", "erro"] },
];
const OBRIGATORIOS = GRUPOS[0].papeis;

const CLASSE_TEXTAREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function formData(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

export function EditorTema({
  empresaId,
  nomeEmpresa,
  temaInicial,
  aviso,
  temTemaGravado,
  logoUrl,
  logoEscuroUrl,
}: {
  empresaId: string;
  nomeEmpresa: string;
  temaInicial: Tema;
  aviso: string | null;
  temTemaGravado: boolean;
  logoUrl: string | null;
  logoEscuroUrl: string | null;
}) {
  const [estado, despachar] = useReducer(reduzirEditor, temaInicial, estadoInicial);
  const { tema, modo } = estado;
  const [gravado, setGravado] = useState(temTemaGravado);
  const [mensagem, setMensagem] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const [errosImportacao, setErrosImportacao] = useState<string[]>([]);
  const [salvando, iniciar] = useTransition();
  const textoImportado = useRef<HTMLTextAreaElement>(null);

  const sujo = !temasIguais(tema, estado.salvo);
  const { erros, avisos } = useMemo(() => diagnostico(tema), [tema]);
  const cores = modo === "escuro" && tema.cores.escuro ? tema.cores.escuro : tema.cores.claro;
  const pares = useMemo(() => paresDoModo(tema, modo), [tema, modo]);
  const variaveis = useMemo(() => {
    const todas = variaveisDoTema(tema);
    return (modo === "escuro" ? todas.escuro : null) ?? todas.claro;
  }, [tema, modo]);

  // Folha do Google Fonts da prévia, com espera para não pedir uma fonte por tecla.
  const [urlFontes, setUrlFontes] = useState(() => urlFontesDaPrevia(tema));
  useEffect(() => {
    const espera = setTimeout(() => setUrlFontes(urlFontesDaPrevia(tema)), 600);
    return () => clearTimeout(espera);
  }, [tema]);

  useEffect(() => {
    if (!sujo) return;
    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sujo]);

  const confirmarPerda = () => !sujo || window.confirm("Descartar as alterações que não foram salvas?");

  function salvar() {
    if (erros.length > 0) return;
    const confirmar =
      avisos.length > 0 && window.confirm(`O tema tem ${avisos.length} aviso(s) de contraste. Salvar mesmo assim?`);
    if (avisos.length > 0 && !confirmar) return;
    iniciar(async () => {
      const resultado = await aplicarTemaAction(
        {},
        formData({ empresaId, texto: JSON.stringify(tema), confirmarAvisos: confirmar ? "true" : "false" }),
      );
      if (resultado.erro) {
        setMensagem({ tipo: "erro", texto: resultado.erro });
        return;
      }
      despachar({ tipo: "salvo" });
      setGravado(true);
      setMensagem({ tipo: "ok", texto: "Tema salvo. As telas do painel já usam as cores novas." });
    });
  }

  function restaurar() {
    if (!window.confirm("Voltar ao visual padrão do sistema? Os logos continuam.")) return;
    iniciar(async () => {
      const resultado = await restaurarTemaAction({}, formData({ empresaId }));
      if (resultado.erro) {
        setMensagem({ tipo: "erro", texto: resultado.erro });
        return;
      }
      despachar({ tipo: "restaurado", tema: temaInicialDe(null, nomeEmpresa).tema });
      setGravado(false);
      setMensagem({ tipo: "ok", texto: "Visual padrão do sistema restaurado." });
    });
  }

  function exportar() {
    const blob = new Blob([`${JSON.stringify(tema, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivoTema(nomeEmpresa);
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importar(texto: string) {
    const resultado = analisarTexto(texto);
    if (!resultado.ok) {
      setErrosImportacao(resultado.erros);
      return;
    }
    if (!confirmarPerda()) return;
    despachar({ tipo: "carregar", tema: resultado.tema });
    setErrosImportacao([]);
    setImportando(false);
    setMensagem({ tipo: "ok", texto: `Tema "${resultado.tema.nome}" carregado no editor. Confira e salve.` });
  }

  function irParaProblema() {
    document.querySelector<HTMLElement>("[data-problema='essencial'], [data-problema='secundario']")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  return (
    <div className="space-y-4">
      {aviso ? (
        <p role="status" className="rounded-lg border border-amber-500/50 p-3 text-sm">
          {aviso}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="nome-tema">Nome do tema</Label>
          <Input
            id="nome-tema"
            value={tema.nome}
            maxLength={60}
            onChange={(e) => despachar({ tipo: "nome", nome: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(tema.cores.escuro)}
            onChange={(e) => {
              if (!e.target.checked && !window.confirm("Remover o modo escuro? A empresa ficará só no claro.")) return;
              despachar({ tipo: "modoEscuro", ligado: e.target.checked });
            }}
          />
          Ter modo escuro
        </label>
      </div>

      <div role="tablist" aria-label="Modo em edição" className="inline-flex rounded-lg border p-0.5">
        {(["claro", "escuro"] as Modo[])
          .filter((m) => m === "claro" || tema.cores.escuro)
          .map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => despachar({ tipo: "modo", modo: m })}
              className={`rounded-md px-3 py-1 text-sm ${modo === m ? "bg-primary text-primary-foreground" : ""}`}
            >
              {m === "claro" ? "Claro" : "Escuro"}
            </button>
          ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:order-last lg:self-start">
          {urlFontes ? <link rel="stylesheet" href={urlFontes} /> : null}
          <PreviaDoTema
            previa={{
              variaveis,
              raio: tema.raio ?? null,
              fonteTexto: tema.fontes?.texto?.pilha ?? null,
              fonteTitulos: tema.fontes?.titulos?.pilha ?? null,
            }}
            logoUrl={logoUrl}
            logoEscuroUrl={logoEscuroUrl}
          />
        </div>

        <div className="min-w-0 space-y-3">
          {GRUPOS.map((grupo) => (
            <Grupo key={grupo.titulo} titulo={grupo.titulo} aberto={grupo.aberto}>
              {grupo.papeis.map((papel) => (
                <CampoCor
                  key={`${modo}-${papel}`}
                  papel={papel}
                  valor={cores[papel]}
                  efetivo={valorEfetivo(tema, modo, papel)}
                  opcional={!OBRIGATORIOS.includes(papel)}
                  pares={pares}
                  onChange={(valor) => despachar({ tipo: "cor", papel, valor })}
                />
              ))}
            </Grupo>
          ))}
          <Grupo titulo="Gráficos">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={!cores.graficos}
                onChange={(e) => despachar({ tipo: "graficosAutomaticos", ligado: e.target.checked })}
              />
              Automático (cores padrão do sistema)
            </label>
            <div className="flex flex-wrap gap-2">
              {graficosEfetivos(tema, modo).map((cor, indice) => (
                <input
                  key={indice}
                  type="color"
                  aria-label={`Cor ${indice + 1} dos gráficos`}
                  value={cores.graficos?.[indice] ?? cor}
                  disabled={!cores.graficos}
                  onChange={(e) => despachar({ tipo: "grafico", indice, valor: e.target.value })}
                  className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                />
              ))}
            </div>
          </Grupo>
          <Grupo titulo="Fontes e raio">
            <CamposFonte
              grupo="texto"
              fonte={tema.fontes?.texto}
              onChange={(fonte) => despachar({ tipo: "fonte", grupo: "texto", fonte })}
            />
            <CamposFonte
              grupo="titulos"
              fonte={tema.fontes?.titulos}
              onChange={(fonte) => despachar({ tipo: "fonte", grupo: "titulos", fonte })}
            />
            <CampoRaio raio={tema.raio} onChange={(px) => despachar({ tipo: "raio", px })} />
          </Grupo>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 space-y-2 border-t bg-background px-4 py-3 md:mx-0 md:rounded-lg md:border">
        {erros.length + avisos.length > 0 ? (
          <button type="button" onClick={irParaProblema} className="text-left text-sm underline-offset-4 hover:underline">
            <span className={erros.length ? "text-destructive font-medium" : ""}>
              {erros.length} {erros.length === 1 ? "erro" : "erros"}
            </span>
            {" · "}
            {avisos.length} {avisos.length === 1 ? "aviso" : "avisos"}
            {erros.length ? " (corrija os erros para salvar)" : ""}
          </button>
        ) : null}
        {erros.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-destructive">
            {erros.map((erro) => (
              <li key={erro} className="break-words">
                {erro}
              </li>
            ))}
          </ul>
        ) : null}
        {mensagem ? (
          <p
            role={mensagem.tipo === "erro" ? "alert" : "status"}
            className={`text-sm whitespace-pre-line ${mensagem.tipo === "erro" ? "text-destructive" : ""}`}
          >
            {mensagem.texto}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setImportando(true)}>
            Importar JSON
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={exportar}>
            Exportar
          </Button>
          {gravado ? (
            <Button type="button" variant="outline" size="sm" onClick={restaurar} disabled={salvando}>
              Restaurar padrão
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!sujo || salvando}
            onClick={() => confirmarPerda() && despachar({ tipo: "descartar" })}
          >
            Descartar alterações
          </Button>
          <Button type="button" size="sm" disabled={!sujo || erros.length > 0 || salvando} onClick={salvar}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <Dialog
        open={importando}
        onOpenChange={(aberto) => {
          setImportando(aberto);
          if (!aberto) setErrosImportacao([]);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar tema (JSON)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="arquivo-tema">Arquivo .json</Label>
              <Input
                id="arquivo-tema"
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) await importar(await arquivo.text());
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="texto-tema">Ou cole o JSON</Label>
              <textarea id="texto-tema" ref={textoImportado} rows={6} className={CLASSE_TEXTAREA} spellCheck={false} />
            </div>
            {errosImportacao.length > 0 ? (
              <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
                <p className="font-medium">O arquivo não pode ser carregado:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {errosImportacao.map((erro) => (
                    <li key={erro} className="break-words">
                      {erro}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Gere o arquivo com uma IA usando o{" "}
              <a href="/temas/modelo-pedido-ia.md" download className="underline underline-offset-4">
                modelo de pedido
              </a>
              {" "}(referências:{" "}
              <a href="/temas/nx-tema.schema.json" download className="underline underline-offset-4">
                formato
              </a>{" "}
              e{" "}
              <a href="/temas/hortitex.json" download className="underline underline-offset-4">
                exemplo Hortitex
              </a>
              ).
            </p>
            <Button type="button" onClick={() => importar(textoImportado.current?.value ?? "")}>
              Carregar no editor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Nota: o tema importado com erro **de contraste** é recusado por `analisarTexto` (mesma regra de antes). Isso é intencional: o editor só carrega temas que passam; quem quiser partir de um tema quase pronto corrige o JSON ou ajusta depois de carregar o mais próximo.

- [ ] **Step 2: `page.tsx`** (substituir o arquivo inteiro)

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { temaInicial } from "@/lib/tema/editor";
import { EditorTema } from "./editor-tema";
import { MarcaForm } from "./marca-form";

export default async function TemaEmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "empresa:gerenciar");
  const { id } = await params;
  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) notFound();
  const inicial = temaInicial(empresa.tema, empresa.nomeFantasia);

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/empresas" className="underline-offset-4 hover:underline">
            Empresas
          </Link>
        </p>
        <h1 className="text-lg font-semibold">Tema e marca · {empresa.nomeFantasia}</h1>
        <p className="text-sm text-muted-foreground">
          Cores, fontes e logos do painel desta empresa. Sem tema salvo, vale o visual padrão do sistema.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Tema</h2>
        <EditorTema
          empresaId={empresa.id}
          nomeEmpresa={empresa.nomeFantasia}
          temaInicial={inicial.tema}
          aviso={inicial.aviso}
          temTemaGravado={empresa.tema !== null}
          logoUrl={empresa.logoUrl}
          logoEscuroUrl={empresa.logoEscuroUrl}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Marca</h2>
        <MarcaForm
          empresaId={empresa.id}
          logoUrl={empresa.logoUrl}
          logoEscuroUrl={empresa.logoEscuroUrl}
          faviconUrl={empresa.faviconUrl}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Limpeza**

  - `actions.ts`: remover `PreviaTema`, `EstadoValidacao`, `textoDoTema`, `validarTemaAction`; os imports passam a ser `import { atualizarMarca, importarTema, restaurarTemaPadrao } from "@/server/services/temaEmpresa";` (sem `urlGoogleFonts`/`variaveisDoTema`/`analisarTexto`).
  - `marca-form.tsx`: remover `RestaurarTemaForm` (linhas 98–114) e `restaurarTemaAction` do import.
  - Apagar `importar-tema-form.tsx` e `exportar/route.ts`:

```powershell
git rm "src/app/(dashboard)/empresas/[id]/tema/importar-tema-form.tsx" "src/app/(dashboard)/empresas/[id]/tema/exportar/route.ts"
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit; npm run lint; npx vitest run src/lib/tema src/server/services/temaEmpresa.test.ts "src/app/(dashboard)/tema-empresa.test.ts"`
Expected: sem erros de tipo nem de lint nos arquivos tocados; testes passam. Se o `npm run lint` acusar `react-hooks/set-state-in-effect` no `CampoCor` (`useEffect` que sincroniza o texto), trocar pela técnica de "chave": remover o `useEffect` e passar `key={\`${modo}-${papel}-${cores[papel] ?? "auto"}\`}` no `CampoCor` do editor — mas só se o lint reclamar.

- [ ] **Step 5: Commit**

```powershell
git add -A "src/app/(dashboard)/empresas/[id]/tema"
git commit -m @'
feat(tema): editor visual com prévia ao vivo na tela de tema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 6: Conferência no navegador, docs e registro

**Files:**
- Modify: `content/ajuda/passo-a-passo.md` (seção de Empresas → tema e marca)
- Modify: `docs/temas/README.md` (nova seção "Editor visual")
- Modify: `docs/fases/fase-1-fundacao.md` (registro da entrega 2)
- Modify: `docs/superpowers/specs/2026-11-15-editor-visual-tema-design.md` (status "implementada" + "Ajustes na implementação" com as decisões 1–6 deste plano)
- Modify: `docs/superpowers/specs/2026-11-15-tema-por-empresa-design.md:19` (entrega 2 feita, com link)

- [ ] **Step 1: Subir o app**

Seguir as armadilhas conhecidas do ambiente: `npx prisma generate` se o client estiver desatualizado; liberar a porta 3000 se estiver presa; login local com o usuário de desenvolvimento. Rodar `npm run dev` em segundo plano.

- [ ] **Step 2: Roteiro no navegador (Playwright MCP)**, numa empresa de teste:
  1. Empresa sem tema → editor abre no padrão, com o nome da empresa; "Salvar" e "Descartar" desabilitados; sem "Restaurar padrão".
  2. Trocar **Primária** → prévia muda na hora; "Salvar" habilita.
  3. **Texto sobre a primária** igual à primária → selo vermelho "✕", resumo "1 erro", Salvar desabilitado; clicar no resumo rola até o campo.
  4. **Texto apagado** fraco → selo âmbar e "1 aviso"; Salvar pede confirmação.
  5. Desmarcar **Automático** em Cartão → seletor habilita com a cor herdada; marcar de novo → volta a herdar.
  6. Aba **Escuro** → controles editam o escuro; desligar **Ter modo escuro** → aba some.
  7. Fonte do texto "Lato", com serifa/sem serifa → prévia troca a fonte (após ~600ms); raio 0 e 24px.
  8. **Importar JSON** com `public/temas/hortitex.json` → editor carregado; JSON quebrado → lista de erros, editor não muda.
  9. **Salvar** → mensagem de sucesso; recarregar a página → editor com o tema salvo; painel (sidebar, cabeçalho, um diálogo) com as cores; seletor de aparência só Claro/Escuro.
  10. **Exportar** baixa `tema-<empresa>.json`; **Descartar** volta ao salvo; **Restaurar padrão** → editor no padrão e painel igual a antes.
  11. Largura 390px: prévia em cima, barra de ações no rodapé, **sem rolagem horizontal** (`document.documentElement.scrollWidth <= 390`).
  12. Console do navegador sem erros.

Anotar qualquer divergência e corrigir antes do commit (cada correção com um teste, se for lógica de `src/lib/tema`).

- [ ] **Step 3: Docs**

  - `content/ajuda/passo-a-passo.md`: na parte de tema e marca, descrever o editor como caminho principal (grupos de cores, Automático, selos de contraste, Claro/Escuro, fontes e raio, Salvar/Descartar/Exportar/Restaurar) e a IA + "Importar JSON" como atalho que carrega no editor.
  - `docs/temas/README.md`: seção "Editor visual" com o mesmo resumo, mais: começa do tema salvo ou do padrão; tema importado precisa passar na validação; erros de contraste essenciais bloqueiam o Salvar.
  - `docs/fases/fase-1-fundacao.md`: uma linha registrando a entrega 2 (editor visual) em 2026-11-15, com link para a spec.
  - Specs: atualizar status e ajustes, como listado em **Files**.

- [ ] **Step 4: Suíte completa**

Run: `npx vitest run; npx tsc --noEmit; npm run lint`
Expected: tudo verde (falhas pré-existentes não relacionadas: registrar no resumo, não corrigir aqui).

- [ ] **Step 5: Commit**

```powershell
git add content/ajuda/passo-a-passo.md docs/temas/README.md docs/fases/fase-1-fundacao.md docs/superpowers/specs
git commit -m @'
docs(tema): ajuda e registro do editor visual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```
