# Ajuda contextual com simulação da tela — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um ícone de ajuda em Contas a pagar abre um popup com 6 roteiros guiados, cada um numa réplica da tela que é preenchida passo a passo com um exemplo.

**Architecture:** a engine fica em `src/components/ajuda/` (botão, popup, simulador, peças de réplica) e não sabe nada de Contas a pagar. O conteúdo de cada tela fica em `src/ajuda/<tela>/`: alvos, cenas (componentes React somente leitura), exemplo e roteiros (dados). `src/ajuda/registro.ts` mapeia a tela para um `import()` dinâmico, e o conteúdo só é baixado quando o popup abre. O estado do simulador é só o índice do passo. Os valores mostrados são derivados com `valoresAte(roteiro, indice)`.

**Tech Stack:** Next.js 16.4 (App Router), React 19.2, componentes shadcn sobre `@base-ui/react`, Tailwind 4, lucide-react 1.34, Vitest 4 (ambiente `node`, só `*.test.ts`), `react-dom/server` para testar cenas sem DOM.

**Spec:** `docs/superpowers/specs/2026-11-19-ajuda-contextual-design.md`

## Global Constraints

- Todo texto de interface e de ajuda em português, no tom da spec: instrução curta no imperativo e explicação sem jargão. Termo técnico (competência, classificação fiscal, centro de custo) é explicado na primeira vez que aparece.
- A ajuda não lê dado nenhum da empresa. Nomes e valores do exemplo são fixos e fictícios.
- As cenas usam só tokens do tema (`bg-popover`, `text-muted-foreground`, `ring-primary` etc.). Nenhuma cor fixa.
- A cena é decorativa: `aria-hidden` e `inert` no contêiner. O texto do passo fica numa região `aria-live="polite"`.
- Animações respeitam `prefers-reduced-motion` (`motion-reduce:` no Tailwind, `behavior: "auto"` no `scrollIntoView`).
- Rótulos e ordem dos campos das cenas iguais aos componentes reais em `src/app/(dashboard)/financeiro/_titulos/`. O badge de status mostra o status cru (`VENCIDO`, `A_VENCER`), como a tela real.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rodar Vitest pelo PowerShell: `Set-Location D:\Projetos\nx-control-erp; npx vitest run <arquivos>` (pelo Git Bash falha com "reading 'config'"). Se o Prisma Client reclamar, `npx prisma generate`.
- Checagem de tipos: `npx tsc --noEmit`. Lint: `npx eslint <arquivos>`.
- Nunca rodar Prettier em arquivo existente. Formatar à mão, linhas até ~120 colunas. Arquivos existentes podem ser CRLF: editar com a ferramenta Edit.
- Branch: `feat/ajuda-contextual` (já criada a partir da `staging`, com a spec commitada).

## Arquivos

Criar:
- `src/ajuda/tipos.ts`: `TipoTela`, `Valores`, `PropsCena`, `Passo`, `Roteiro`, `DefinicaoAjuda`, `construtorDeRoteiros`
- `src/ajuda/roteiro.ts` (+ `roteiro.test.ts`): `valoresAte`, `limitarIndice`, `totalDeEtapas`, `ehEDepois`
- `src/ajuda/link.ts` (+ `link.test.ts`): `lerLinkAjuda`
- `src/ajuda/registro.ts` (+ `registro.test.ts`): `temAjuda`, `tituloDaAjuda`, `carregarAjuda`
- `src/components/ajuda/campos-simulados.tsx`: `DestaqueContext`, `Alvo`, `CampoSimulado`, `SelectSimulado`, `BotaoSimulado`, `JanelaSimulada`
- `src/components/ajuda/simulador.tsx` (+ `simulador.test.ts`): `Simulador`
- `src/components/ajuda/ajuda-dialog.tsx`: `AjudaConteudo` (índice, abas e simulador)
- `src/components/ajuda/botao-ajuda.tsx`: `BotaoAjuda`
- `src/ajuda/contas-a-pagar/alvos.ts`: `ALVOS`
- `src/ajuda/contas-a-pagar/exemplo.ts`: `EXEMPLO`, `OUTROS_TITULOS`
- `src/ajuda/contas-a-pagar/cenas.tsx` (+ `cenas.test.ts`): `CenaLista`, `CenaNovoTitulo`, `CenaBaixa`, `CenaRenegociar`
- `src/ajuda/contas-a-pagar/roteiros.ts` (+ `roteiros.test.ts`): `ROTEIROS`
- `src/ajuda/contas-a-pagar/index.ts`: `ajudaContasAPagar`

Modificar:
- `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`: botão ao lado do `h1`
- `src/components/markdown-content.tsx`: links `#ajuda/...`
- `content/ajuda/passo-a-passo.md`: links "Ver simulação" e menção na Introdução
- `src/app/(dashboard)/financeiro/_titulos/{titulo-dialog-form,secao-documento-fiscal,baixa-dialog,renegociar-dialog,titulo-table,barra-de-filtros}.tsx`: comentário de espelho
- `docs/superpowers/specs/2026-11-19-ajuda-contextual-design.md`: status e ajustes do plano

---

### Task 1: Tipos e lógica do roteiro

**Files:**
- Create: `src/ajuda/tipos.ts`
- Create: `src/ajuda/roteiro.ts`
- Test: `src/ajuda/roteiro.test.ts`

**Interfaces:**
- Produces: os tipos abaixo e
  `valoresAte(roteiro: Roteiro, indice: number): Valores`,
  `limitarIndice(roteiro: Roteiro, indice: number): number`,
  `totalDeEtapas(roteiro: Roteiro): number`,
  `ehEDepois(roteiro: Roteiro, indice: number): boolean`,
  `construtorDeRoteiros<M>(): (roteiro) => Roteiro`.
  Os índices vão de `0` a `passos.length`. O índice `passos.length` é a tela "E depois?".

- [ ] **Step 1: Criar os tipos**

`src/ajuda/tipos.ts`:

```ts
import type { ComponentType } from "react";

export type TipoTela = "PAGAR" | "RECEBER";

/** Valores mostrados nos campos da cena, pelo nome do alvo. */
export type Valores = Readonly<Partial<Record<string, string>>>;

export type PropsCena = { tipo: TipoTela; valores: Valores };

export type Passo = {
  /** Cena mostrada neste passo (chave de `DefinicaoAjuda.cenas`). */
  cena: string;
  /** `data-alvo` destacado na cena. */
  alvo: string;
  /** Frase curta no imperativo: "Escolha o fornecedor". */
  instrucao: string;
  explicacao: string;
  dica?: string;
  /** Valores que passam a aparecer na cena a partir deste passo. */
  preenche?: Valores;
};

export type Roteiro = {
  /** Usado no link do manual: `#ajuda/<tela>/<id>`. */
  id: string;
  titulo: string;
  quandoUsar: string;
  quemPode?: string;
  passos: readonly Passo[];
  eDepois: { texto: string; proximoRoteiro?: string };
};

export type DefinicaoAjuda = {
  tituloTela: string;
  resumo: string;
  tipo: TipoTela;
  cenas: Readonly<Record<string, ComponentType<PropsCena>>>;
  roteiros: readonly Roteiro[];
  /** Avisos do índice que não viram roteiro (ex.: importação por CSV). */
  observacoes?: readonly string[];
};

type PassoTipado<M extends Record<string, readonly string[]>> = {
  [C in keyof M & string]: Omit<Passo, "cena" | "alvo" | "preenche"> & {
    cena: C;
    alvo: M[C][number];
    preenche?: Partial<Record<M[keyof M][number], string>>;
  };
}[keyof M & string];

/**
 * Amarra os roteiros de uma tela aos alvos das cenas dela: um passo que aponta
 * para um alvo que a cena não tem não compila. Uso:
 * `const roteiro = construtorDeRoteiros<typeof ALVOS>();`
 */
export function construtorDeRoteiros<M extends Record<string, readonly string[]>>() {
  return (roteiro: Omit<Roteiro, "passos"> & { passos: readonly PassoTipado<M>[] }): Roteiro => roteiro;
}
```

- [ ] **Step 2: Escrever o teste que falha**

`src/ajuda/roteiro.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { ehEDepois, limitarIndice, totalDeEtapas, valoresAte } from "./roteiro";
import type { Passo, Roteiro } from "./tipos";

function passo(alvo: string, preenche?: Record<string, string>): Passo {
  return { cena: "cena", alvo, instrucao: `Instrução ${alvo}`, explicacao: "", preenche };
}

const ROTEIRO: Roteiro = {
  id: "teste",
  titulo: "Teste",
  quandoUsar: "",
  passos: [passo("a", { a: "1" }), passo("b"), passo("c", { c: "3", a: "novo" })],
  eDepois: { texto: "Fim" },
};

describe("valoresAte", () => {
  test("o primeiro passo já mostra o próprio valor", () => {
    expect(valoresAte(ROTEIRO, 0)).toEqual({ a: "1" });
  });

  test("passo sem preenche mantém os valores anteriores", () => {
    expect(valoresAte(ROTEIRO, 1)).toEqual({ a: "1" });
  });

  test("passo posterior sobrescreve o valor do mesmo alvo", () => {
    expect(valoresAte(ROTEIRO, 2)).toEqual({ a: "novo", c: "3" });
  });

  test("no E depois mostra todos os valores do roteiro", () => {
    expect(valoresAte(ROTEIRO, 3)).toEqual({ a: "novo", c: "3" });
  });

  test("voltar um passo desfaz o preenchimento", () => {
    expect(valoresAte(ROTEIRO, 2).c).toBe("3");
    expect(valoresAte(ROTEIRO, 1).c).toBeUndefined();
  });
});

describe("navegação", () => {
  test("total de etapas conta o E depois", () => {
    expect(totalDeEtapas(ROTEIRO)).toBe(4);
  });

  test("índice fica entre o primeiro passo e o E depois", () => {
    expect(limitarIndice(ROTEIRO, -1)).toBe(0);
    expect(limitarIndice(ROTEIRO, 2)).toBe(2);
    expect(limitarIndice(ROTEIRO, 99)).toBe(3);
  });

  test("E depois é o índice logo após o último passo", () => {
    expect(ehEDepois(ROTEIRO, 2)).toBe(false);
    expect(ehEDepois(ROTEIRO, 3)).toBe(true);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda/roteiro.test.ts`
Expected: FAIL, "Failed to resolve import "./roteiro"".

- [ ] **Step 4: Implementar**

`src/ajuda/roteiro.ts`:

```ts
import type { Roteiro, Valores } from "./tipos";

/** Junta os `preenche` do primeiro passo até `indice` (o E depois mostra tudo). */
export function valoresAte(roteiro: Roteiro, indice: number): Valores {
  const ultimo = Math.min(indice, roteiro.passos.length - 1);
  const valores: Record<string, string> = {};
  for (let i = 0; i <= ultimo; i++) {
    for (const [alvo, valor] of Object.entries(roteiro.passos[i].preenche ?? {})) {
      if (valor !== undefined) valores[alvo] = valor;
    }
  }
  return valores;
}

/** Passos mais a tela "E depois?". */
export function totalDeEtapas(roteiro: Roteiro): number {
  return roteiro.passos.length + 1;
}

export function limitarIndice(roteiro: Roteiro, indice: number): number {
  return Math.max(0, Math.min(indice, roteiro.passos.length));
}

export function ehEDepois(roteiro: Roteiro, indice: number): boolean {
  return indice === roteiro.passos.length;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda/roteiro.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 6: Commit**

```bash
git add src/ajuda/tipos.ts src/ajuda/roteiro.ts src/ajuda/roteiro.test.ts
git commit -m "feat(ajuda): tipos e lógica dos roteiros guiados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Link da ajuda no markdown e registro de telas

**Files:**
- Create: `src/ajuda/link.ts`
- Test: `src/ajuda/link.test.ts`
- Create: `src/ajuda/registro.ts`
- Test: `src/ajuda/registro.test.ts`

**Interfaces:**
- Consumes: `DefinicaoAjuda` (Task 1).
- Produces:
  `type DestinoAjuda = { tela: string; roteiro?: string }`,
  `lerLinkAjuda(href: string | undefined): DestinoAjuda | null`,
  `temAjuda(tela: string): boolean`,
  `tituloDaAjuda(tela: string): string` (lança se a tela não existe),
  `carregarAjuda(tela: string): Promise<DefinicaoAjuda>`.
  O registro começa **vazio**. A Task 5 adiciona `contas-a-pagar`.

- [ ] **Step 1: Escrever os testes que falham**

`src/ajuda/link.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { lerLinkAjuda } from "./link";

describe("lerLinkAjuda", () => {
  test("tela e roteiro", () => {
    expect(lerLinkAjuda("#ajuda/contas-a-pagar/cadastrar-titulo")).toEqual({
      tela: "contas-a-pagar",
      roteiro: "cadastrar-titulo",
    });
  });

  test("só a tela abre o índice", () => {
    expect(lerLinkAjuda("#ajuda/contas-a-pagar")).toEqual({ tela: "contas-a-pagar" });
  });

  test("links comuns não são da ajuda", () => {
    expect(lerLinkAjuda("https://exemplo.com")).toBeNull();
    expect(lerLinkAjuda("#secao-3")).toBeNull();
    expect(lerLinkAjuda(undefined)).toBeNull();
  });

  test("formatos inválidos são ignorados", () => {
    expect(lerLinkAjuda("#ajuda/")).toBeNull();
    expect(lerLinkAjuda("#ajuda/contas-a-pagar/")).toBeNull();
    expect(lerLinkAjuda("#ajuda/contas-a-pagar/a/b")).toBeNull();
    expect(lerLinkAjuda("#ajuda/Contas a pagar")).toBeNull();
  });
});
```

`src/ajuda/registro.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { carregarAjuda, temAjuda, tituloDaAjuda } from "./registro";

describe("registro da ajuda", () => {
  test("tela desconhecida não tem ajuda", async () => {
    expect(temAjuda("tela-que-nao-existe")).toBe(false);
    expect(temAjuda("constructor")).toBe(false);
    expect(() => tituloDaAjuda("tela-que-nao-existe")).toThrow();
    await expect(carregarAjuda("tela-que-nao-existe")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda/link.test.ts src/ajuda/registro.test.ts`
Expected: FAIL, imports não resolvidos.

- [ ] **Step 3: Implementar**

`src/ajuda/link.ts`:

```ts
export type DestinoAjuda = { tela: string; roteiro?: string };

const PREFIXO = "#ajuda/";
const SEGMENTO = /^[a-z0-9-]+$/;

/**
 * Lê um link do manual no formato `#ajuda/<tela>` ou `#ajuda/<tela>/<roteiro>`.
 * Usa âncora porque o react-markdown limpa URLs com protocolo desconhecido.
 */
export function lerLinkAjuda(href: string | undefined): DestinoAjuda | null {
  if (!href?.startsWith(PREFIXO)) return null;
  const partes = href.slice(PREFIXO.length).split("/");
  if (partes.length > 2 || !partes.every((parte) => SEGMENTO.test(parte))) return null;
  const [tela, roteiro] = partes;
  return roteiro ? { tela, roteiro } : { tela };
}
```

`src/ajuda/registro.ts`:

```ts
import type { DefinicaoAjuda } from "./tipos";

type EntradaRegistro = { titulo: string; carregar: () => Promise<DefinicaoAjuda> };

/** Telas com ajuda. O conteúdo só é baixado quando o popup abre (import dinâmico). */
const REGISTRO: Readonly<Record<string, EntradaRegistro>> = {};

export function temAjuda(tela: string): boolean {
  return Object.hasOwn(REGISTRO, tela);
}

export function tituloDaAjuda(tela: string): string {
  if (!temAjuda(tela)) throw new Error(`Tela sem ajuda: ${tela}`);
  return REGISTRO[tela].titulo;
}

export async function carregarAjuda(tela: string): Promise<DefinicaoAjuda> {
  if (!temAjuda(tela)) throw new Error(`Tela sem ajuda: ${tela}`);
  return REGISTRO[tela].carregar();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda/link.test.ts src/ajuda/registro.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/ajuda/link.ts src/ajuda/link.test.ts src/ajuda/registro.ts src/ajuda/registro.test.ts
git commit -m "feat(ajuda): link do manual e registro de telas com ajuda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Engine visual (peças de réplica, simulador, popup e botão)

**Files:**
- Create: `src/components/ajuda/campos-simulados.tsx`
- Create: `src/components/ajuda/simulador.tsx`
- Test: `src/components/ajuda/simulador.test.ts`
- Create: `src/components/ajuda/ajuda-dialog.tsx`
- Create: `src/components/ajuda/botao-ajuda.tsx`

**Interfaces:**
- Consumes: Task 1 (`valoresAte`, `limitarIndice`, `ehEDepois`, `totalDeEtapas`, tipos) e Task 2 (`temAjuda`, `tituloDaAjuda`, `carregarAjuda`).
- Produces:
  - `DestaqueContext: React.Context<string | null>`
  - `Alvo({ nome, className?, children })`: `div` com `data-alvo`, e `data-destacado="true"` quando é o alvo do passo.
  - `CampoSimulado({ alvo?, rotulo?, valor?, placeholder?, compacto?, className? })`
  - `SelectSimulado({ alvo?, rotulo?, valor?, compacto?, className? })`
  - `BotaoSimulado({ alvo?, variant?, size?, className?, children })`
  - `JanelaSimulada({ titulo, className?, children })`
  - `Simulador({ definicao, roteiro, aoAbrirRoteiro })`, montado com `key={roteiro.id}`
  - `AjudaConteudo({ definicao, roteiroInicial? })`
  - `BotaoAjuda({ tela, roteiroInicial?, gatilho?: "icone" | "link", children? })`: não renderiza nada se a tela não tem ajuda

- [ ] **Step 1: Peças de réplica**

`src/components/ajuda/campos-simulados.tsx`:

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Alvo destacado no passo atual (`null` = nenhum, como no "E depois?"). */
export const DestaqueContext = createContext<string | null>(null);

export function Alvo({ nome, className, children }: { nome: string; className?: string; children: ReactNode }) {
  const ativo = useContext(DestaqueContext) === nome;
  return (
    <div
      data-alvo={nome}
      data-destacado={ativo ? "true" : undefined}
      className={cn(
        "rounded-lg transition-[box-shadow,background-color] duration-200 motion-reduce:transition-none",
        ativo && "bg-primary/5 ring-2 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Mesmo visual do `Input`/`SelectTrigger` de src/components/ui, sem ser campo de verdade. */
const CAIXA =
  "flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30";

function Envoltorio({
  alvo,
  rotulo,
  compacto,
  className,
  children,
}: {
  alvo?: string;
  rotulo?: string;
  compacto?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const conteudo = (
    <>
      {rotulo &&
        (compacto ? (
          <span className="text-xs text-muted-foreground">{rotulo}</span>
        ) : (
          <span className="text-sm leading-none font-medium">{rotulo}</span>
        ))}
      {children}
    </>
  );
  const classes = cn(compacto ? "flex flex-col gap-1" : "space-y-2", className);
  return alvo ? (
    <Alvo nome={alvo} className={classes}>
      {conteudo}
    </Alvo>
  ) : (
    <div className={classes}>{conteudo}</div>
  );
}

export function CampoSimulado({
  alvo,
  rotulo,
  valor,
  placeholder,
  compacto,
  className,
}: {
  alvo?: string;
  rotulo?: string;
  valor?: string;
  placeholder?: string;
  compacto?: boolean;
  className?: string;
}) {
  return (
    <Envoltorio alvo={alvo} rotulo={rotulo} compacto={compacto} className={className}>
      <div className={cn(CAIXA, !valor && "text-muted-foreground")}>
        <span className="truncate">{valor || placeholder || "\u00a0"}</span>
      </div>
    </Envoltorio>
  );
}

export function SelectSimulado({
  alvo,
  rotulo,
  valor,
  compacto,
  className,
}: {
  alvo?: string;
  rotulo?: string;
  valor?: string;
  compacto?: boolean;
  className?: string;
}) {
  return (
    <Envoltorio alvo={alvo} rotulo={rotulo} compacto={compacto} className={className}>
      <div className={cn(CAIXA, "justify-between gap-1.5 pr-2")}>
        <span className="truncate">{valor || "\u00a0"}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </div>
    </Envoltorio>
  );
}

export function BotaoSimulado({
  alvo,
  variant,
  size,
  largo,
  className,
  children,
}: VariantProps<typeof buttonVariants> & {
  alvo?: string;
  /** Ocupa a largura toda, como os botões de enviar dos formulários. */
  largo?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const botao = <span className={cn(buttonVariants({ variant, size }), largo && "w-full", className)}>{children}</span>;
  return alvo ? (
    <Alvo nome={alvo} className={largo ? "flex w-full" : "inline-flex"}>
      {botao}
    </Alvo>
  ) : (
    botao
  );
}

/** Imita o `DialogContent` (sem portal nem overlay) para mostrar formulários dentro da cena. */
export function JanelaSimulada({
  titulo,
  className,
  children,
}: {
  titulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto grid w-full max-w-sm gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-md",
        "ring-1 ring-foreground/10",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-heading text-base leading-none font-medium">{titulo}</span>
        <XIcon className="size-4 text-muted-foreground" />
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Escrever o teste do simulador que falha**

O teste renderiza no servidor (`renderToStaticMarkup`), então o ambiente `node` do Vitest basta. Ele confere a ligação entre passo, destaque e texto, que o tipo não garante.

`src/components/ajuda/simulador.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { DefinicaoAjuda, PropsCena, Roteiro } from "@/ajuda/tipos";
import { Alvo, CampoSimulado } from "./campos-simulados";
import { Simulador } from "./simulador";

function CenaTeste({ valores }: PropsCena) {
  return createElement(
    "div",
    null,
    createElement(CampoSimulado, { alvo: "nome", rotulo: "Nome", valor: valores.nome }),
    createElement(Alvo, { nome: "salvar" }, "Salvar"),
  );
}

const ROTEIRO: Roteiro = {
  id: "teste",
  titulo: "Teste",
  quandoUsar: "Para testar.",
  passos: [
    { cena: "cena", alvo: "nome", instrucao: "Digite o nome", explicacao: "Explicação.", preenche: { nome: "Ana" } },
    { cena: "cena", alvo: "salvar", instrucao: "Clique em Salvar", explicacao: "" },
  ],
  eDepois: { texto: "Pronto." },
};

const DEFINICAO: DefinicaoAjuda = {
  tituloTela: "Teste",
  resumo: "",
  tipo: "PAGAR",
  cenas: { cena: CenaTeste },
  roteiros: [ROTEIRO],
};

describe("Simulador", () => {
  const html = renderToStaticMarkup(
    createElement(Simulador, { definicao: DEFINICAO, roteiro: ROTEIRO, aoAbrirRoteiro: () => {} }),
  );

  test("começa no primeiro passo, com o texto e o progresso", () => {
    expect(html).toContain("Digite o nome");
    expect(html).toContain("1 de 2");
  });

  test("destaca só o alvo do passo atual", () => {
    expect(html).toMatch(/data-alvo="nome" data-destacado="true"/);
    expect(html).not.toMatch(/data-alvo="salvar" data-destacado="true"/);
  });

  test("o primeiro passo já mostra o valor que ele preenche", () => {
    expect(html).toContain("Ana");
  });

  test("a cena é decorativa para leitor de tela", () => {
    expect(html).toMatch(/aria-hidden="true"[^>]*inert/);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/components/ajuda/simulador.test.ts`
Expected: FAIL, "Failed to resolve import "./simulador"".

- [ ] **Step 4: Implementar o simulador**

`src/components/ajuda/simulador.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, LightbulbIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ehEDepois, limitarIndice, valoresAte } from "@/ajuda/roteiro";
import type { DefinicaoAjuda, Roteiro } from "@/ajuda/tipos";
import { DestaqueContext } from "./campos-simulados";

/** Um roteiro aberto: cena com destaque, texto do passo e navegação. Monte com `key={roteiro.id}`. */
export function Simulador({
  definicao,
  roteiro,
  aoAbrirRoteiro,
}: {
  definicao: DefinicaoAjuda;
  roteiro: Roteiro;
  aoAbrirRoteiro: (id: string) => void;
}) {
  const [indice, setIndice] = useState(0);
  const area = useRef<HTMLDivElement>(null);

  const fim = ehEDepois(roteiro, indice);
  const passo = fim ? null : roteiro.passos[indice];
  const cenaAtual = (passo ?? roteiro.passos[roteiro.passos.length - 1]).cena;
  const Cena = definicao.cenas[cenaAtual];
  const valores = valoresAte(roteiro, indice);
  const proximo = roteiro.eDepois.proximoRoteiro
    ? definicao.roteiros.find((r) => r.id === roteiro.eDepois.proximoRoteiro)
    : undefined;
  const total = roteiro.passos.length;

  function ir(novo: number) {
    setIndice(limitarIndice(roteiro, novo));
  }

  // Leva o campo destacado para a área visível da cena.
  useEffect(() => {
    if (!passo) return;
    const elemento = area.current?.querySelector(`[data-alvo="${CSS.escape(passo.alvo)}"]`);
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    elemento?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduzir ? "auto" : "smooth" });
  }, [passo]);

  // Setas do teclado enquanto o roteiro está aberto.
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "ArrowRight") {
        evento.preventDefault();
        setIndice((atual) => limitarIndice(roteiro, atual + 1));
      } else if (evento.key === "ArrowLeft") {
        evento.preventDefault();
        setIndice((atual) => limitarIndice(roteiro, atual - 1));
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [roteiro]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="space-y-1">
        <p className="text-sm">
          <span className="font-medium">Quando usar: </span>
          {roteiro.quandoUsar}
        </p>
        {roteiro.quemPode && <p className="text-xs text-muted-foreground">{roteiro.quemPode}</p>}
      </div>

      <div
        ref={area}
        aria-hidden="true"
        inert
        className="min-h-48 flex-1 overflow-auto rounded-lg border bg-background p-4 select-none"
      >
        <DestaqueContext value={passo?.alvo ?? null}>
          <div key={cenaAtual} className="animate-in duration-200 fade-in-0 motion-reduce:animate-none">
            {Cena ? <Cena tipo={definicao.tipo} valores={valores} /> : null}
          </div>
        </DestaqueContext>
      </div>

      <div aria-live="polite" className="space-y-1 rounded-lg border bg-muted/40 p-3">
        {passo ? (
          <>
            <p className="text-xs text-muted-foreground">
              Passo {indice + 1} de {total}
            </p>
            <p className="font-medium">{passo.instrucao}</p>
            {passo.explicacao && <p className="text-muted-foreground">{passo.explicacao}</p>}
            {passo.dica && (
              <p className="mt-2 flex gap-2 rounded-md bg-primary/10 p-2 text-xs">
                <LightbulbIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{passo.dica}</span>
              </p>
            )}
          </>
        ) : (
          <>
            <p className="font-medium">E depois?</p>
            <p className="text-muted-foreground">{roteiro.eDepois.texto}</p>
            {proximo && (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => aoAbrirRoteiro(proximo.id)}>
                Próximo roteiro: {proximo.titulo}
              </Button>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => ir(indice - 1)} disabled={indice === 0}>
          <ChevronLeftIcon aria-hidden="true" />
          Anterior
        </Button>
        <span className="text-xs text-muted-foreground">{fim ? "Fim" : `${indice + 1} de ${total}`}</span>
        {fim ? (
          <Button variant="outline" size="sm" onClick={() => ir(0)}>
            <RotateCcwIcon aria-hidden="true" />
            Recomeçar
          </Button>
        ) : (
          <Button size="sm" onClick={() => ir(indice + 1)}>
            {indice === total - 1 ? "E depois?" : "Próximo"}
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
```

Observação: `<DestaqueContext value>` é a forma do React 19 (sem `.Provider`). `inert` é prop booleana no React 19.

- [ ] **Step 5: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/components/ajuda/simulador.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Popup (índice + abas + simulador)**

`src/components/ajuda/ajuda-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { Simulador } from "./simulador";

/** Conteúdo do popup de ajuda de uma tela. Fica dentro de um `DialogContent`. */
export function AjudaConteudo({ definicao, roteiroInicial }: { definicao: DefinicaoAjuda; roteiroInicial?: string }) {
  const inicial = definicao.roteiros.some((r) => r.id === roteiroInicial) ? roteiroInicial : undefined;
  const [roteiroId, setRoteiroId] = useState<string | null>(inicial ?? null);
  const roteiro = definicao.roteiros.find((r) => r.id === roteiroId);

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle>Ajuda — {definicao.tituloTela}</DialogTitle>
        <DialogDescription>{definicao.resumo}</DialogDescription>
      </DialogHeader>

      <nav aria-label="Roteiros" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ id: null, titulo: "Início" }, ...definicao.roteiros].map((item) => (
          <button
            key={item.id ?? "inicio"}
            type="button"
            aria-pressed={roteiroId === item.id}
            onClick={() => setRoteiroId(item.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors",
              "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              roteiroId === item.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {item.titulo}
          </button>
        ))}
      </nav>

      {roteiro ? (
        <Simulador key={roteiro.id} definicao={definicao} roteiro={roteiro} aoAbrirRoteiro={setRoteiroId} />
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <p className="text-muted-foreground">
            Escolha o que você quer fazer. Cada roteiro mostra a tela passo a passo, com um exemplo preenchido.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {definicao.roteiros.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setRoteiroId(r.id)}
                  className={cn(
                    "h-full w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  )}
                >
                  <span className="block font-medium">{r.titulo}</span>
                  <span className="block text-muted-foreground">{r.quandoUsar}</span>
                </button>
              </li>
            ))}
          </ul>
          {definicao.observacoes?.map((texto) => (
            <p key={texto} className="text-xs text-muted-foreground">
              {texto}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 7: Botão que abre o popup**

`src/components/ajuda/botao-ajuda.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { CircleHelpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { carregarAjuda, temAjuda, tituloDaAjuda } from "@/ajuda/registro";
import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { AjudaConteudo } from "./ajuda-dialog";

type Estado = { tipo: "carregando" } | { tipo: "pronto"; definicao: DefinicaoAjuda } | { tipo: "erro" };

/**
 * Ícone (ou link) que abre a ajuda de uma tela. Não renderiza nada para tela sem ajuda.
 * O conteúdo é baixado só na primeira abertura.
 */
export function BotaoAjuda({
  tela,
  roteiroInicial,
  gatilho = "icone",
  children,
}: {
  tela: string;
  roteiroInicial?: string;
  gatilho?: "icone" | "link";
  children?: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });

  if (!temAjuda(tela)) return null;
  const titulo = tituloDaAjuda(tela);

  function aoAbrirOuFechar(novo: boolean) {
    setAberto(novo);
    if (novo && estado.tipo !== "pronto") {
      setEstado({ tipo: "carregando" });
      carregarAjuda(tela).then(
        (definicao) => setEstado({ tipo: "pronto", definicao }),
        () => setEstado({ tipo: "erro" }),
      );
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrirOuFechar}>
      {gatilho === "icone" ? (
        <DialogTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Ajuda: ${titulo}`} title="Como usar esta tela" />}
        >
          <CircleHelpIcon className="text-muted-foreground" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="link" className="h-auto p-0" />}>{children}</DialogTrigger>
      )}
      <DialogContent
        className={
          "flex h-dvh max-w-full flex-col rounded-none sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-xl"
        }
      >
        {estado.tipo === "pronto" ? (
          <AjudaConteudo definicao={estado.definicao} roteiroInicial={roteiroInicial} />
        ) : (
          <>
            <DialogTitle>Ajuda — {titulo}</DialogTitle>
            {estado.tipo === "carregando" ? (
              <div className="space-y-3" aria-busy="true">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                <div className="h-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
              </div>
            ) : (
              <p className="text-muted-foreground">
                Não foi possível carregar a ajuda. Recarregue a página.{" "}
                <a href="/ajuda/passo-a-passo" className="text-primary underline underline-offset-2">
                  Abrir o Passo a passo
                </a>
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

O `DialogContent` usa `grid` por padrão, e o `cn` (tailwind-merge) troca por `flex`. O popup é desmontado ao fechar, então reabrir volta ao índice, como pede a spec.

- [ ] **Step 8: Tipos e lint**

Run: `Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npx eslint src/components/ajuda src/ajuda`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add src/components/ajuda
git commit -m "feat(ajuda): popup com roteiros guiados e réplica da tela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cenas de Contas a pagar

**Files:**
- Create: `src/ajuda/contas-a-pagar/alvos.ts`
- Create: `src/ajuda/contas-a-pagar/exemplo.ts`
- Create: `src/ajuda/contas-a-pagar/cenas.tsx`
- Test: `src/ajuda/contas-a-pagar/cenas.test.ts`

**Interfaces:**
- Consumes: `PropsCena` (Task 1); `Alvo`, `CampoSimulado`, `SelectSimulado`, `BotaoSimulado`, `JanelaSimulada` (Task 3).
- Produces: `ALVOS` (objeto `as const`, chaves `lista`, `novoTitulo`, `baixa`, `renegociar`), `EXEMPLO`, `OUTROS_TITULOS`, `CenaLista`, `CenaNovoTitulo`, `CenaBaixa`, `CenaRenegociar` (todas `(props: PropsCena) => JSX`).
- Valores especiais lidos pelas cenas, gravados pelos roteiros via `preenche`:
  - `lista.tabela = "sem-exemplo"`: a tabela não mostra o título do exemplo (roteiro de cadastro).
  - `lista.linhaExemplo = "expandida"`: o título do exemplo aparece aberto, com detalhes e parcelas.
  - `lista.filtro.fornecedor` não vazio: a tabela mostra só o título do exemplo.
  - `novo.parcela2`/`novo.parcela3` (e `reneg.parcela2`): definidos = a linha existe. `"preenchida"` = mostra vencimento e valor do exemplo.
  - `novo.parcela1`/`reneg.parcela1 = "preenchida"`: mostra vencimento e valor do exemplo.
  - `novo.tipoComprovante` definido: aparecem os campos da nota e a chave de acesso.
  - Os demais alvos de campo: o valor é o texto exibido.

- [ ] **Step 1: Alvos e exemplo**

`src/ajuda/contas-a-pagar/alvos.ts`:

```ts
/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  lista: [
    "lista.novo",
    "lista.exportar",
    "lista.importar",
    "lista.filtro.classificacao",
    "lista.filtro.categoria",
    "lista.filtro.fornecedor",
    "lista.filtro.status",
    "lista.filtro.vencimentoDe",
    "lista.filtro.vencimentoAte",
    "lista.filtro.limpar",
    "lista.tabela",
    "lista.linhaExemplo",
    "lista.p1.baixar",
    "lista.p2.renegociar",
    "lista.p3.vencimento",
    "lista.p3.alterar",
    "lista.p3.cancelar",
  ],
  novoTitulo: [
    "novo.fornecedor",
    "novo.documento",
    "novo.emissao",
    "novo.competencia",
    "novo.categoria",
    "novo.centroCusto",
    "novo.centroLucro",
    "novo.safra",
    "novo.projeto",
    "novo.conta",
    "novo.formaPagamento",
    "novo.classificacao",
    "novo.tipoComprovante",
    "novo.numeroNota",
    "novo.serie",
    "novo.emissaoNota",
    "novo.chave",
    "novo.parcelas",
    "novo.parcela1",
    "novo.parcela2",
    "novo.parcela3",
    "novo.adicionarParcela",
    "novo.salvar",
  ],
  baixa: ["baixa.data", "baixa.valorPago", "baixa.juros", "baixa.multa", "baixa.desconto", "baixa.conta", "baixa.registrar"],
  renegociar: ["reneg.parcela1", "reneg.parcela2", "reneg.adicionar", "reneg.confirmar"],
} as const;
```

`src/ajuda/contas-a-pagar/exemplo.ts`:

```ts
/** A história usada em todos os roteiros de Contas a pagar. Dados fictícios e fixos. */
export const EXEMPLO = {
  fornecedor: "Agro Insumos Ltda",
  documento: "NF-e 1234",
  emissao: "10/09/2026",
  competencia: "10/09/2026",
  categoria: "Insumos Agrícolas",
  centroCusto: "Lavoura",
  safra: "2025/26",
  conta: "Banco do Brasil — CC 12345-6",
  formaPagamento: "Boleto",
  classificacao: "Fiscal (com documento)",
  tipoComprovante: "NF-e",
  numeroNota: "1234",
  serie: "1",
  chave: "4126 0912 3456 7800 0199 5500 1000 0012 3410 0012 3456",
  parcelas: [
    { numero: 1, vencimento: "10/10/2026", valor: "1000,00", valorFormatado: "R$ 1.000,00", status: "VENCIDO" },
    { numero: 2, vencimento: "10/11/2026", valor: "1000,00", valorFormatado: "R$ 1.000,00", status: "VENCIDO" },
    { numero: 3, vencimento: "10/12/2026", valor: "1000,00", valorFormatado: "R$ 1.000,00", status: "A_VENCER" },
  ],
  renegociacao: [
    { vencimento: "25/11/2026", valor: "500,00" },
    { vencimento: "25/12/2026", valor: "500,00" },
  ],
} as const;

/** Outros títulos da lista, para a réplica não parecer vazia. */
export const OUTROS_TITULOS = [
  {
    documento: "Fatura 556",
    classificacao: "Fiscal",
    contraparte: "Energia Rural S.A.",
    categoria: "Energia elétrica",
    parcelas: 1,
  },
  {
    documento: "Recibo 88",
    classificacao: "Gerencial",
    contraparte: "José da Silva",
    categoria: "Mão de obra temporária",
    parcelas: 1,
  },
] as const;
```

- [ ] **Step 2: Escrever o teste das cenas que falha**

`src/ajuda/contas-a-pagar/cenas.test.ts`:

```ts
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { PropsCena } from "@/ajuda/tipos";
import { CenaBaixa, CenaLista, CenaNovoTitulo, CenaRenegociar } from "./cenas";

const html = (componente: ComponentType<PropsCena>, valores: Record<string, string> = {}) =>
  renderToStaticMarkup(createElement(componente, { tipo: "PAGAR", valores }));

describe("cenas de Contas a pagar", () => {
  test("lista mostra o título do exemplo fechado por padrão", () => {
    const saida = html(CenaLista);
    expect(saida).toContain("Contas a pagar");
    expect(saida).toContain("NF-e 1234");
    expect(saida).not.toContain("Parcela 1");
  });

  test("lista expandida mostra as parcelas e as ações", () => {
    const saida = html(CenaLista, { "lista.linhaExemplo": "expandida" });
    expect(saida).toContain("Parcela 1 — venc. 10/10/2026");
    expect(saida).toContain('data-alvo="lista.p2.renegociar"');
    // A parcela 3 não está vencida: não tem Renegociar.
    expect(saida).not.toContain('data-alvo="lista.p3.renegociar"');
  });

  test("lista sem o exemplo, para o roteiro de cadastro", () => {
    expect(html(CenaLista, { "lista.tabela": "sem-exemplo" })).not.toContain("NF-e 1234");
  });

  test("filtro de fornecedor deixa só o título do exemplo", () => {
    const saida = html(CenaLista, { "lista.filtro.fornecedor": "Agro Insumos Ltda" });
    expect(saida).toContain("NF-e 1234");
    expect(saida).not.toContain("Fatura 556");
  });

  test("contas a receber troca os rótulos", () => {
    const saida = renderToStaticMarkup(createElement(CenaLista, { tipo: "RECEBER", valores: {} }));
    expect(saida).toContain("Contas a receber");
    expect(saida).toContain("Cliente");
  });

  test("novo título mostra os campos da nota só depois do tipo de comprovante", () => {
    expect(html(CenaNovoTitulo)).not.toContain("Nº da nota");
    expect(html(CenaNovoTitulo, { "novo.tipoComprovante": "NF-e" })).toContain("Nº da nota");
  });

  test("novo título cria as linhas de parcela conforme os valores", () => {
    expect(html(CenaNovoTitulo)).not.toContain('data-alvo="novo.parcela2"');
    const saida = html(CenaNovoTitulo, { "novo.parcela2": "preenchida" });
    expect(saida).toContain('data-alvo="novo.parcela2"');
    expect(saida).toContain("10/11/2026");
  });

  test("baixa e renegociação têm os títulos da tela real", () => {
    expect(html(CenaBaixa)).toContain("Registrar baixa (fica pendente de aprovação)");
    expect(html(CenaRenegociar)).toContain("Confirmar renegociação");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda/contas-a-pagar/cenas.test.ts`
Expected: FAIL, "Failed to resolve import "./cenas"".

- [ ] **Step 4: Implementar as cenas**

`src/ajuda/contas-a-pagar/cenas.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Alvo,
  BotaoSimulado,
  CampoSimulado,
  JanelaSimulada,
  SelectSimulado,
} from "@/components/ajuda/campos-simulados";
import type { PropsCena, TipoTela } from "@/ajuda/tipos";
import { EXEMPLO, OUTROS_TITULOS } from "./exemplo";

// Espelho de src/app/(dashboard)/financeiro/_titulos/*. Mudou um rótulo ou campo lá? Ajuste aqui também.

const rotuloContraparte = (tipo: TipoTela) => (tipo === "PAGAR" ? "Fornecedor" : "Cliente");
const sufixo = (tipo: TipoTela) => (tipo === "PAGAR" ? "a pagar" : "a receber");
const VARIANTE_STATUS: Record<string, "default" | "secondary" | "destructive"> = {
  PAGO: "default",
  VENCIDO: "destructive",
};

function BarraDeFiltros({ tipo, valores }: PropsCena) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SelectSimulado
        alvo="lista.filtro.classificacao"
        compacto
        rotulo="Classificação"
        valor={valores["lista.filtro.classificacao"] || "Todas"}
        className="w-40"
      />
      <SelectSimulado
        alvo="lista.filtro.categoria"
        compacto
        rotulo="Categoria"
        valor={valores["lista.filtro.categoria"] || "Todas"}
        className="w-48"
      />
      <SelectSimulado
        alvo="lista.filtro.fornecedor"
        compacto
        rotulo={rotuloContraparte(tipo)}
        valor={valores["lista.filtro.fornecedor"] || "Todos"}
        className="w-48"
      />
      <SelectSimulado compacto rotulo="Centro de custo" valor="Todos" className="w-48" />
      <SelectSimulado compacto rotulo="Centro de lucro" valor="Todos" className="w-48" />
      <SelectSimulado compacto rotulo="Safra" valor="Todas" className="w-48" />
      <SelectSimulado compacto rotulo="Projeto" valor="Todos" className="w-48" />
      <SelectSimulado
        alvo="lista.filtro.status"
        compacto
        rotulo="Status"
        valor={valores["lista.filtro.status"] || "Todos os status"}
        className="w-48"
      />
      <CampoSimulado
        alvo="lista.filtro.vencimentoDe"
        compacto
        rotulo="Vencimento de"
        valor={valores["lista.filtro.vencimentoDe"]}
        placeholder="dd/mm/aaaa"
        className="w-40"
      />
      <CampoSimulado
        alvo="lista.filtro.vencimentoAte"
        compacto
        rotulo="Vencimento até"
        valor={valores["lista.filtro.vencimentoAte"]}
        placeholder="dd/mm/aaaa"
        className="w-40"
      />
      <BotaoSimulado alvo="lista.filtro.limpar" variant="outline" size="sm">
        Limpar filtros
      </BotaoSimulado>
    </div>
  );
}

function Detalhe({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-1">
      <dt className="text-muted-foreground">{rotulo}:</dt>
      <dd>{valor}</dd>
    </div>
  );
}

function LinhasDoExemplo({ valores }: Pick<PropsCena, "valores">) {
  const expandido = valores["lista.linhaExemplo"] === "expandida";
  return (
    <>
      <TableRow className={expandido ? "bg-muted/50" : undefined}>
        <TableCell>
          <Alvo nome="lista.linhaExemplo" className="inline-flex flex-col p-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{EXEMPLO.documento}</span>
              <Badge variant="outline">Fiscal</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {EXEMPLO.tipoComprovante} nº {EXEMPLO.numeroNota} / série {EXEMPLO.serie}
            </div>
          </Alvo>
        </TableCell>
        <TableCell>{EXEMPLO.fornecedor}</TableCell>
        <TableCell>{EXEMPLO.categoria}</TableCell>
        <TableCell className="text-right">{EXEMPLO.parcelas.length}</TableCell>
        <TableCell className="text-right">
          <BotaoSimulado variant="outline" size="sm">
            Editar
          </BotaoSimulado>
        </TableCell>
      </TableRow>
      {expandido && (
        <>
          <TableRow className="bg-muted/30">
            <TableCell colSpan={5}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <Detalhe rotulo="Emissão" valor={EXEMPLO.emissao} />
                <Detalhe rotulo="Competência" valor={EXEMPLO.competencia} />
                <Detalhe rotulo="Centro de custo" valor={EXEMPLO.centroCusto} />
                <Detalhe rotulo="Centro de lucro" valor="—" />
                <Detalhe rotulo="Safra" valor={EXEMPLO.safra} />
                <Detalhe rotulo="Projeto" valor="—" />
                <Detalhe rotulo="Conta bancária" valor={EXEMPLO.conta} />
                <Detalhe rotulo="Forma de pagamento" valor={EXEMPLO.formaPagamento} />
                <Detalhe rotulo="Classificação" valor="Fiscal" />
                <Detalhe rotulo="Comprovante" valor={EXEMPLO.tipoComprovante} />
              </dl>
            </TableCell>
          </TableRow>
          {EXEMPLO.parcelas.map((parcela) => {
            const p = `lista.p${parcela.numero}`;
            return (
              <TableRow key={parcela.numero} className="bg-muted/30">
                <TableCell colSpan={3} className="pl-8">
                  Parcela {parcela.numero} — venc. {parcela.vencimento} — valor {parcela.valorFormatado}
                </TableCell>
                <TableCell>
                  <Badge variant={VARIANTE_STATUS[parcela.status] ?? "secondary"}>{parcela.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <div className="flex items-center gap-1">
                      <CampoSimulado
                        alvo={`${p}.vencimento`}
                        valor={valores[`${p}.vencimento`] ?? parcela.vencimento}
                        className="w-32"
                      />
                      <BotaoSimulado alvo={`${p}.alterar`} variant="outline" size="sm">
                        Alterar vencimento
                      </BotaoSimulado>
                    </div>
                    <BotaoSimulado alvo={`${p}.baixar`} size="sm">
                      Baixar
                    </BotaoSimulado>
                    {parcela.status === "VENCIDO" && (
                      <BotaoSimulado alvo={`${p}.renegociar`} variant="outline" size="sm">
                        Renegociar
                      </BotaoSimulado>
                    )}
                    <BotaoSimulado alvo={`${p}.cancelar`} variant="outline" size="sm">
                      Cancelar
                    </BotaoSimulado>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="bg-muted/30">
            <TableCell colSpan={5}>
              <div className="space-y-2 py-2 pl-8 text-sm">
                <div className="font-medium text-muted-foreground">Anexos</div>
                <CampoSimulado placeholder="Escolher arquivo — nenhum arquivo escolhido" className="max-w-sm" />
              </div>
            </TableCell>
          </TableRow>
        </>
      )}
    </>
  );
}

export function CenaLista({ tipo, valores }: PropsCena) {
  const semExemplo = valores["lista.tabela"] === "sem-exemplo";
  const filtrado = Boolean(valores["lista.filtro.fornecedor"]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{tipo === "PAGAR" ? "Contas a pagar" : "Contas a receber"}</p>
          <p className="text-sm text-muted-foreground">Títulos e parcelas {sufixo(tipo)} da filial ativa.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Alvo nome="lista.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
            <span>Exportar CSV</span>
            <span>Exportar Excel</span>
            <span>Exportar PDF</span>
          </Alvo>
          <BotaoSimulado alvo="lista.novo">Novo título {sufixo(tipo)}</BotaoSimulado>
        </div>
      </div>
      <BarraDeFiltros tipo={tipo} valores={valores} />
      <div className="space-y-4">
        <div className="flex justify-end">
          <BotaoSimulado alvo="lista.importar" variant="outline">
            Importar CSV
          </BotaoSimulado>
        </div>
        <Alvo nome="lista.tabela">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>{rotuloContraparte(tipo)}</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Parcelas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!filtrado &&
                OUTROS_TITULOS.map((titulo) => (
                  <TableRow key={titulo.documento}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{titulo.documento}</span>
                        <Badge variant={titulo.classificacao === "Fiscal" ? "outline" : "secondary"}>
                          {titulo.classificacao}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>{titulo.contraparte}</TableCell>
                    <TableCell>{titulo.categoria}</TableCell>
                    <TableCell className="text-right">{titulo.parcelas}</TableCell>
                    <TableCell className="text-right">
                      <BotaoSimulado variant="outline" size="sm">
                        Editar
                      </BotaoSimulado>
                    </TableCell>
                  </TableRow>
                ))}
              {!semExemplo && <LinhasDoExemplo valores={valores} />}
            </TableBody>
          </Table>
        </Alvo>
      </div>
    </div>
  );
}

function LinhaDeParcela({
  alvo,
  valores,
  vencimento,
  valor,
  removivel,
}: {
  alvo: string;
  valores: PropsCena["valores"];
  vencimento: string;
  valor: string;
  removivel: boolean;
}) {
  const preenchida = valores[alvo] === "preenchida";
  return (
    <Alvo nome={alvo} className="flex items-end gap-2 p-1">
      <CampoSimulado valor={preenchida ? vencimento : undefined} placeholder="dd/mm/aaaa" />
      <CampoSimulado valor={preenchida ? valor : undefined} placeholder="Valor" />
      {removivel && (
        <BotaoSimulado variant="outline" size="sm">
          Remover
        </BotaoSimulado>
      )}
    </Alvo>
  );
}

export function CenaNovoTitulo({ tipo, valores }: PropsCena) {
  const comNota = Boolean(valores["novo.tipoComprovante"]);
  const linhas = [1, 2, 3].filter((n) => n === 1 || valores[`novo.parcela${n}`] !== undefined);
  return (
    <JanelaSimulada titulo="Novo título">
      <SelectSimulado alvo="novo.fornecedor" rotulo={rotuloContraparte(tipo)} valor={valores["novo.fornecedor"]} />
      <CampoSimulado alvo="novo.documento" rotulo="Documento" valor={valores["novo.documento"]} />
      <div className="grid grid-cols-2 gap-4">
        <CampoSimulado alvo="novo.emissao" rotulo="Emissão" valor={valores["novo.emissao"]} placeholder="dd/mm/aaaa" />
        <CampoSimulado
          alvo="novo.competencia"
          rotulo="Competência"
          valor={valores["novo.competencia"]}
          placeholder="dd/mm/aaaa"
        />
      </div>
      <SelectSimulado alvo="novo.categoria" rotulo="Categoria financeira" valor={valores["novo.categoria"]} />
      <div className="grid grid-cols-2 gap-4">
        <SelectSimulado alvo="novo.centroCusto" rotulo="Centro de custo" valor={valores["novo.centroCusto"] ?? "Nenhum"} />
        <SelectSimulado alvo="novo.centroLucro" rotulo="Centro de lucro" valor={valores["novo.centroLucro"] ?? "Nenhum"} />
        <SelectSimulado alvo="novo.safra" rotulo="Safra" valor={valores["novo.safra"] ?? "Nenhum"} />
        <SelectSimulado alvo="novo.projeto" rotulo="Projeto" valor={valores["novo.projeto"] ?? "Nenhum"} />
      </div>
      <SelectSimulado alvo="novo.conta" rotulo="Conta bancária prevista" valor={valores["novo.conta"] ?? "Nenhuma"} />
      <CampoSimulado
        alvo="novo.formaPagamento"
        rotulo="Forma de pagamento"
        valor={valores["novo.formaPagamento"]}
        placeholder="Opcional (ex.: Boleto, PIX)"
      />
      <Separator />
      <p className="text-sm font-medium">Documento fiscal</p>
      <div className="grid grid-cols-2 gap-4">
        <SelectSimulado
          alvo="novo.classificacao"
          rotulo="Classificação"
          valor={valores["novo.classificacao"] ?? EXEMPLO.classificacao}
        />
        <SelectSimulado
          alvo="novo.tipoComprovante"
          rotulo="Tipo de comprovante"
          valor={valores["novo.tipoComprovante"] ?? "Nenhum"}
        />
      </div>
      {comNota && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <CampoSimulado alvo="novo.numeroNota" rotulo="Nº da nota" valor={valores["novo.numeroNota"]} />
            <CampoSimulado alvo="novo.serie" rotulo="Série" valor={valores["novo.serie"]} />
            <CampoSimulado
              alvo="novo.emissaoNota"
              rotulo="Emissão da nota"
              valor={valores["novo.emissaoNota"]}
              placeholder="dd/mm/aaaa"
            />
          </div>
          <Alvo nome="novo.chave" className="space-y-2">
            <CampoSimulado
              rotulo="Chave de acesso"
              valor={valores["novo.chave"]}
              placeholder="44 dígitos (pode colar com espaços)"
            />
            <p className="text-xs text-muted-foreground">
              {valores["novo.chave"] ? "Chave válida" : "Opcional — sem ela o título fica como pendência fiscal"}
            </p>
          </Alvo>
        </>
      )}
      <Alvo nome="novo.parcelas" className="space-y-2">
        <span className="text-sm leading-none font-medium">Parcelas</span>
        {linhas.map((n) => (
          <LinhaDeParcela
            key={n}
            alvo={`novo.parcela${n}`}
            valores={valores}
            vencimento={EXEMPLO.parcelas[n - 1].vencimento}
            valor={EXEMPLO.parcelas[n - 1].valor}
            removivel={linhas.length > 1}
          />
        ))}
        <BotaoSimulado alvo="novo.adicionarParcela" variant="outline" size="sm">
          Adicionar parcela
        </BotaoSimulado>
      </Alvo>
      <BotaoSimulado alvo="novo.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaBaixa({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Registrar baixa">
      <div className="grid grid-cols-2 gap-4">
        <CampoSimulado alvo="baixa.data" rotulo="Data" valor={valores["baixa.data"]} placeholder="dd/mm/aaaa" />
        <CampoSimulado alvo="baixa.valorPago" rotulo="Valor pago" valor={valores["baixa.valorPago"]} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <CampoSimulado alvo="baixa.juros" rotulo="Juros" valor={valores["baixa.juros"] ?? "0"} />
        <CampoSimulado alvo="baixa.multa" rotulo="Multa" valor={valores["baixa.multa"] ?? "0"} />
        <CampoSimulado alvo="baixa.desconto" rotulo="Desconto" valor={valores["baixa.desconto"] ?? "0"} />
      </div>
      <SelectSimulado alvo="baixa.conta" rotulo="Conta bancária" valor={valores["baixa.conta"]} />
      <BotaoSimulado alvo="baixa.registrar" largo>
        Registrar baixa (fica pendente de aprovação)
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaRenegociar({ valores }: PropsCena) {
  const linhas = [1, 2].filter((n) => n === 1 || valores[`reneg.parcela${n}`] !== undefined);
  return (
    <JanelaSimulada titulo="Renegociar parcela">
      <div className="space-y-4">
        {linhas.map((n) => {
          const alvo = `reneg.parcela${n}`;
          const preenchida = valores[alvo] === "preenchida";
          const nova = EXEMPLO.renegociacao[n - 1];
          return (
            <Alvo key={n} nome={alvo} className="flex gap-2 p-1">
              <CampoSimulado valor={preenchida ? nova.vencimento : undefined} placeholder="dd/mm/aaaa" />
              <CampoSimulado valor={preenchida ? nova.valor : undefined} placeholder="Valor" />
            </Alvo>
          );
        })}
        <BotaoSimulado alvo="reneg.adicionar" variant="outline" size="sm">
          Adicionar nova parcela
        </BotaoSimulado>
        <BotaoSimulado alvo="reneg.confirmar" largo>
          Confirmar renegociação
        </BotaoSimulado>
      </div>
    </JanelaSimulada>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda/contas-a-pagar/cenas.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 6: Tipos e lint**

Run: `Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npx eslint src/ajuda`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/ajuda/contas-a-pagar/alvos.ts src/ajuda/contas-a-pagar/exemplo.ts src/ajuda/contas-a-pagar/cenas.tsx src/ajuda/contas-a-pagar/cenas.test.ts
git commit -m "feat(ajuda): réplica das telas de Contas a pagar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Roteiros de Contas a pagar e botão na tela

**Files:**
- Create: `src/ajuda/contas-a-pagar/roteiros.ts`
- Create: `src/ajuda/contas-a-pagar/index.ts`
- Test: `src/ajuda/contas-a-pagar/roteiros.test.ts`
- Modify: `src/ajuda/registro.ts` (entrada `contas-a-pagar`)
- Modify: `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx:73-76`

**Interfaces:**
- Consumes: `construtorDeRoteiros` (Task 1), `ALVOS`/cenas (Task 4), `BotaoAjuda` (Task 3).
- Produces: `ROTEIROS: readonly Roteiro[]` com os ids `cadastrar-titulo`, `pagar-parcela`, `mudar-vencimento`, `renegociar`, `cancelar-parcela`, `encontrar-exportar`; `ajudaContasAPagar: DefinicaoAjuda`; o registro passa a ter `contas-a-pagar`.

- [ ] **Step 1: Escrever o teste de conteúdo que falha**

O teste mais importante do plano: para cada passo de cada roteiro, renderiza a cena com os valores daquele passo e confere que o alvo destacado existe na tela. Assim, um passo nunca aponta para um campo que ainda não apareceu (ex.: "Nº da nota" antes de escolher o tipo de comprovante).

`src/ajuda/contas-a-pagar/roteiros.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { valoresAte } from "@/ajuda/roteiro";
import { ajudaContasAPagar } from "./index";

const { roteiros, cenas } = ajudaContasAPagar;

describe("roteiros de Contas a pagar", () => {
  test("são os 6 roteiros da spec, com ids únicos", () => {
    expect(roteiros.map((r) => r.id)).toEqual([
      "cadastrar-titulo",
      "pagar-parcela",
      "mudar-vencimento",
      "renegociar",
      "cancelar-parcela",
      "encontrar-exportar",
    ]);
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s tem conteúdo completo", (_id, roteiro) => {
    expect(roteiro.passos.length).toBeGreaterThan(0);
    expect(roteiro.quandoUsar.trim()).not.toBe("");
    expect(roteiro.eDepois.texto.trim()).not.toBe("");
    if (roteiro.eDepois.proximoRoteiro) {
      expect(roteiros.some((r) => r.id === roteiro.eDepois.proximoRoteiro)).toBe(true);
    }
    for (const passo of roteiro.passos) {
      expect(passo.instrucao.trim()).not.toBe("");
      expect(cenas[passo.cena]).toBeDefined();
    }
  });

  test.each(roteiros.map((r) => [r.id, r] as const))("%s: o alvo de cada passo aparece na cena", (_id, roteiro) => {
    roteiro.passos.forEach((passo, indice) => {
      const html = renderToStaticMarkup(
        createElement(cenas[passo.cena], { tipo: "PAGAR", valores: valoresAte(roteiro, indice) }),
      );
      expect(html, `passo ${indice + 1} (${passo.alvo})`).toContain(`data-alvo="${passo.alvo}"`);
    });
  });

  test("nenhum passo repete a instrução do anterior", () => {
    for (const roteiro of roteiros) {
      roteiro.passos.slice(1).forEach((passo, i) => {
        expect(passo.instrucao).not.toBe(roteiro.passos[i].instrucao);
      });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda/contas-a-pagar/roteiros.test.ts`
Expected: FAIL, "Failed to resolve import "./index"".

- [ ] **Step 3: Escrever os roteiros**

`src/ajuda/contas-a-pagar/roteiros.ts`:

```ts
import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { EXEMPLO } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_LANCA = "Quem pode: perfis Administrador e Financeiro, com permissão de alteração na filial.";
const QUEM_BAIXA = "Quem pode: perfis Administrador, Financeiro e Tesouraria, com permissão de alteração na filial.";

const ABRIR_TITULO = {
  cena: "lista",
  alvo: "lista.linhaExemplo",
  instrucao: "Encontre o título e clique na linha dele",
  explicacao:
    "Clicar na linha abre, logo abaixo, os detalhes do título e as parcelas, cada uma com os seus botões. " +
    "Se a lista for grande, use os filtros de cima para achar o título mais rápido.",
  preenche: { "lista.linhaExemplo": "expandida" },
} as const;

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "cadastrar-titulo",
    titulo: "Cadastrar um título a pagar",
    quandoUsar:
      "Sempre que surgir uma conta a pagar: chegou uma nota de compra, um boleto, uma fatura ou um acordo com " +
      "fornecedor. O título registra a dívida e quando vence cada parte dela.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.novo",
        instrucao: "Clique em “Novo título a pagar”",
        explicacao: "O botão fica no alto da tela, à direita. Ele abre uma janela com o formulário do título.",
        preenche: { "lista.tabela": "sem-exemplo" },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.fornecedor",
        instrucao: "Escolha o fornecedor",
        explicacao:
          `Clique na caixa e escolha na lista quem vai receber o dinheiro. No exemplo, a ${EXEMPLO.fornecedor}, ` +
          "que vendeu o adubo.",
        dica:
          "O fornecedor não aparece na lista? Então ele ainda não foi cadastrado. Cadastre primeiro em " +
          "Cadastros → Fornecedores e depois volte aqui.",
        preenche: { "novo.fornecedor": EXEMPLO.fornecedor },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.documento",
        instrucao: "Digite o documento",
        explicacao:
          "É o nome que identifica o título na lista. Use algo fácil de reconhecer depois, como o número da nota " +
          "ou do boleto.",
        preenche: { "novo.documento": EXEMPLO.documento },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.emissao",
        instrucao: "Informe a data de emissão",
        explicacao: "É a data em que o documento foi emitido. Ela está impressa na nota ou no boleto.",
        preenche: { "novo.emissao": EXEMPLO.emissao },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.competencia",
        instrucao: "Informe a competência",
        explicacao:
          "Competência é o mês a que a despesa pertence, mesmo que ela seja paga depois. O adubo foi comprado em " +
          "setembro, então a competência é setembro, ainda que as parcelas vençam de outubro a dezembro.",
        dica: "Na dúvida, use a mesma data da emissão.",
        preenche: { "novo.competencia": EXEMPLO.competencia },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.categoria",
        instrucao: "Escolha a categoria financeira",
        explicacao:
          "A categoria diz que tipo de gasto é este. É ela que agrupa as despesas no fluxo de caixa, no orçamento " +
          "e nos relatórios. Escolha a que melhor descreve a compra.",
        dica:
          "Não achou uma categoria que sirva? Peça para quem cuida dos cadastros criar uma em Cadastros → " +
          "Categorias financeiras. Usar uma parecida bagunça os relatórios.",
        preenche: { "novo.categoria": EXEMPLO.categoria },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.centroCusto",
        instrucao: "Escolha o centro de custo (opcional)",
        explicacao:
          "O centro de custo diz qual área da fazenda gastou. Centro de lucro, safra e projeto funcionam do mesmo " +
          "jeito: são opcionais e servem para separar os números nos relatórios. Deixe em “Nenhum” o que não se " +
          "aplica.",
        preenche: { "novo.centroCusto": EXEMPLO.centroCusto },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.safra",
        instrucao: "Escolha a safra (opcional)",
        explicacao:
          "Marque a safra quando o gasto for de uma safra, como insumos para a lavoura. Assim a comparação entre " +
          "safras mostra quanto cada uma custou.",
        preenche: { "novo.safra": EXEMPLO.safra },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.conta",
        instrucao: "Escolha a conta bancária prevista (opcional)",
        explicacao:
          "É a conta de onde você pretende pagar, usada na previsão do fluxo de caixa. Na hora de pagar, dá para " +
          "usar outra conta.",
        preenche: { "novo.conta": EXEMPLO.conta },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.formaPagamento",
        instrucao: "Informe a forma de pagamento (opcional)",
        explicacao: "Escreva como vai pagar: boleto, PIX, transferência. É só uma anotação.",
        preenche: { "novo.formaPagamento": EXEMPLO.formaPagamento },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.classificacao",
        instrucao: "Confira a classificação",
        explicacao:
          "Fiscal quando existe documento oficial (nota fiscal, guia, contrato). Gerencial quando a compra foi " +
          "sem nota e é controlada só internamente. O sistema já sugere a classificação do cadastro do fornecedor. " +
          "A compra do adubo tem nota, então fica Fiscal.",
        preenche: { "novo.classificacao": EXEMPLO.classificacao },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.tipoComprovante",
        instrucao: "Escolha o tipo de comprovante",
        explicacao:
          "Diga qual documento você tem em mãos. Para nota fiscal de produto, escolha NF-e. Depois de escolher, " +
          "aparecem os campos da nota.",
        preenche: { "novo.tipoComprovante": EXEMPLO.tipoComprovante },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.numeroNota",
        instrucao: "Preencha número, série e data de emissão da nota",
        explicacao: "Os três estão no alto da nota fiscal impressa (o DANFE).",
        dica:
          "A nota ainda não chegou? Pode salvar sem o número e completar depois, pelo botão Editar do título. " +
          "Enquanto faltar, o título aparece na lista com um triângulo amarelo de pendência.",
        preenche: {
          "novo.numeroNota": EXEMPLO.numeroNota,
          "novo.serie": EXEMPLO.serie,
          "novo.emissaoNota": EXEMPLO.emissao,
        },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.chave",
        instrucao: "Cole a chave de acesso",
        explicacao:
          "É o número de 44 dígitos impresso no DANFE, perto do código de barras. Pode colar com os espaços. " +
          "Embaixo do campo, o sistema avisa se a chave está certa.",
        preenche: { "novo.chave": EXEMPLO.chave },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.parcela1",
        instrucao: "Preencha a primeira parcela",
        explicacao:
          "Em Parcelas, informe o vencimento e o valor da primeira parcela. No valor, digite só o número, sem R$ " +
          "e sem ponto de milhar: 1000,00.",
        dica: "Compra à vista? Deixe uma parcela só, com o valor total.",
        preenche: { "novo.parcela1": "preenchida" },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.adicionarParcela",
        instrucao: "Clique em “Adicionar parcela” para cada parcela a mais",
        explicacao:
          "A compra foi em 3 vezes, então clique duas vezes. Cada clique cria uma linha nova. Criou uma linha a " +
          "mais? Use o botão “Remover” dela.",
        preenche: { "novo.parcela2": "vazia", "novo.parcela3": "vazia" },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.parcelas",
        instrucao: "Preencha as outras parcelas",
        explicacao:
          "Uma linha por parcela, cada uma com o seu vencimento e o seu valor. Confira se a soma dá o total da " +
          "nota: 1.000 + 1.000 + 1.000 = 3.000.",
        preenche: { "novo.parcela2": "preenchida", "novo.parcela3": "preenchida" },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.salvar",
        instrucao: "Clique em Salvar",
        explicacao:
          "Se faltar algum campo obrigatório, aparece uma mensagem em vermelho acima do botão dizendo o que " +
          "corrigir.",
      },
    ],
    eDepois: {
      texto:
        "A janela fecha e o título aparece na lista de Contas a pagar. Clique na linha dele para ver os detalhes " +
        "e as três parcelas. O sistema marca sozinho as parcelas perto de vencer (A_VENCER, até 7 dias antes) e as " +
        "vencidas (VENCIDO). Quando o dinheiro sair da conta, registre o pagamento com o botão Baixar.",
      proximoRoteiro: "pagar-parcela",
    },
  }),

  roteiro({
    id: "pagar-parcela",
    titulo: "Pagar uma parcela (baixa)",
    quandoUsar:
      "Depois que o dinheiro saiu da conta: o boleto foi pago, o PIX foi feito. A baixa registra o pagamento de " +
      "uma parcela.",
    quemPode: QUEM_BAIXA,
    passos: [
      ABRIR_TITULO,
      {
        cena: "lista",
        alvo: "lista.p1.baixar",
        instrucao: "Clique em “Baixar” na parcela que foi paga",
        explicacao:
          "No exemplo, a parcela 1, que venceu em 10/10/2026. O botão só aparece em parcela que ainda não foi " +
          "paga, cancelada ou renegociada.",
      },
      {
        cena: "baixa",
        alvo: "baixa.data",
        instrucao: "Informe a data do pagamento",
        explicacao:
          "É o dia em que o dinheiro saiu da conta, como aparece no comprovante ou no extrato. Não é a data do " +
          "vencimento.",
        preenche: { "baixa.data": "15/10/2026" },
      },
      {
        cena: "baixa",
        alvo: "baixa.valorPago",
        instrucao: "Informe o valor pago",
        explicacao:
          "É o total que saiu da conta, igual ao comprovante: valor da parcela + juros + multa − desconto. A " +
          "parcela foi paga 5 dias atrasada, com R$ 12,00 de juros: 1.000,00 + 12,00 = 1012,00.",
        dica:
          "Pagou menos que o valor da parcela? Tudo bem: a parcela fica como PARCIALMENTE_PAGO e o restante " +
          "continua em aberto, esperando outra baixa.",
        preenche: { "baixa.valorPago": "1012,00" },
      },
      {
        cena: "baixa",
        alvo: "baixa.juros",
        instrucao: "Informe juros, multa e desconto, se houver",
        explicacao:
          "Esses campos só detalham de onde veio a diferença no valor pago. No exemplo, R$ 12,00 vão em Juros. " +
          "Multa e Desconto ficam em 0 quando não existem.",
        preenche: { "baixa.juros": "12,00" },
      },
      {
        cena: "baixa",
        alvo: "baixa.conta",
        instrucao: "Escolha a conta de onde saiu o dinheiro",
        explicacao:
          "Use a conta que aparece no comprovante. É nela que o sistema lança a saída, depois da aprovação.",
        preenche: { "baixa.conta": EXEMPLO.conta },
      },
      {
        cena: "baixa",
        alvo: "baixa.registrar",
        instrucao: "Clique em “Registrar baixa”",
        explicacao:
          "O próprio botão avisa: a baixa fica pendente de aprovação. Por enquanto a parcela ainda não aparece " +
          "como paga.",
      },
    ],
    eDepois: {
      texto:
        "A baixa vai para Financeiro → Aprovações pendentes. Quem tem permissão de aprovar confere e clica em " +
        "Aprovar. Se a empresa exige aprovação por outra pessoa (o padrão), quem registrou a baixa não pode " +
        "aprová-la. Depois de aprovada, o sistema lança a saída na conta escolhida e a parcela fica PAGO. Se for " +
        "rejeitada, a parcela continua em aberto e nenhum lançamento é feito.",
      proximoRoteiro: "mudar-vencimento",
    },
  }),

  roteiro({
    id: "mudar-vencimento",
    titulo: "Mudar o vencimento",
    quandoUsar: "Quando o fornecedor aceitou mudar a data de uma parcela, sem mudar o valor.",
    quemPode: QUEM_LANCA,
    passos: [
      ABRIR_TITULO,
      {
        cena: "lista",
        alvo: "lista.p3.vencimento",
        instrucao: "Troque a data no campo da parcela",
        explicacao:
          "Cada parcela em aberto tem um campo de data ao lado dos botões, já com o vencimento atual. Na parcela " +
          "3, troque 10/12/2026 por 20/12/2026.",
        preenche: { "lista.p3.vencimento": "20/12/2026" },
      },
      {
        cena: "lista",
        alvo: "lista.p3.alterar",
        instrucao: "Clique em “Alterar vencimento”",
        explicacao: "A nova data é gravada na hora.",
      },
    ],
    eDepois: {
      texto:
        "A parcela passa a vencer na nova data, e a projeção do fluxo de caixa já usa a data nova. O valor não " +
        "muda. Se o valor também mudou, ou se a parcela vai virar várias, use Renegociar.",
      proximoRoteiro: "renegociar",
    },
  }),

  roteiro({
    id: "renegociar",
    titulo: "Renegociar uma parcela vencida",
    quandoUsar:
      "Quando uma parcela venceu e foi combinado pagar de outro jeito: em mais vezes, com outro valor ou em outras " +
      "datas. O botão Renegociar só aparece em parcela vencida.",
    quemPode: QUEM_LANCA,
    passos: [
      ABRIR_TITULO,
      {
        cena: "lista",
        alvo: "lista.p2.renegociar",
        instrucao: "Clique em “Renegociar” na parcela vencida",
        explicacao:
          "No exemplo, a parcela 2, de R$ 1.000,00, venceu em 10/11/2026. Foi combinado pagar em duas vezes de " +
          "R$ 500,00.",
      },
      {
        cena: "renegociar",
        alvo: "reneg.parcela1",
        instrucao: "Preencha a primeira parcela nova",
        explicacao: "Vencimento e valor da primeira parte do acordo: 25/11/2026 e 500,00.",
        preenche: { "reneg.parcela1": "preenchida" },
      },
      {
        cena: "renegociar",
        alvo: "reneg.adicionar",
        instrucao: "Clique em “Adicionar nova parcela”",
        explicacao: "Cada clique cria mais uma linha. Uma linha para cada parcela nova do acordo.",
        preenche: { "reneg.parcela2": "vazia" },
      },
      {
        cena: "renegociar",
        alvo: "reneg.parcela2",
        instrucao: "Preencha a segunda parcela nova",
        explicacao:
          "25/12/2026 e 500,00. Se o acordo incluiu juros, as parcelas novas podem somar mais que a parcela " +
          "original.",
        preenche: { "reneg.parcela2": "preenchida" },
      },
      {
        cena: "renegociar",
        alvo: "reneg.confirmar",
        instrucao: "Clique em “Confirmar renegociação”",
        explicacao: "Antes de clicar, confira as datas e os valores: a renegociação não pode ser desfeita.",
      },
    ],
    eDepois: {
      texto:
        "A parcela original fica como RENEGOCIADO e não aceita mais baixa nem outra renegociação. As parcelas " +
        "novas entram no mesmo título, com os próximos números (no exemplo, 4 e 5), e são pagas normalmente pelo " +
        "botão Baixar.",
      proximoRoteiro: "cancelar-parcela",
    },
  }),

  roteiro({
    id: "cancelar-parcela",
    titulo: "Cancelar uma parcela",
    quandoUsar:
      "Quando uma parcela não vai mais ser paga: a compra foi desfeita, o fornecedor perdoou a dívida ou o título " +
      "foi lançado em dobro.",
    quemPode: QUEM_LANCA,
    passos: [
      ABRIR_TITULO,
      {
        cena: "lista",
        alvo: "lista.p3.cancelar",
        instrucao: "Clique em “Cancelar” na parcela",
        explicacao: "Atenção: o sistema não pergunta se você tem certeza. O clique já cancela a parcela.",
        dica:
          "Mudou só a data? Não cancele: use Alterar vencimento. Combinou pagar de outro jeito? Use Renegociar.",
      },
    ],
    eDepois: {
      texto:
        "A parcela fica como CANCELADO, sai da projeção do fluxo de caixa e não aceita mais baixa. O " +
        "cancelamento não pode ser desfeito: se foi por engano, cadastre um título novo com o valor da parcela.",
      proximoRoteiro: "encontrar-exportar",
    },
  }),

  roteiro({
    id: "encontrar-exportar",
    titulo: "Encontrar e exportar títulos",
    quandoUsar:
      "Para achar títulos numa lista grande ou tirar um relatório: o que vence este mês, o que está atrasado com " +
      "um fornecedor, tudo de uma categoria.",
    passos: [
      {
        cena: "lista",
        alvo: "lista.filtro.fornecedor",
        instrucao: "Escolha o fornecedor no filtro",
        explicacao:
          "A barra de filtros fica acima da lista. Cada filtro escolhido já atualiza a lista na hora: não há botão " +
          "de buscar.",
        preenche: { "lista.filtro.fornecedor": EXEMPLO.fornecedor },
      },
      {
        cena: "lista",
        alvo: "lista.filtro.status",
        instrucao: "Escolha o status",
        explicacao:
          "VENCIDO mostra só os títulos que têm alguma parcela vencida. Os filtros se somam: agora a lista mostra " +
          "títulos da Agro Insumos com parcela vencida.",
        preenche: { "lista.filtro.status": "VENCIDO" },
      },
      {
        cena: "lista",
        alvo: "lista.filtro.vencimentoDe",
        instrucao: "Use o período de vencimento quando precisar",
        explicacao:
          "Vencimento de e Vencimento até limitam a lista a um intervalo de datas, como o mês que vem. Deixe em " +
          "branco para não limitar.",
      },
      {
        cena: "lista",
        alvo: "lista.tabela",
        instrucao: "Confira o resultado",
        explicacao:
          "A lista mostra só o que passou por todos os filtros. Se nada passar, aparece a mensagem “Nenhum título " +
          "encontrado para os filtros selecionados”.",
      },
      {
        cena: "lista",
        alvo: "lista.exportar",
        instrucao: "Exporte, se precisar de um arquivo",
        explicacao:
          "Exportar PDF gera um relatório pronto para imprimir ou enviar. CSV e Excel servem para fazer contas na " +
          "planilha. O arquivo tem uma linha por parcela e respeita os filtros escolhidos.",
      },
      {
        cena: "lista",
        alvo: "lista.filtro.limpar",
        instrucao: "Clique em “Limpar filtros” para voltar à lista completa",
        explicacao: "Todos os filtros voltam para “Todos” de uma vez.",
        preenche: { "lista.filtro.fornecedor": "", "lista.filtro.status": "" },
      },
    ],
    eDepois: {
      texto:
        "Os filtros ficam guardados no endereço da página. Dá para salvar nos favoritos do navegador uma busca que " +
        "você usa sempre, como “vencidas da Agro Insumos”.",
    },
  }),
];
```

- [ ] **Step 4: Definição da tela e registro**

`src/ajuda/contas-a-pagar/index.ts`:

```ts
import type { DefinicaoAjuda } from "@/ajuda/tipos";
import { CenaBaixa, CenaLista, CenaNovoTitulo, CenaRenegociar } from "./cenas";
import { ROTEIROS } from "./roteiros";

export const ajudaContasAPagar: DefinicaoAjuda = {
  tituloTela: "Contas a pagar",
  resumo: "Tudo o que a fazenda deve: cada título com as suas parcelas, do cadastro ao pagamento.",
  tipo: "PAGAR",
  cenas: { lista: CenaLista, novoTitulo: CenaNovoTitulo, baixa: CenaBaixa, renegociar: CenaRenegociar },
  roteiros: ROTEIROS,
  observacoes: [
    "Para cadastrar muitos títulos de uma vez a partir de uma planilha, use o botão Importar CSV, acima da " +
      "lista. O formato do arquivo está no Passo a passo, seção 3.1.",
  ],
};
```

Em `src/ajuda/registro.ts`, troque a constante vazia por:

```ts
const REGISTRO: Readonly<Record<string, EntradaRegistro>> = {
  "contas-a-pagar": {
    titulo: "Contas a pagar",
    carregar: () => import("./contas-a-pagar").then((modulo) => modulo.ajudaContasAPagar),
  },
};
```

E acrescente ao `src/ajuda/registro.test.ts`:

```ts
  test("contas a pagar tem ajuda e carrega a definição", async () => {
    expect(temAjuda("contas-a-pagar")).toBe(true);
    expect(tituloDaAjuda("contas-a-pagar")).toBe("Contas a pagar");
    const definicao = await carregarAjuda("contas-a-pagar");
    expect(definicao.roteiros.length).toBe(6);
  });
```

- [ ] **Step 5: Rodar e ver passar**

Run: `Set-Location D:\Projetos\nx-control-erp; npx vitest run src/ajuda src/components/ajuda`
Expected: PASS em todos. Se um passo falhar em "o alvo de cada passo aparece na cena", o erro diz o número do passo e o alvo. Corrija o `preenche` do passo anterior ou a cena, nunca o teste.

- [ ] **Step 6: Botão na tela**

Em `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`, adicione o import:

```tsx
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
```

e troque:

```tsx
        <div>
          <h1 className="text-lg font-semibold">Contas a pagar</h1>
```

por:

```tsx
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-lg font-semibold">Contas a pagar</h1>
            <BotaoAjuda tela="contas-a-pagar" />
          </div>
```

- [ ] **Step 7: Tipos, lint e suíte completa**

Run: `Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npx eslint src/ajuda src/components/ajuda "src/app/(dashboard)/financeiro/contas-a-pagar"; npx vitest run`
Expected: sem erros. A suíte inteira passa (os testes de integração usam o Postgres de dev).

- [ ] **Step 8: Commit**

```bash
git add src/ajuda "src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx"
git commit -m "feat(financeiro): ajuda com simulação em Contas a pagar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Links "Ver simulação" no Passo a passo

**Files:**
- Modify: `src/components/markdown-content.tsx:27-31` (renderizador `a`)
- Modify: `content/ajuda/passo-a-passo.md` (Introdução e seção 3.1)

**Interfaces:**
- Consumes: `lerLinkAjuda` (Task 2), `temAjuda` (Task 2), `BotaoAjuda` com `gatilho="link"` (Task 3).

- [ ] **Step 1: Renderizador de links**

Em `src/components/markdown-content.tsx`, adicione os imports:

```tsx
import { lerLinkAjuda } from "@/ajuda/link";
import { temAjuda } from "@/ajuda/registro";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
```

e troque o renderizador `a`:

```tsx
  a: ({ children, href }) => {
    const destino = lerLinkAjuda(href);
    if (destino) {
      // Link para a ajuda de uma tela: abre o mesmo popup do ícone. Tela sem ajuda vira texto comum.
      return temAjuda(destino.tela) ? (
        <BotaoAjuda tela={destino.tela} roteiroInicial={destino.roteiro} gatilho="link">
          {children}
        </BotaoAjuda>
      ) : (
        <span>{children}</span>
      );
    }
    return (
      <a href={href} className="text-primary underline underline-offset-2">
        {children}
      </a>
    );
  },
```

- [ ] **Step 2: Manual**

Em `content/ajuda/passo-a-passo.md`, na seção "Como este manual está organizado" (linha ~11), acrescente um parágrafo ao fim da seção:

```md
Algumas telas têm um ícone **?** ao lado do título. Ele abre a ajuda da própria tela, com roteiros que mostram a tela passo a passo, já preenchida com um exemplo. Os links **Ver simulação** deste manual abrem a mesma ajuda.
```

Na seção 3.1, logo depois do primeiro parágrafo ("As telas Contas a pagar e Contas a receber funcionam de forma idêntica..."), acrescente:

```md
**Ver simulação (Contas a pagar):** [cadastrar um título](#ajuda/contas-a-pagar/cadastrar-titulo) · [pagar uma parcela](#ajuda/contas-a-pagar/pagar-parcela) · [mudar o vencimento](#ajuda/contas-a-pagar/mudar-vencimento) · [renegociar](#ajuda/contas-a-pagar/renegociar) · [cancelar](#ajuda/contas-a-pagar/cancelar-parcela) · [encontrar e exportar](#ajuda/contas-a-pagar/encontrar-exportar)
```

- [ ] **Step 3: Tipos e lint**

Run: `Set-Location D:\Projetos\nx-control-erp; npx tsc --noEmit; npx eslint src/components/markdown-content.tsx`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/markdown-content.tsx content/ajuda/passo-a-passo.md
git commit -m "feat(ajuda): links do Passo a passo abrem a simulação da tela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Comentários de espelho, conferência no navegador e docs

**Files:**
- Modify: `src/app/(dashboard)/financeiro/_titulos/titulo-dialog-form.tsx`, `secao-documento-fiscal.tsx`, `baixa-dialog.tsx`, `renegociar-dialog.tsx`, `titulo-table.tsx`, `barra-de-filtros.tsx` (uma linha de comentário no topo, depois do `"use client"`)
- Modify: `docs/superpowers/specs/2026-11-19-ajuda-contextual-design.md`

- [ ] **Step 1: Comentário de espelho**

Logo depois da linha `"use client";` de cada um dos 6 arquivos, acrescente:

```tsx
// Espelhado na ajuda (src/ajuda/contas-a-pagar/cenas.tsx): mudou rótulo, campo ou botão? Ajuste a ajuda junto.
```

- [ ] **Step 2: Build de produção**

Run: `Set-Location D:\Projetos\nx-control-erp; npm run build`
Expected: build sem erros. Isso pega problemas de fronteira servidor/cliente: o `markdown-content.tsx` (servidor) importa o `registro.ts`, que tem um `import()` de módulos `"use client"`. Se o build reclamar disso, mova o `import()` do registro para dentro do `BotaoAjuda` (um mapa de carregadores só no cliente) e deixe no `registro.ts` só os títulos.

- [ ] **Step 3: Subir o app**

Seguir a memória "Armadilhas do ambiente dev": `npx prisma generate` se preciso, porta 3000 livre, login local. Run (em background): `npm run dev`.

- [ ] **Step 4: Conferir no navegador (Playwright)**

Em `/financeiro/contas-a-pagar`, logado como Administrador:
1. O ícone ? aparece ao lado do título. O foco por teclado (Tab) chega nele e o leitor anuncia "Ajuda: Contas a pagar".
2. Clicar abre o índice com 6 cartões e o aviso de Importar CSV.
3. Percorrer os 6 roteiros até o "E depois?", com o mouse e com as setas ← →. Em cada passo, o campo destacado fica visível na cena (rola sozinho) e o texto corresponde ao campo.
4. Comparar a cena "Novo título" e a "Registrar baixa" com os formulários reais abertos na mesma tela: mesmos rótulos e mesma ordem. Em especial, conferir que os selects opcionais reais mostram "Nenhum"/"Nenhuma" como a réplica. Se a tela real mostrar outra coisa, ajustar a cena.
5. Fechar e reabrir: volta ao índice. "Próximo roteiro" no "E depois?" abre o roteiro seguinte.
6. Repetir em tema escuro e em 390×844 (celular): popup em tela cheia, botões de navegação sempre visíveis, sem rolagem horizontal da página (a cena pode rolar dentro da caixa dela).
7. `/ajuda/passo-a-passo`: os links "Ver simulação" da seção 3.1 abrem o popup direto no roteiro certo.
8. Console sem erros nem avisos de hidratação.

- [ ] **Step 5: Teste do critério de sucesso**

Seguindo **só** os roteiros 1 e 2, cadastrar de verdade um título de teste em Contas a pagar e registrar a baixa da parcela 1. Anotar qualquer passo em que foi preciso adivinhar algo e corrigir o texto do roteiro. Depois, cancelar as parcelas do título de teste (ou rejeitar a baixa) para não sujar a base de dev.

- [ ] **Step 6: Atualizar a spec**

Em `docs/superpowers/specs/2026-11-19-ajuda-contextual-design.md`:
- Status: `Data: 2026-11-19 · Status: implementada (2026-11-19)`.
- Seção "O exemplo": trocar as datas de março–junho pelas do código (emissão 10/09/2026; parcelas 10/10, 10/11 e 10/12/2026; parcelas 1 e 2 vencidas, 3 a vencer).
- Tabela de roteiros, linha 5: "Cancelar" não tem confirmação na tela real. O passo avisa que o clique já cancela.
- Seção "Tipos": cada passo diz a sua cena (`cena` obrigatório no passo, sem herança do roteiro). Os tipos vêm de `construtorDeRoteiros<typeof ALVOS>()`. A cena de filtros é a própria cena da lista.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/financeiro/_titulos" docs/superpowers/specs/2026-11-19-ajuda-contextual-design.md content/ajuda/passo-a-passo.md src/ajuda
git commit -m "docs(ajuda): espelho da réplica, ajustes da conferência e status da spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
