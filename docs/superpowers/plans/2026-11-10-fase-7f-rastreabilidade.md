# Fase 7f — Rastreabilidade · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consulta de um lote para trás e para frente, até os clientes da polpa derivada, com o destino de cada kg e exportação em PDF (completo), CSV e Excel (clientes atingidos).

**Architecture:** Um serviço de leitura (`rastreabilidade.ts`) monta a árvore com consultas fixas: lote, OPs envolvidas, itens de pedido e movimentos. A profundidade é fixa (fruto → OP → polpa → pedido), então não há recursão. Funções puras calculam o destino do lote. A tela é um Server Component com busca por GET. A exportação reaproveita `responderExport` (CSV/Excel) e um `gerarPdfSecoes` novo, que generaliza o `gerarPdf` atual.

**Tech Stack:** Next.js (App Router, Server Components), Prisma/PostgreSQL, Vitest, pdf-lib, shadcn/ui.

**Spec:** [docs/superpowers/specs/2026-11-10-fase-7f-rastreabilidade-design.md](../specs/2026-11-10-fase-7f-rastreabilidade-design.md)

## Global Constraints

- Sem mudança no schema e sem migration.
- Tudo restrito a `sessao.filialId`; permissão `producao:ler` (tela, serviço e exportação).
- Cancelados (pedido `CANCELADO`, OP `CANCELADA`, linha com `removidoEm`) ocultos por padrão; `incluirCancelados` os traz marcados (D-23). Destino do lote vem do ledger e não muda com a opção.
- Recall conservador: fruto → todos os clientes de qualquer polpa das OPs que o consumiram, sem rateio (D-22).
- Nada de laço de consultas por lote, OP ou pedido.
- Textos de interface em português; sem Prettier no arquivo inteiro. Arquivos têm CRLF: editar com a ferramenta Edit.
- Testes usam o Postgres de dev (`docker` `nx-control-erp-db`). Rodar com `npx vitest run <arquivo>`.
- Commits pequenos, mensagem em português no padrão `tipo(producao): ...`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch: `feat/fase-7f-rastreabilidade` (já criada a partir de `staging`).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/export/pdf.ts` (modificar) | `SecaoPdf`, `secaoPdf`, `gerarPdfSecoes`; `gerarPdf` passa a delegar. |
| `src/lib/export/responder.ts` (modificar) | `responderArquivoPdf` para PDFs montados fora do `responderExport`. |
| `src/lib/producao/destinoLote.ts` (novo) | `destinoDoLote` e `linhasDoDestino` (puras). |
| `src/server/services/ordemProducao.ts` (modificar) | Exportar `dadosDoResumo` e `linhasEmNumeros`. |
| `src/server/services/rastreabilidade.ts` (novo) | Tipos, `normalizarCodigo`, `descreverOrigem`, `buscarLotes`, `rastrearLote`. |
| `src/server/export/rastreabilidade.ts` (novo) | `COLUNAS_CLIENTES` e `secoesDoRastreio` (PDF). |
| `src/app/(dashboard)/producao/rastreabilidade/export/route.ts` (novo) | Exportação. |
| `src/app/(dashboard)/producao/_shared/link-rastreio.tsx` (novo) | `hrefRastreio` e `LinkRastreio`. |
| `src/app/(dashboard)/producao/_shared/status-lote-badge.tsx` (novo) | `StatusLoteBadge` (sai do estoque). |
| `src/app/(dashboard)/producao/rastreabilidade/page.tsx` (novo) | Tela. |
| `src/app/(dashboard)/producao/rastreabilidade/cartoes.tsx` (novo) | Cartões da tela. |
| `src/app/(dashboard)/nav-items.ts` (+ teste) | Item no menu. |
| Estoque, recepção, detalhe da OP, detalhe do pedido | Código do lote vira link para a rastreabilidade. |
| `content/ajuda/passo-a-passo.md`, docs 03, 08, 09, spec | Ajuda e decisões. |

---

### Task 1: PDF em seções

**Files:**
- Modify: `src/lib/export/pdf.ts` (função `gerarPdf`, linhas ~155–288)
- Modify: `src/lib/export/responder.ts`
- Test: `src/lib/export/pdf.test.ts`, `src/lib/export/responder.test.ts`

**Interfaces:**
- Produces:
  - `type SecaoPdf<T> = { titulo?: string; linhas: T[]; colunas: ColunaExport<T>[] }`
  - `secaoPdf<T>(secao: SecaoPdf<T>): SecaoPdf<unknown>`
  - `gerarPdfSecoes(secoes: SecaoPdf<unknown>[], cabecalho: CabecalhoPdf, agora?: Date): Promise<Uint8Array>`
  - `responderArquivoPdf(bytes: Uint8Array, nomeArquivo: string): Response` (nome final `<nomeArquivo>-AAAA-MM-DD.pdf`)

- [ ] **Step 1: Testes que falham**

Em `pdf.test.ts`, importar `gerarPdfSecoes` e `secaoPdf` junto com o que já é importado e acrescentar no fim:

```ts
describe("gerarPdfSecoes", () => {
  type Item = { rotulo: string; kg: number };
  const COLUNAS_ITEM: ColunaExport<Item>[] = [
    { rotulo: "Item", valor: (i) => i.rotulo },
    { rotulo: "kg", valor: (i) => i.kg },
  ];

  test("várias seções, uma vazia, num PDF válido", async () => {
    const bytes = await gerarPdfSecoes(
      [
        secaoPdf({ titulo: "Lote", linhas: [LINHA], colunas: COLUNAS }),
        secaoPdf({ titulo: "Destino", linhas: [] as Item[], colunas: COLUNAS_ITEM }),
        secaoPdf({ titulo: "Itens", linhas: [{ rotulo: "Entrada", kg: 10 }], colunas: COLUNAS_ITEM }),
      ],
      { titulo: "Rastreabilidade", linhas: ["Empresa — Matriz"] },
      AGORA,
    );
    const documento = await PDFDocument.load(bytes);
    expect(documento.getTitle()).toBe("Rastreabilidade");
    expect(documento.getPageCount()).toBe(1);
  });

  test("seção longa quebra página", async () => {
    const muitas = Array.from({ length: 120 }, (_, n) => ({ rotulo: `Linha ${n}`, kg: n }));
    const bytes = await gerarPdfSecoes(
      [secaoPdf({ titulo: "Primeira", linhas: muitas, colunas: COLUNAS_ITEM }), secaoPdf({ titulo: "Segunda", linhas: muitas, colunas: COLUNAS_ITEM })],
      { titulo: "Longo", linhas: [] },
      AGORA,
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });
});
```

Em `responder.test.ts`, importar `responderArquivoPdf` e acrescentar:

```ts
describe("responderArquivoPdf", () => {
  test("PDF como anexo com a data no nome", () => {
    const resposta = responderArquivoPdf(new Uint8Array([37, 80, 68, 70]), "rastreabilidade-FA-261110-01");
    expect(resposta.headers.get("Content-Type")).toBe("application/pdf");
    expect(resposta.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="rastreabilidade-FA-261110-01-\d{4}-\d{2}-\d{2}\.pdf"$/,
    );
    expect(resposta.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/export/pdf.test.ts src/lib/export/responder.test.ts`
Expected: FAIL (`gerarPdfSecoes`/`secaoPdf`/`responderArquivoPdf` não exportados).

- [ ] **Step 3: Implementar `gerarPdfSecoes`**

Em `pdf.ts`, logo depois de `TAMANHO_RODAPE`, acrescentar `const TAMANHO_TITULO_SECAO = 10;`. Substituir a função `gerarPdf` inteira (do comentário `/** Tabela simples em A4 paisagem...` até o `return documento.save();` final) por:

```ts
export type SecaoPdf<T> = {
  /** Título acima da tabela; sem título, a tabela vem logo após o cabeçalho do documento. */
  titulo?: string;
  linhas: T[];
  colunas: ColunaExport<T>[];
};

/** Apaga o tipo da linha para juntar seções de tipos diferentes no mesmo relatório. */
export function secaoPdf<T>(secao: SecaoPdf<T>): SecaoPdf<unknown> {
  return secao as unknown as SecaoPdf<unknown>;
}

/**
 * Tabela simples em A4 paisagem: título e contexto na 1ª página, cabeçalho das
 * colunas repetido em toda página, zebra nas linhas, números alinhados à
 * direita e rodapé "Página X de Y". Usa as mesmas `ColunaExport` do CSV/Excel.
 */
export async function gerarPdf<T>(
  linhas: T[],
  colunas: ColunaExport<T>[],
  cabecalho: CabecalhoPdf,
  agora: Date = new Date(),
): Promise<Uint8Array> {
  return gerarPdfSecoes([secaoPdf({ linhas, colunas })], cabecalho, agora);
}

/** Como `gerarPdf`, com várias tabelas em sequência, cada uma com título e colunas próprias. */
export async function gerarPdfSecoes(
  secoes: SecaoPdf<unknown>[],
  cabecalho: CabecalhoPdf,
  agora: Date = new Date(),
): Promise<Uint8Array> {
  const documento = await PDFDocument.create();
  documento.setTitle(cabecalho.titulo);
  documento.setCreator("NX Control ERP");
  documento.setProducer("NX Control ERP");
  documento.setCreationDate(agora);

  const fonte = await documento.embedFont(StandardFonts.Helvetica);
  const negrito = await documento.embedFont(StandardFonts.HelveticaBold);
  const limpar = criarSanitizador(fonte);

  const paginas: PDFPage[] = [];
  let pagina!: PDFPage;
  let y = 0;
  const limiteInferior = MARGEM + ALTURA_RODAPE;

  const novaPagina = () => {
    pagina = documento.addPage([LARGURA_PAGINA, ALTURA_PAGINA]);
    paginas.push(pagina);
    y = ALTURA_PAGINA - MARGEM;
  };

  novaPagina();
  pagina.drawText(limpar(cabecalho.titulo), { x: MARGEM, y: y - TAMANHO_TITULO, size: TAMANHO_TITULO, font: negrito, color: COR_TEXTO });
  y -= TAMANHO_TITULO + 6;
  for (const linha of cabecalho.linhas) {
    for (const trecho of quebrarEmLinhas(limpar(linha), fonte, TAMANHO_CONTEXTO, LARGURA_UTIL, 3)) {
      pagina.drawText(trecho, { x: MARGEM, y: y - TAMANHO_CONTEXTO, size: TAMANHO_CONTEXTO, font: fonte, color: COR_SECUNDARIA });
      y -= TAMANHO_CONTEXTO * 1.35;
    }
  }
  y -= 8;

  secoes.forEach((secao, indiceSecao) => {
    const { colunas } = secao;
    const rotulos = colunas.map((coluna) => limpar(coluna.rotulo));
    const celulas = secao.linhas.map((linha) =>
      colunas.map((coluna) => {
        const valor = coluna.valor(linha);
        return { texto: limpar(formatarValorPdf(coluna, valor)), numerico: typeof valor === "number" };
      }),
    );

    const naturais = colunas.map((_, indice) => {
      const maiorPalavraRotulo = Math.max(...rotulos[indice].split(" ").map((p) => negrito.widthOfTextAtSize(p, TAMANHO_TABELA)));
      const maiorCelula = celulas.reduce(
        (maior, linha) => Math.max(maior, fonte.widthOfTextAtSize(linha[indice].texto, TAMANHO_TABELA)),
        0,
      );
      return Math.max(maiorPalavraRotulo, maiorCelula, LARGURA_MINIMA_COLUNA - 2 * RESPIRO_X) + 2 * RESPIRO_X;
    });
    const larguras = calcularLargurasColunas(naturais, LARGURA_UTIL);
    // Coluna de números: o título acompanha o alinhamento à direita dos valores.
    const colunaNumerica = colunas.map((_, indice) => celulas.some((linha) => linha[indice].numerico));
    const larguraTexto = (indice: number) => larguras[indice] - 2 * RESPIRO_X;

    const linhasRotulo = rotulos.map((rotulo, indice) =>
      quebrarEmLinhas(rotulo, negrito, TAMANHO_TABELA, larguraTexto(indice), 3),
    );
    const alturaCabecalhoTabela = Math.max(...linhasRotulo.map((l) => l.length)) * ENTRELINHA + 2 * RESPIRO_Y;

    const desenharCabecalhoTabela = () => {
      pagina.drawRectangle({ x: MARGEM, y: y - alturaCabecalhoTabela, width: LARGURA_UTIL, height: alturaCabecalhoTabela, color: COR_FUNDO_CABECALHO });
      let x = MARGEM;
      linhasRotulo.forEach((linhasDaCelula, indice) => {
        linhasDaCelula.forEach((texto, n) => {
          const xTexto = colunaNumerica[indice]
            ? x + larguras[indice] - RESPIRO_X - negrito.widthOfTextAtSize(texto, TAMANHO_TABELA)
            : x + RESPIRO_X;
          pagina.drawText(texto, { x: xTexto, y: y - RESPIRO_Y - (n + 1) * ENTRELINHA + 2, size: TAMANHO_TABELA, font: negrito, color: COR_TEXTO });
        });
        x += larguras[indice];
      });
      y -= alturaCabecalhoTabela;
    };

    if (indiceSecao > 0) y -= 14;
    // Título, cabeçalho e a primeira linha juntos: nada de título sozinho no pé da página.
    const alturaTitulo = secao.titulo ? TAMANHO_TITULO_SECAO + 6 : 0;
    if (y - alturaTitulo - alturaCabecalhoTabela - (ENTRELINHA + 2 * RESPIRO_Y) < limiteInferior) novaPagina();
    if (secao.titulo) {
      pagina.drawText(limpar(secao.titulo), { x: MARGEM, y: y - TAMANHO_TITULO_SECAO, size: TAMANHO_TITULO_SECAO, font: negrito, color: COR_TEXTO });
      y -= alturaTitulo;
    }
    desenharCabecalhoTabela();

    if (celulas.length === 0) {
      pagina.drawText("Nenhum registro encontrado.", { x: MARGEM + RESPIRO_X, y: y - RESPIRO_Y - ENTRELINHA + 2, size: TAMANHO_TABELA, font: fonte, color: COR_SECUNDARIA });
      y -= ENTRELINHA + 2 * RESPIRO_Y;
    }

    celulas.forEach((linha, numeroLinha) => {
      const quebradas = linha.map((celula, indice) =>
        quebrarEmLinhas(celula.texto, fonte, TAMANHO_TABELA, larguraTexto(indice), MAX_LINHAS_POR_CELULA),
      );
      const altura = Math.max(...quebradas.map((l) => l.length)) * ENTRELINHA + 2 * RESPIRO_Y;

      if (y - altura < limiteInferior) {
        novaPagina();
        desenharCabecalhoTabela();
      }

      if (numeroLinha % 2 === 1) {
        pagina.drawRectangle({ x: MARGEM, y: y - altura, width: LARGURA_UTIL, height: altura, color: COR_ZEBRA });
      }

      let x = MARGEM;
      quebradas.forEach((linhasDaCelula, indice) => {
        linhasDaCelula.forEach((texto, n) => {
          const larguraDoTexto = fonte.widthOfTextAtSize(texto, TAMANHO_TABELA);
          const xTexto = linha[indice].numerico ? x + larguras[indice] - RESPIRO_X - larguraDoTexto : x + RESPIRO_X;
          pagina.drawText(texto, { x: xTexto, y: y - RESPIRO_Y - (n + 1) * ENTRELINHA + 2, size: TAMANHO_TABELA, font: fonte, color: COR_TEXTO });
        });
        x += larguras[indice];
      });
      y -= altura;
      pagina.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + LARGURA_UTIL, y }, thickness: 0.3, color: COR_LINHA });
    });
  });

  const rodapeEsquerda = limpar(`${cabecalho.titulo} · gerado em ${dataHoraBrasilia(agora)}`);
  paginas.forEach((paginaAtual, indice) => {
    const numeracao = `Página ${indice + 1} de ${paginas.length}`;
    paginaAtual.drawText(rodapeEsquerda, { x: MARGEM, y: MARGEM, size: TAMANHO_RODAPE, font: fonte, color: COR_SECUNDARIA });
    paginaAtual.drawText(numeracao, {
      x: LARGURA_PAGINA - MARGEM - fonte.widthOfTextAtSize(numeracao, TAMANHO_RODAPE),
      y: MARGEM,
      size: TAMANHO_RODAPE,
      font: fonte,
      color: COR_SECUNDARIA,
    });
  });

  return documento.save();
}
```

Antes de colar, confira que o miolo da tabela (larguras, cabeçalho, linhas, rodapé) é o mesmo do `gerarPdf` atual; se o arquivo tiver algo a mais, preserve.

- [ ] **Step 4: Implementar `responderArquivoPdf`**

Em `responder.ts`, depois de `respostaDeArquivo`:

```ts
/** PDF montado fora do `responderExport` (ex.: relatório em seções), com o mesmo nome e cabeçalhos. */
export function responderArquivoPdf(bytes: Uint8Array, nomeArquivo: string): Response {
  return respostaDeArquivo(new Uint8Array(bytes), "application/pdf", `${nomeArquivo}-${dataDoArquivo()}.pdf`);
}
```

- [ ] **Step 5: Rodar os testes de exportação**

Run: `npx vitest run src/lib/export`
Expected: PASS (os testes antigos do `gerarPdf` continuam passando).

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/pdf.ts src/lib/export/pdf.test.ts src/lib/export/responder.ts src/lib/export/responder.test.ts
git commit -m "feat(export): PDF com várias seções"
```

---

### Task 2: Destino do lote (funções puras)

**Files:**
- Create: `src/lib/producao/destinoLote.ts`
- Test: `src/lib/producao/destinoLote.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type MovimentoDoLote = { tipo: TipoMovimentoEstoque; quantidadeKg: number; motivo: MotivoAjusteEstoque | null };
  type DestinoLote = {
    entradaKg: number; estornoEntradaKg: number; vendidoKg: number; consumidoOpKg: number;
    ajustes: { motivo: MotivoAjusteEstoque; kg: number }[]; // líquido, com sinal
    saldoKg: number; confere: boolean;
  };
  destinoDoLote(movimentos: MovimentoDoLote[], saldoKg: number): DestinoLote
  linhasDoDestino(destino: DestinoLote): { rotulo: string; kg: number }[] // com sinal; soma das linhas antes de "Saldo" = saldo
  ```

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "vitest";
import { destinoDoLote, linhasDoDestino, type MovimentoDoLote } from "./destinoLote";

const mov = (tipo: MovimentoDoLote["tipo"], quantidadeKg: number, motivo: MovimentoDoLote["motivo"] = null): MovimentoDoLote => ({
  tipo,
  quantidadeKg,
  motivo,
});

describe("destinoDoLote", () => {
  test("fruto: entrada, OP, OP cancelada, venda e amostra fecham com o saldo", () => {
    const destino = destinoDoLote(
      [
        mov("ENTRADA", 100),
        mov("CONSUMO_OP", -60),
        mov("CONSUMO_OP", -10),
        mov("ESTORNO_CONSUMO_OP", 10),
        mov("VENDA", -20),
        mov("AJUSTE", -1, "AMOSTRA"),
      ],
      19,
    );
    expect(destino).toEqual({
      entradaKg: 100,
      estornoEntradaKg: 0,
      vendidoKg: 20,
      consumidoOpKg: 60,
      ajustes: [{ motivo: "AMOSTRA", kg: -1 }],
      saldoKg: 19,
      confere: true,
    });
  });

  test("polpa removida: produção e estorno; venda cancelada volta", () => {
    const destino = destinoDoLote(
      [mov("PRODUCAO_OP", 40), mov("VENDA", -5), mov("ESTORNO_VENDA", 5), mov("ESTORNO_PRODUCAO_OP", -40)],
      0,
    );
    expect(destino.entradaKg).toBe(40);
    expect(destino.estornoEntradaKg).toBe(40);
    expect(Object.is(destino.vendidoKg, 0)).toBe(true);
    expect(destino.confere).toBe(true);
  });

  test("ajuste sem motivo conta como Outro; saldo divergente não confere", () => {
    const destino = destinoDoLote([mov("ENTRADA", 10), mov("AJUSTE", 2), mov("AJUSTE", -1, "AVARIA")], 5);
    expect(destino.ajustes).toEqual([
      { motivo: "OUTRO", kg: 2 },
      { motivo: "AVARIA", kg: -1 },
    ]);
    expect(destino.confere).toBe(false);
  });
});

describe("linhasDoDestino", () => {
  test("linhas com sinal; estorno só quando houver", () => {
    const linhas = linhasDoDestino(
      destinoDoLote([mov("ENTRADA", 100), mov("CONSUMO_OP", -60), mov("VENDA", -20), mov("AJUSTE", -1, "AMOSTRA")], 19),
    );
    expect(linhas).toEqual([
      { rotulo: "Entrada", kg: 100 },
      { rotulo: "Vendido", kg: -20 },
      { rotulo: "Consumido em OP", kg: -60 },
      { rotulo: "Ajuste: Amostra", kg: -1 },
      { rotulo: "Saldo", kg: 19 },
    ]);
    expect(linhasDoDestino(destinoDoLote([mov("ENTRADA", 5), mov("ESTORNO_RECEPCAO", -5)], 0))[1]).toEqual({
      rotulo: "Estorno da entrada",
      kg: -5,
    });
  });
});
```

Antes, confira o rótulo de `AMOSTRA` em `ROTULOS_MOTIVO_AJUSTE` (`src/lib/schemas/enums.ts`, linha ~150) e ajuste o texto esperado se não for "Amostra".

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/producao/destinoLote.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
import type { MotivoAjusteEstoque, TipoMovimentoEstoque } from "@prisma/client";
import { ROTULOS_MOTIVO_AJUSTE } from "@/lib/schemas/enums";
import { arredondar } from "./arredondar";

/** Movimento do ledger com sinal (saída < 0); `motivo` só no ajuste. */
export type MovimentoDoLote = {
  tipo: TipoMovimentoEstoque;
  quantidadeKg: number;
  motivo: MotivoAjusteEstoque | null;
};

/** Para onde foi cada kg do lote. Campos em kg positivos, salvo `ajustes` (líquido por motivo, com sinal). */
export type DestinoLote = {
  entradaKg: number;
  /** Recepção cancelada ou polpa removida. */
  estornoEntradaKg: number;
  vendidoKg: number;
  consumidoOpKg: number;
  ajustes: { motivo: MotivoAjusteEstoque; kg: number }[];
  saldoKg: number;
  /** A soma dos movimentos bate com o saldo do lote. */
  confere: boolean;
};

// `0 - x` em vez de `-x`: evita "-0" na tela.
const inverter = (kg: number) => 0 - kg;

export function destinoDoLote(movimentos: MovimentoDoLote[], saldoKg: number): DestinoLote {
  const soma = (tipos: TipoMovimentoEstoque[]) =>
    arredondar(
      movimentos.filter((m) => tipos.includes(m.tipo)).reduce((s, m) => s + m.quantidadeKg, 0),
      3,
    );

  const porMotivo = new Map<MotivoAjusteEstoque, number>();
  for (const m of movimentos) {
    if (m.tipo !== "AJUSTE") continue;
    const motivo = m.motivo ?? "OUTRO";
    porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + m.quantidadeKg);
  }

  const total = arredondar(movimentos.reduce((s, m) => s + m.quantidadeKg, 0), 3);
  return {
    entradaKg: soma(["ENTRADA", "PRODUCAO_OP"]),
    estornoEntradaKg: inverter(soma(["ESTORNO_RECEPCAO", "ESTORNO_PRODUCAO_OP"])),
    vendidoKg: inverter(soma(["VENDA", "ESTORNO_VENDA"])),
    consumidoOpKg: inverter(soma(["CONSUMO_OP", "ESTORNO_CONSUMO_OP"])),
    ajustes: [...porMotivo].map(([motivo, kg]) => ({ motivo, kg: arredondar(kg, 3) })),
    saldoKg,
    confere: Math.abs(total - saldoKg) < 0.0005,
  };
}

/** Extrato do lote com sinal: a soma das linhas antes de "Saldo" dá o saldo. */
export function linhasDoDestino(destino: DestinoLote): { rotulo: string; kg: number }[] {
  return [
    { rotulo: "Entrada", kg: destino.entradaKg },
    ...(destino.estornoEntradaKg !== 0 ? [{ rotulo: "Estorno da entrada", kg: inverter(destino.estornoEntradaKg) }] : []),
    { rotulo: "Vendido", kg: inverter(destino.vendidoKg) },
    { rotulo: "Consumido em OP", kg: inverter(destino.consumidoOpKg) },
    ...destino.ajustes.map((a) => ({ rotulo: `Ajuste: ${ROTULOS_MOTIVO_AJUSTE[a.motivo]}`, kg: a.kg })),
    { rotulo: "Saldo", kg: destino.saldoKg },
  ];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/producao/destinoLote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/producao/destinoLote.ts src/lib/producao/destinoLote.test.ts
git commit -m "feat(producao): destino do lote a partir do ledger"
```

---

### Task 3: Serviço de rastreabilidade

**Files:**
- Modify: `src/server/services/ordemProducao.ts` (exportar `dadosDoResumo`, linha ~499, e `linhasEmNumeros`, linha ~699)
- Create: `src/server/services/rastreabilidade.ts`
- Test: `src/server/services/rastreabilidade.test.ts`

**Interfaces:**
- Consumes: `destinoDoLote`, `DestinoLote` (Task 2); `resumirOP`, `ResumoOP` (`src/lib/producao/op.ts`); `statusDoLote`, `StatusLote`; `obterConfiguracaoProducao`.
- Produces (todos exportados de `rastreabilidade.ts`):
  ```ts
  type OrigemDoFruto = { origem: OrigemRecepcao; talhao: string | null; fornecedor: string | null; qualidade: QualidadeFruto | null };
  type RecepcaoRastreio = OrigemDoFruto & { data: Date; pesoBrutoKg: number; descarteKg: number; documento: string | null; cancelada: boolean };
  type OpRastreio = { numero: string; data: Date; status: StatusOrdemProducao; responsavel: string | null;
    branqueamentoTemperaturaC: number | null; branqueamentoTempoS: number | null;
    rendimento: number | null; balanco: ResumoOP["balanco"]; branqueamento: ResumoOP["branqueamento"] };
  type FrutoConsumido = { codigo: string; produto: string; kgConsumido: number; dataRecepcao: Date; origem: OrigemDoFruto | null; removido: boolean };
  type LotePolpaGerado = { codigo: string; produto: string; kg: number; saldoKg: number; removido: boolean };
  type OpConsumidora = OpRastreio & { kgDesteLote: number; consumoRemovido: boolean; lotesPolpa: LotePolpaGerado[] };
  type LinhaCliente = { caminho: "DIRETO" | "POLPA"; loteVendido: string; opNumero: string | null;
    pedidoNumero: number; pedidoData: Date; pedidoCancelado: boolean; kg: number;
    entrega: { status: StatusEntrega; dataPrevista: Date; dataRealizada: Date | null; recebidoPor: string | null } | null;
    cliente: { nome: string; cnpjCpf: string | null; contato: string | null; telefone: string | null; email: string | null; municipio: string | null; enderecoEntrega: string | null } };
  type LoteRastreio = { id: string; codigo: string; produto: string; categoria: CategoriaProduto; data: Date; validade: Date;
    local: string; quantidadeInicialKg: number; saldoKg: number; status: StatusLote };
  type Rastreio = { lote: LoteRastreio; recepcao: RecepcaoRastreio | null; opOrigem: OpRastreio | null;
    frutosConsumidos: FrutoConsumido[]; opsQueConsumiram: OpConsumidora[]; destino: DestinoLote; clientes: LinhaCliente[] };
  type LoteEncontrado = { codigo: string; produto: string; data: Date; saldoKg: number };

  normalizarCodigo(codigo: string): string
  descreverOrigem(origem: OrigemDoFruto | null): string   // "Própria · Talhão 1", "Terceiro · Produtor exemplo", "—"
  buscarLotes(sessao: SessaoAtiva, trecho: string): Promise<LoteEncontrado[]>
  rastrearLote(sessao: SessaoAtiva, codigo: string, opcoes: { incluirCancelados: boolean }): Promise<Rastreio | null>
  ```

- [ ] **Step 1: Exportar os auxiliares da OP**

Em `ordemProducao.ts`, trocar `function dadosDoResumo(` por `export function dadosDoResumo(` e `function linhasEmNumeros(` por `export function linhasEmNumeros(`. Nada mais muda.

- [ ] **Step 2: Teste que falha**

Criar `src/server/services/rastreabilidade.test.ts`. O cenário é montado uma vez, pelos fluxos reais:

- fruto **próprio** (talhão, qualidade A) de 100 kg;
- fruto de **terceiro** de 50 kg;
- fruto **extra** de 30 kg;
- **OP1**, encerrada: consome 60 kg do próprio, 50 do terceiro e 10 do extra (este consumo depois é removido), e produz AGC 40 kg (grosso) e AFN 20 kg (fino);
- **OP2**, cancelada: consome 10 kg do próprio e produz AGC 5 kg;
- **pedido A**: grosso, 10 kg, com entrega;
- **pedido B**: fino, 5 kg, depois cancelado;
- **pedido C**: fruto próprio in natura, 20 kg, retira na propriedade;
- **ajuste** de amostra: −1 kg no fruto próprio.

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/server/db/client";
import { recepcaoSchema } from "@/lib/schemas/recepcao";
import { cabecalhoOPSchema, consumoSchema, processoOPSchema, producaoSchema } from "@/lib/schemas/ordemProducao";
import { pedidoVendaSchema } from "@/lib/schemas/pedidoVenda";
import { ajusteSchema } from "@/lib/schemas/ajusteEstoque";
import {
  configurarVendas,
  criarCadastrosDeVenda,
  criarCatalogoDeTeste,
  criarFixtureProducao,
  type CadastrosDeVenda,
  type CatalogoDeTeste,
  type FixtureProducao,
} from "./producaoTestFixtures";
import { criarRecepcao } from "./recepcaoFruto";
import { adicionarConsumo, adicionarProducao, atualizarProcessoOP, cancelarOP, criarOP, encerrarOP, removerConsumo } from "./ordemProducao";
import { cancelarPedido, criarPedido } from "./pedidoVenda";
import { criarAjuste } from "./ajusteEstoque";
import { buscarLotes, descreverOrigem, rastrearLote } from "./rastreabilidade";

describe("rastreabilidade", () => {
  let fx: FixtureProducao;
  let cat: CatalogoDeTeste;
  let cad: CadastrosDeVenda;
  const adm = () => fx.sessao("ADMINISTRADOR");

  const lotes = { proprio: "", terceiro: "", extra: "", grosso: "", fino: "", grossoOp2: "" };
  const numeros = { op1: "", op2: "", pedidoA: 0, pedidoB: 0, pedidoC: 0 };

  const receber = (extra: Record<string, unknown>) =>
    criarRecepcao(
      adm(),
      recepcaoSchema.parse({ data: "2026-11-10", produtoId: cat.produtoFrutoId, localId: cat.localRecepcaoId, unidade: "KG", descarte: "0", ...extra }),
    );
  const consumir = (opId: string, loteId: string, kg: number) =>
    adicionarConsumo(adm(), opId, consumoSchema.parse({ loteId, quantidadeKg: kg, motivoLiberacaoVencido: "" }));
  const produzir = (opId: string, produtoId: string, kg: number) =>
    adicionarProducao(adm(), opId, producaoSchema.parse({ produtoId, quantidadeKg: kg, localId: cat.localCamaraId }));
  const vender = (loteId: string, kg: number, extra: Record<string, unknown> = {}) =>
    criarPedido(
      adm(),
      pedidoVendaSchema.parse({
        data: "2026-11-10",
        clienteId: cad.clienteId,
        formaPagamento: "A_PRAZO",
        vencimento: "2026-12-10",
        retiraNaPropriedade: "true",
        itens: JSON.stringify([{ loteId, quantidadeKg: kg, precoKg: 10 }]),
        ...extra,
      }),
    );

  beforeAll(async () => {
    fx = await criarFixtureProducao("rastreio");
    cat = await criarCatalogoDeTeste(fx);
    cad = await criarCadastrosDeVenda(fx);
    await configurarVendas(fx, cad);
    await prisma.configuracaoProducao.update({
      where: { filialId: fx.filialAId },
      data: { categoriaCompraFrutoId: cat.categoriaCompraId, prazoPagamentoProdutorDias: 7 },
    });
    await prisma.cliente.update({
      where: { id: cad.clienteId },
      data: { telefone: "(93) 99999-0000", municipio: "Santarém", cnpjCpf: null },
    });

    const proprio = await receber({ origem: "PROPRIA", talhaoId: cat.talhaoId, pesoBruto: "100", qualidade: "A" });
    const terceiro = await receber({ origem: "TERCEIRO", fornecedorId: cat.fornecedorId, pesoBruto: "50", preco: "2" });
    const extra = await receber({ origem: "PROPRIA", talhaoId: cat.talhaoId, pesoBruto: "30" });
    lotes.proprio = proprio.codigoLote;
    lotes.terceiro = terceiro.codigoLote;
    lotes.extra = extra.codigoLote;

    const op1 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId, responsavel: "Joana" }));
    await consumir(op1.id, proprio.loteId, 60);
    await consumir(op1.id, terceiro.loteId, 50);
    const linhaExtra = await consumir(op1.id, extra.loteId, 10);
    await removerConsumo(adm(), linhaExtra.id);
    const grosso = await produzir(op1.id, cat.produtoPolpaId, 40);
    const fino = await produzir(op1.id, cat.produtoPolpaFinoId, 20);
    await atualizarProcessoOP(
      adm(),
      op1.id,
      processoOPSchema.parse({ branqueamentoTemperaturaC: "85", branqueamentoTempoS: "12", aguaLitros: "0", carocoResiduoKg: "48", perdaKg: "2" }),
    );
    await encerrarOP(adm(), op1.id, { confirmarVerificar: true });
    lotes.grosso = grosso.codigoLote;
    lotes.fino = fino.codigoLote;
    numeros.op1 = op1.numero;

    const op2 = await criarOP(adm(), cabecalhoOPSchema.parse({ data: "2026-11-10", frutaId: cat.frutaId }));
    await consumir(op2.id, proprio.loteId, 10);
    lotes.grossoOp2 = (await produzir(op2.id, cat.produtoPolpaId, 5)).codigoLote;
    await cancelarOP(adm(), op2.id, "Lançada por engano");
    numeros.op2 = op2.numero;

    numeros.pedidoA = (await vender(grosso.loteId, 10, { retiraNaPropriedade: "false" })).numero;
    const pedidoB = await vender(fino.loteId, 5, { clienteId: cad.clienteFiscalId });
    await cancelarPedido(adm(), pedidoB.pedidoId, "Cliente desistiu");
    numeros.pedidoB = pedidoB.numero;
    numeros.pedidoC = (await vender(proprio.loteId, 20, { clienteId: cad.clienteFiscalId })).numero;

    await criarAjuste(
      adm(),
      ajusteSchema.parse({ loteId: proprio.loteId, data: "2026-11-10", sentido: "SAIDA", quantidadeKg: "1", motivo: "AMOSTRA" }),
    );
  });

  afterAll(async () => {
    await fx.limpar();
  });

  test("polpa: OP de origem, frutos consumidos e clientes diretos", async () => {
    const r = (await rastrearLote(adm(), lotes.grosso, { incluirCancelados: false }))!;
    expect(r.lote).toMatchObject({ codigo: lotes.grosso, categoria: "POLPA", quantidadeInicialKg: 40, saldoKg: 30 });
    expect(r.recepcao).toBeNull();
    expect(r.opOrigem).toMatchObject({ numero: numeros.op1, status: "ENCERRADA", responsavel: "Joana", branqueamento: "OK" });
    expect(r.opOrigem!.rendimento).toBeCloseTo(60 / 110, 6);
    expect(r.opOrigem!.balanco.status).toBe("OK");
    expect(r.frutosConsumidos.map((f) => [f.codigo, f.kgConsumido])).toEqual([
      [lotes.proprio, 60],
      [lotes.terceiro, 50],
    ]);
    expect(descreverOrigem(r.frutosConsumidos[0].origem)).toBe("Própria · Talhão 1");
    expect(descreverOrigem(r.frutosConsumidos[1].origem)).toBe("Terceiro · Produtor exemplo");
    expect(r.opsQueConsumiram).toEqual([]);
    expect(r.clientes).toHaveLength(1);
    expect(r.clientes[0]).toMatchObject({
      caminho: "DIRETO",
      loteVendido: lotes.grosso,
      opNumero: null,
      pedidoNumero: numeros.pedidoA,
      pedidoCancelado: false,
      kg: 10,
      entrega: { status: "PENDENTE" },
      cliente: { nome: "Cliente exemplo", telefone: "(93) 99999-0000", municipio: "Santarém", enderecoEntrega: "Rua A, 10" },
    });
    expect(r.destino).toMatchObject({ entradaKg: 40, vendidoKg: 10, saldoKg: 30, confere: true });
  });

  test("polpa com cancelados: consumo removido e pedido cancelado marcados", async () => {
    const r = (await rastrearLote(adm(), lotes.grosso, { incluirCancelados: true }))!;
    expect(r.frutosConsumidos.find((f) => f.codigo === lotes.extra)?.removido).toBe(true);

    const fino = (await rastrearLote(adm(), lotes.fino, { incluirCancelados: false }))!;
    expect(fino.clientes).toEqual([]);
    const finoComCancelados = (await rastrearLote(adm(), lotes.fino, { incluirCancelados: true }))!;
    expect(finoComCancelados.clientes.map((c) => [c.pedidoNumero, c.pedidoCancelado])).toEqual([[numeros.pedidoB, true]]);
    expect(finoComCancelados.destino).toMatchObject({ vendidoKg: 0, saldoKg: 20, confere: true });
  });

  test("fruto: recepção, OPs, polpas geradas e todos os clientes", async () => {
    const r = (await rastrearLote(adm(), lotes.proprio, { incluirCancelados: false }))!;
    expect(r.lote).toMatchObject({ categoria: "FRUTO", quantidadeInicialKg: 100, saldoKg: 19 });
    expect(r.recepcao).toMatchObject({ origem: "PROPRIA", talhao: "Talhão 1", qualidade: "A", pesoBrutoKg: 100, cancelada: false });
    expect(r.opOrigem).toBeNull();
    expect(r.opsQueConsumiram.map((o) => [o.numero, o.kgDesteLote])).toEqual([[numeros.op1, 60]]);
    expect(r.opsQueConsumiram[0].lotesPolpa.map((l) => [l.codigo, l.kg])).toEqual([
      [lotes.grosso, 40],
      [lotes.fino, 20],
    ]);
    expect(r.clientes.map((c) => [c.caminho, c.loteVendido, c.opNumero, c.pedidoNumero])).toEqual([
      ["POLPA", lotes.grosso, numeros.op1, numeros.pedidoA],
      ["DIRETO", lotes.proprio, null, numeros.pedidoC],
    ]);
    expect(r.clientes[1].entrega).toBeNull();
    expect(r.destino).toEqual({
      entradaKg: 100,
      estornoEntradaKg: 0,
      vendidoKg: 20,
      consumidoOpKg: 60,
      ajustes: [{ motivo: "AMOSTRA", kg: -1 }],
      saldoKg: 19,
      confere: true,
    });
  });

  test("fruto com cancelados: OP cancelada e pedido cancelado da polpa entram marcados", async () => {
    const r = (await rastrearLote(adm(), lotes.proprio, { incluirCancelados: true }))!;
    expect(r.opsQueConsumiram.map((o) => [o.numero, o.status])).toEqual([
      [numeros.op1, "ENCERRADA"],
      [numeros.op2, "CANCELADA"],
    ]);
    expect(r.clientes.find((c) => c.pedidoNumero === numeros.pedidoB)).toMatchObject({
      caminho: "POLPA",
      loteVendido: lotes.fino,
      pedidoCancelado: true,
    });
    // O destino vem do ledger e não muda com a opção.
    expect(r.destino.consumidoOpKg).toBe(60);
  });

  test("fruto com consumo removido só aparece com cancelados", async () => {
    const sem = (await rastrearLote(adm(), lotes.extra, { incluirCancelados: false }))!;
    expect(sem.opsQueConsumiram).toEqual([]);
    expect(sem.clientes).toEqual([]);
    const com = (await rastrearLote(adm(), lotes.extra, { incluirCancelados: true }))!;
    expect(com.opsQueConsumiram).toHaveLength(1);
    expect(com.opsQueConsumiram[0]).toMatchObject({ numero: numeros.op1, consumoRemovido: true, kgDesteLote: 0 });
  });

  test("terceiro: fornecedor na recepção", async () => {
    const r = (await rastrearLote(adm(), lotes.terceiro, { incluirCancelados: false }))!;
    expect(r.recepcao).toMatchObject({ origem: "TERCEIRO", fornecedor: "Produtor exemplo", talhao: null });
  });

  test("código em minúsculas e com espaços; outra filial e código inexistente dão null", async () => {
    expect((await rastrearLote(adm(), `  ${lotes.grosso.toLowerCase()} `, { incluirCancelados: false }))?.lote.codigo).toBe(lotes.grosso);
    expect(await rastrearLote(fx.sessao("ADMINISTRADOR", { filial: "B" }), lotes.grosso, { incluirCancelados: false })).toBeNull();
    expect(await rastrearLote(adm(), "NAO-EXISTE", { incluirCancelados: false })).toBeNull();
    expect(await rastrearLote(adm(), "   ", { incluirCancelados: false })).toBeNull();
  });

  test("buscarLotes por trecho, só na filial", async () => {
    const codigos = (await buscarLotes(adm(), "fa-261110")).map((l) => l.codigo);
    expect(codigos).toEqual(expect.arrayContaining([lotes.proprio, lotes.terceiro, lotes.extra]));
    expect(codigos).not.toContain(lotes.grosso);
    expect(await buscarLotes(fx.sessao("ADMINISTRADOR", { filial: "B" }), "FA-261110")).toEqual([]);
    expect(await buscarLotes(adm(), "  ")).toEqual([]);
  });
});
```

Se `recepcaoSchema` recusar `qualidade: "A"` ou `preco` com unidade `KG`, ajuste o valor pelo schema (`src/lib/schemas/recepcao.ts`); se o pedido de polpa da OP1 for recusado por bloqueio, confira que o `encerrarOP` rodou antes.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/server/services/rastreabilidade.test.ts`
Expected: FAIL (`./rastreabilidade` não existe).

- [ ] **Step 4: Implementar o serviço**

`src/server/services/rastreabilidade.ts`:

```ts
import type {
  CategoriaProduto,
  OrigemRecepcao,
  Prisma,
  QualidadeFruto,
  StatusEntrega,
  StatusOrdemProducao,
} from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/permissions";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { arredondar } from "@/lib/producao/arredondar";
import { destinoDoLote, type DestinoLote } from "@/lib/producao/destinoLote";
import { resumirOP, type ResumoOP } from "@/lib/producao/op";
import { hojeDeCalendario } from "@/lib/producao/periodo";
import { statusDoLote, type StatusLote } from "@/lib/producao/statusLote";
import { ROTULOS_ORIGEM_RECEPCAO } from "@/lib/schemas/enums";
import { obterConfiguracaoProducao, type ConfiguracaoProducaoValores } from "./configuracaoProducao";
import { dadosDoResumo, linhasEmNumeros } from "./ordemProducao";

export type OrigemDoFruto = {
  origem: OrigemRecepcao;
  talhao: string | null;
  fornecedor: string | null;
  qualidade: QualidadeFruto | null;
};

export type RecepcaoRastreio = OrigemDoFruto & {
  data: Date;
  pesoBrutoKg: number;
  descarteKg: number;
  documento: string | null;
  cancelada: boolean;
};

export type OpRastreio = {
  numero: string;
  data: Date;
  status: StatusOrdemProducao;
  responsavel: string | null;
  branqueamentoTemperaturaC: number | null;
  branqueamentoTempoS: number | null;
  rendimento: number | null;
  balanco: ResumoOP["balanco"];
  branqueamento: ResumoOP["branqueamento"];
};

export type FrutoConsumido = {
  codigo: string;
  produto: string;
  kgConsumido: number;
  dataRecepcao: Date;
  /** `null` quando o lote não veio de uma recepção. */
  origem: OrigemDoFruto | null;
  removido: boolean;
};

export type LotePolpaGerado = { codigo: string; produto: string; kg: number; saldoKg: number; removido: boolean };

export type OpConsumidora = OpRastreio & {
  /** Soma dos consumos não removidos deste lote na OP. */
  kgDesteLote: number;
  /** Todas as linhas deste lote na OP foram removidas (só aparece com cancelados). */
  consumoRemovido: boolean;
  lotesPolpa: LotePolpaGerado[];
};

export type LinhaCliente = {
  /** DIRETO = o próprio lote consultado; POLPA = polpa feita com o fruto consultado. */
  caminho: "DIRETO" | "POLPA";
  loteVendido: string;
  opNumero: string | null;
  pedidoNumero: number;
  pedidoData: Date;
  pedidoCancelado: boolean;
  kg: number;
  /** `null` = retira na propriedade. */
  entrega: { status: StatusEntrega; dataPrevista: Date; dataRealizada: Date | null; recebidoPor: string | null } | null;
  cliente: {
    nome: string;
    cnpjCpf: string | null;
    contato: string | null;
    telefone: string | null;
    email: string | null;
    municipio: string | null;
    enderecoEntrega: string | null;
  };
};

export type LoteRastreio = {
  id: string;
  codigo: string;
  produto: string;
  categoria: CategoriaProduto;
  data: Date;
  validade: Date;
  local: string;
  quantidadeInicialKg: number;
  saldoKg: number;
  status: StatusLote;
};

export type Rastreio = {
  lote: LoteRastreio;
  /** Só fruto. */
  recepcao: RecepcaoRastreio | null;
  /** Só polpa. */
  opOrigem: OpRastreio | null;
  /** Só polpa: os frutos da OP de origem. */
  frutosConsumidos: FrutoConsumido[];
  /** Só fruto. */
  opsQueConsumiram: OpConsumidora[];
  destino: DestinoLote;
  clientes: LinhaCliente[];
};

export type LoteEncontrado = { codigo: string; produto: string; data: Date; saldoKg: number };

export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

export function descreverOrigem(origem: OrigemDoFruto | null): string {
  if (!origem) return "—";
  return `${ROTULOS_ORIGEM_RECEPCAO[origem.origem]} · ${origem.talhao ?? origem.fornecedor ?? "—"}`;
}

const SELECT_ORIGEM_FRUTO = {
  origem: true,
  qualidade: true,
  talhao: { select: { nome: true } },
  fornecedor: { select: { nome: true } },
} satisfies Prisma.RecepcaoFrutoSelect;

function origemDoFruto(r: Prisma.RecepcaoFrutoGetPayload<{ select: typeof SELECT_ORIGEM_FRUTO }>): OrigemDoFruto {
  return {
    origem: r.origem,
    qualidade: r.qualidade,
    talhao: r.talhao?.nome ?? null,
    fornecedor: r.fornecedor?.nome ?? null,
  };
}

const SELECT_OP = {
  id: true,
  numero: true,
  data: true,
  status: true,
  responsavel: true,
  branqueamentoTemperaturaC: true,
  branqueamentoTempoS: true,
  aguaLitros: true,
  carocoResiduoKg: true,
  perdaKg: true,
  fruta: { select: { exigeBranqueamento: true } },
  consumos: {
    select: {
      loteId: true,
      quantidadeKg: true,
      custoKg: true,
      removidoEm: true,
      lote: {
        select: {
          codigo: true,
          data: true,
          produto: { select: { descricao: true } },
          recepcao: { select: SELECT_ORIGEM_FRUTO },
        },
      },
    },
    orderBy: { criadoEm: "asc" as const },
  },
  producoes: {
    select: {
      loteId: true,
      quantidadeKg: true,
      removidoEm: true,
      lote: { select: { codigo: true, saldoKg: true, produto: { select: { descricao: true } } } },
    },
    orderBy: { criadoEm: "asc" as const },
  },
  insumos: { where: { removidoEm: null }, select: { quantidade: true, custoUnitario: true } },
} satisfies Prisma.OrdemProducaoSelect;

type OpCarregada = Prisma.OrdemProducaoGetPayload<{ select: typeof SELECT_OP }>;

/** Dados da OP com rendimento, balanço e branqueamento das linhas não removidas. */
function paraOpRastreio(op: OpCarregada, configuracao: ConfiguracaoProducaoValores): OpRastreio {
  const linhas = linhasEmNumeros({
    consumos: op.consumos.filter((c) => c.removidoEm === null),
    producoes: op.producoes.filter((p) => p.removidoEm === null),
    insumos: op.insumos,
  });
  const resumo = resumirOP(dadosDoResumo(op, linhas), configuracao);
  return {
    numero: op.numero,
    data: op.data,
    status: op.status,
    responsavel: op.responsavel,
    branqueamentoTemperaturaC: op.branqueamentoTemperaturaC === null ? null : Number(op.branqueamentoTemperaturaC),
    branqueamentoTempoS: op.branqueamentoTempoS,
    rendimento: resumo.rendimento,
    balanco: resumo.balanco,
    branqueamento: resumo.branqueamento,
  };
}

/** Até 20 lotes da filial cujo código contém o trecho, mais recentes primeiro. */
export async function buscarLotes(sessao: SessaoAtiva, trecho: string): Promise<LoteEncontrado[]> {
  requirePermission(sessao.perfil, "producao:ler");
  const termo = normalizarCodigo(trecho);
  if (!termo) return [];
  const lotes = await prisma.lote.findMany({
    where: { filialId: sessao.filialId, codigo: { contains: termo, mode: "insensitive" } },
    select: { codigo: true, data: true, saldoKg: true, produto: { select: { descricao: true } } },
    orderBy: [{ data: "desc" }, { codigo: "desc" }],
    take: 20,
  });
  return lotes.map((l) => ({ codigo: l.codigo, produto: l.produto.descricao, data: l.data, saldoKg: Number(l.saldoKg) }));
}

/**
 * Rastreabilidade do lote (RN-28): para trás (recepção, ou OP e frutos), para
 * frente (OPs e polpas, só fruto), destino de cada kg e clientes que receberam
 * o lote ou a polpa derivada (D-22). Cancelados só com `incluirCancelados` (D-23).
 */
export async function rastrearLote(
  sessao: SessaoAtiva,
  codigo: string,
  opcoes: { incluirCancelados: boolean },
): Promise<Rastreio | null> {
  requirePermission(sessao.perfil, "producao:ler");
  const termo = normalizarCodigo(codigo);
  if (!termo) return null;
  const { incluirCancelados } = opcoes;

  const lote = await prisma.lote.findFirst({
    where: { filialId: sessao.filialId, codigo: { equals: termo, mode: "insensitive" } },
    include: {
      produto: { select: { descricao: true, categoria: true, conservacao: true } },
      local: { select: { nome: true } },
      recepcao: {
        select: { data: true, pesoBrutoKg: true, descarteKg: true, documento: true, status: true, ...SELECT_ORIGEM_FRUTO },
      },
      producaoOP: { select: { ordemProducaoId: true } },
      consumosOP: { select: { ordemProducaoId: true } },
    },
  });
  if (!lote) return null;

  const fruto = lote.produto.categoria === "FRUTO";
  const opIds = fruto
    ? [...new Set(lote.consumosOP.map((c) => c.ordemProducaoId))]
    : lote.producaoOP
      ? [lote.producaoOP.ordemProducaoId]
      : [];

  const [configuracao, ops, movimentos] = await Promise.all([
    obterConfiguracaoProducao(sessao.filialId),
    opIds.length > 0
      ? prisma.ordemProducao.findMany({
          where: { id: { in: opIds }, filialId: sessao.filialId },
          select: SELECT_OP,
          orderBy: [{ data: "asc" }, { numero: "asc" }],
        })
      : Promise.resolve([] as OpCarregada[]),
    prisma.movimentoEstoque.findMany({
      where: { loteId: lote.id },
      select: { tipo: true, quantidadeKg: true, ajuste: { select: { motivo: true } } },
    }),
  ]);

  let opOrigem: OpRastreio | null = null;
  let frutosConsumidos: FrutoConsumido[] = [];
  if (!fruto && ops[0]) {
    opOrigem = paraOpRastreio(ops[0], configuracao);
    frutosConsumidos = ops[0].consumos
      .filter((c) => incluirCancelados || c.removidoEm === null)
      .map((c) => ({
        codigo: c.lote.codigo,
        produto: c.lote.produto.descricao,
        kgConsumido: Number(c.quantidadeKg),
        dataRecepcao: c.lote.data,
        origem: c.lote.recepcao ? origemDoFruto(c.lote.recepcao) : null,
        removido: c.removidoEm !== null,
      }));
  }

  // Lote de polpa → nº da OP, para as vendas feitas com este fruto.
  const opDoLotePolpa = new Map<string, string>();
  const opsQueConsumiram: OpConsumidora[] = !fruto
    ? []
    : ops.flatMap((op) => {
        const ativos = op.consumos.filter((c) => c.loteId === lote.id && c.removidoEm === null);
        const consumoRemovido = ativos.length === 0;
        if (!incluirCancelados && (op.status === "CANCELADA" || consumoRemovido)) return [];
        const producoes = op.producoes.filter((p) => incluirCancelados || p.removidoEm === null);
        for (const p of producoes) opDoLotePolpa.set(p.loteId, op.numero);
        return [
          {
            ...paraOpRastreio(op, configuracao),
            kgDesteLote: arredondar(ativos.reduce((s, c) => s + Number(c.quantidadeKg), 0), 3),
            consumoRemovido,
            lotesPolpa: producoes.map((p) => ({
              codigo: p.lote.codigo,
              produto: p.lote.produto.descricao,
              kg: Number(p.quantidadeKg),
              saldoKg: Number(p.lote.saldoKg),
              removido: p.removidoEm !== null,
            })),
          },
        ];
      });

  const itens = await prisma.itemPedidoVenda.findMany({
    where: {
      loteId: { in: [lote.id, ...opDoLotePolpa.keys()] },
      pedido: { filialId: sessao.filialId, ...(incluirCancelados ? {} : { status: "CONFIRMADO" as const }) },
    },
    select: {
      loteId: true,
      quantidadeKg: true,
      lote: { select: { codigo: true } },
      pedido: {
        select: {
          numero: true,
          data: true,
          status: true,
          entrega: { select: { status: true, dataPrevista: true, dataRealizada: true, recebidoPor: true } },
          cliente: {
            select: {
              nome: true,
              cnpjCpf: true,
              contato: true,
              telefone: true,
              email: true,
              municipio: true,
              enderecoEntrega: true,
            },
          },
        },
      },
    },
  });

  const clientes: LinhaCliente[] = itens
    .map((i) => ({
      caminho: i.loteId === lote.id ? ("DIRETO" as const) : ("POLPA" as const),
      loteVendido: i.lote.codigo,
      opNumero: opDoLotePolpa.get(i.loteId) ?? null,
      pedidoNumero: i.pedido.numero,
      pedidoData: i.pedido.data,
      pedidoCancelado: i.pedido.status === "CANCELADO",
      kg: Number(i.quantidadeKg),
      entrega: i.pedido.entrega,
      cliente: i.pedido.cliente,
    }))
    .sort((a, b) => a.pedidoData.getTime() - b.pedidoData.getTime() || a.pedidoNumero - b.pedidoNumero);

  const saldoKg = Number(lote.saldoKg);
  return {
    lote: {
      id: lote.id,
      codigo: lote.codigo,
      produto: lote.produto.descricao,
      categoria: lote.produto.categoria,
      data: lote.data,
      validade: lote.validade,
      local: lote.local.nome,
      quantidadeInicialKg: Number(lote.quantidadeInicialKg),
      saldoKg,
      status: statusDoLote(
        { saldoKg, validade: lote.validade, conservacao: lote.produto.conservacao },
        hojeDeCalendario(),
        configuracao,
      ),
    },
    recepcao: lote.recepcao
      ? {
          ...origemDoFruto(lote.recepcao),
          data: lote.recepcao.data,
          pesoBrutoKg: Number(lote.recepcao.pesoBrutoKg),
          descarteKg: Number(lote.recepcao.descarteKg),
          documento: lote.recepcao.documento,
          cancelada: lote.recepcao.status === "CANCELADA",
        }
      : null,
    opOrigem,
    frutosConsumidos,
    opsQueConsumiram,
    destino: destinoDoLote(
      movimentos.map((m) => ({ tipo: m.tipo, quantidadeKg: Number(m.quantidadeKg), motivo: m.ajuste?.motivo ?? null })),
      saldoKg,
    ),
    clientes,
  };
}
```

Observações:
- No teste "fruto", a ordem dos clientes `[pedidoA, pedidoC]` vem do número: os dois pedidos têm a mesma data e A foi criado antes de C.
- Se o TypeScript reclamar que `ConfiguracaoProducaoValores` não é exportado, use o tipo de retorno: `Awaited<ReturnType<typeof obterConfiguracaoProducao>>`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/server/services/rastreabilidade.test.ts src/server/services/ordemProducao.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/rastreabilidade.ts src/server/services/rastreabilidade.test.ts src/server/services/ordemProducao.ts
git commit -m "feat(producao): serviço de rastreabilidade por lote"
```

---

### Task 4: Exportação (CSV, Excel e PDF)

**Files:**
- Create: `src/server/export/rastreabilidade.ts`
- Test: `src/server/export/rastreabilidade.test.ts`
- Create: `src/app/(dashboard)/producao/rastreabilidade/export/route.ts`

**Interfaces:**
- Consumes: `Rastreio`, `LinhaCliente`, `OpRastreio`, `OpConsumidora`, `descreverOrigem`, `rastrearLote` (Task 3); `secaoPdf`, `SecaoPdf`, `gerarPdfSecoes`, `responderArquivoPdf` (Task 1); `linhasDoDestino` (Task 2).
- Produces: `COLUNAS_CLIENTES: ColunaExport<LinhaCliente>[]`, `secoesDoRastreio(r: Rastreio): SecaoPdf<unknown>[]`, `nomeDoArquivo(codigo: string): string`; rota `GET /producao/rastreabilidade/export?lote=&formato=csv|xlsx|pdf&cancelados=1`.

- [ ] **Step 1: Teste que falha**

`src/server/export/rastreabilidade.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { LinhaCliente, Rastreio } from "@/server/services/rastreabilidade";
import { COLUNAS_CLIENTES, nomeDoArquivo, secoesDoRastreio } from "./rastreabilidade";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const OP = {
  numero: "OP-261110-01",
  data: d("2026-11-10"),
  status: "ENCERRADA" as const,
  responsavel: "Joana",
  branqueamentoTemperaturaC: 85,
  branqueamentoTempoS: 12,
  rendimento: 0.5,
  balanco: { diferencaKg: 0, percentual: 0, status: "OK" as const },
  branqueamento: "OK" as const,
};

const CLIENTE: LinhaCliente = {
  caminho: "POLPA",
  loteVendido: "AGC-261110-01",
  opNumero: "OP-261110-01",
  pedidoNumero: 7,
  pedidoData: d("2026-11-11"),
  pedidoCancelado: true,
  kg: 10,
  entrega: null,
  cliente: { nome: "Mercado", cnpjCpf: null, contato: null, telefone: "93 9999", email: null, municipio: "Santarém", enderecoEntrega: null },
};

const base = (categoria: "FRUTO" | "POLPA"): Rastreio => ({
  lote: {
    id: "x",
    codigo: "FA-261110-01",
    produto: "Fruto de açaí",
    categoria,
    data: d("2026-11-10"),
    validade: d("2026-11-11"),
    local: "Recepção",
    quantidadeInicialKg: 100,
    saldoKg: 19,
    status: "OK",
  },
  recepcao: null,
  opOrigem: null,
  frutosConsumidos: [],
  opsQueConsumiram: [],
  destino: { entradaKg: 100, estornoEntradaKg: 0, vendidoKg: 20, consumidoOpKg: 60, ajustes: [], saldoKg: 20, confere: true },
  clientes: [CLIENTE],
});

describe("secoesDoRastreio", () => {
  test("fruto: lote, recepção, OPs, polpas, destino e clientes", () => {
    const r: Rastreio = {
      ...base("FRUTO"),
      recepcao: { origem: "PROPRIA", talhao: "Talhão 1", fornecedor: null, qualidade: "A", data: d("2026-11-10"), pesoBrutoKg: 100, descarteKg: 0, documento: null, cancelada: false },
      opsQueConsumiram: [{ ...OP, kgDesteLote: 60, consumoRemovido: false, lotesPolpa: [{ codigo: "AGC-261110-01", produto: "Polpa", kg: 40, saldoKg: 30, removido: false }] }],
    };
    const secoes = secoesDoRastreio(r);
    expect(secoes.map((s) => s.titulo)).toEqual([
      "Lote",
      "Origem: recepção",
      "OPs que consumiram o lote",
      "Lotes de polpa gerados",
      "Destino do lote",
      "Clientes que receberam",
    ]);
    const polpas = secoes[3];
    expect(polpas.colunas[0].valor(polpas.linhas[0])).toBe("OP-261110-01");
  });

  test("polpa: OP de origem e frutos consumidos; destino que não confere avisa no título", () => {
    const r: Rastreio = {
      ...base("POLPA"),
      opOrigem: OP,
      destino: { ...base("POLPA").destino, confere: false },
    };
    expect(secoesDoRastreio(r).map((s) => s.titulo)).toEqual([
      "Lote",
      "Origem: OP",
      "Frutos consumidos",
      "Destino do lote (não confere com o saldo)",
      "Clientes que receberam",
    ]);
  });
});

describe("COLUNAS_CLIENTES", () => {
  test("retira, cancelado e caminho", () => {
    const valor = (rotulo: string) => COLUNAS_CLIENTES.find((c) => c.rotulo === rotulo)!.valor(CLIENTE);
    expect(valor("Caminho")).toBe("Polpa");
    expect(valor("Entrega")).toBe("Retira");
    expect(valor("Cancelado")).toBe("Sim");
    expect(valor("CPF/CNPJ")).toBe("");
  });
});

describe("nomeDoArquivo", () => {
  test("troca o que não for letra, número, - ou _", () => {
    expect(nomeDoArquivo("FA-261110-01")).toBe("rastreabilidade-FA-261110-01");
    expect(nomeDoArquivo("lote/1 a")).toBe("rastreabilidade-lote_1_a");
  });
});
```

Confira o formato de `ResumoOP["balanco"]` em `src/lib/producao/op.ts` (função `balancoMassa`) e ajuste o objeto `balanco` do teste se tiver outros campos.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/export/rastreabilidade.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar as colunas e seções**

`src/server/export/rastreabilidade.ts`:

```ts
import type { ColunaExport } from "@/lib/export/csv";
import { secaoPdf, type SecaoPdf } from "@/lib/export/pdf";
import { linhasDoDestino } from "@/lib/producao/destinoLote";
import { ROTULOS_STATUS_BRANQUEAMENTO, ROTULOS_STATUS_VERIFICACAO } from "@/lib/producao/op";
import { ROTULOS_STATUS_LOTE } from "@/lib/producao/statusLote";
import { ROTULOS_STATUS_ENTREGA, ROTULOS_STATUS_ORDEM_PRODUCAO } from "@/lib/schemas/enums";
import {
  descreverOrigem,
  type FrutoConsumido,
  type LinhaCliente,
  type LoteRastreio,
  type OpConsumidora,
  type OpRastreio,
  type Rastreio,
  type RecepcaoRastreio,
} from "@/server/services/rastreabilidade";

const situacao = (removido: boolean) => (removido ? "Removido" : "");

export const COLUNAS_CLIENTES: ColunaExport<LinhaCliente>[] = [
  { rotulo: "Caminho", valor: (c) => (c.caminho === "DIRETO" ? "Direto" : "Polpa") },
  { rotulo: "Lote vendido", valor: (c) => c.loteVendido },
  { rotulo: "OP", valor: (c) => c.opNumero ?? "" },
  { rotulo: "Pedido", tipo: "inteiro", valor: (c) => c.pedidoNumero },
  { rotulo: "Data", valor: (c) => c.pedidoData },
  { rotulo: "Cliente", valor: (c) => c.cliente.nome },
  { rotulo: "CPF/CNPJ", valor: (c) => c.cliente.cnpjCpf ?? "" },
  { rotulo: "Contato", valor: (c) => c.cliente.contato ?? "" },
  { rotulo: "Telefone", valor: (c) => c.cliente.telefone ?? "" },
  { rotulo: "E-mail", valor: (c) => c.cliente.email ?? "" },
  { rotulo: "Município", valor: (c) => c.cliente.municipio ?? "" },
  { rotulo: "Endereço de entrega", valor: (c) => c.cliente.enderecoEntrega ?? "" },
  { rotulo: "kg", valor: (c) => c.kg },
  { rotulo: "Entrega", valor: (c) => (c.entrega ? ROTULOS_STATUS_ENTREGA[c.entrega.status] : "Retira") },
  { rotulo: "Entregue em", valor: (c) => c.entrega?.dataRealizada ?? "" },
  { rotulo: "Recebido por", valor: (c) => c.entrega?.recebidoPor ?? "" },
  { rotulo: "Cancelado", valor: (c) => (c.pedidoCancelado ? "Sim" : "") },
];

const COLUNAS_LOTE: ColunaExport<LoteRastreio>[] = [
  { rotulo: "Código", valor: (l) => l.codigo },
  { rotulo: "Produto", valor: (l) => l.produto },
  { rotulo: "Data", valor: (l) => l.data },
  { rotulo: "Validade", valor: (l) => l.validade },
  { rotulo: "Local", valor: (l) => l.local },
  { rotulo: "Inicial (kg)", valor: (l) => l.quantidadeInicialKg },
  { rotulo: "Saldo (kg)", valor: (l) => l.saldoKg },
  { rotulo: "Status", valor: (l) => ROTULOS_STATUS_LOTE[l.status] },
];

const COLUNAS_RECEPCAO: ColunaExport<RecepcaoRastreio>[] = [
  { rotulo: "Data", valor: (r) => r.data },
  { rotulo: "Origem", valor: (r) => descreverOrigem(r) },
  { rotulo: "Qualidade", valor: (r) => r.qualidade ?? "" },
  { rotulo: "Peso bruto (kg)", valor: (r) => r.pesoBrutoKg },
  { rotulo: "Descarte (kg)", valor: (r) => r.descarteKg },
  { rotulo: "Documento", valor: (r) => r.documento ?? "" },
  { rotulo: "Situação", valor: (r) => (r.cancelada ? "Excluída" : "Ativa") },
];

const COLUNAS_OP: ColunaExport<OpRastreio>[] = [
  { rotulo: "OP", valor: (op) => op.numero },
  { rotulo: "Data", valor: (op) => op.data },
  { rotulo: "Status", valor: (op) => ROTULOS_STATUS_ORDEM_PRODUCAO[op.status] },
  { rotulo: "Responsável", valor: (op) => op.responsavel ?? "" },
  { rotulo: "Branq. (°C)", valor: (op) => op.branqueamentoTemperaturaC ?? "" },
  { rotulo: "Branq. (s)", tipo: "inteiro", valor: (op) => op.branqueamentoTempoS ?? "" },
  { rotulo: "Branqueamento", valor: (op) => ROTULOS_STATUS_BRANQUEAMENTO[op.branqueamento] },
  { rotulo: "Rendimento (%)", tipo: "percentual", valor: (op) => (op.rendimento === null ? "" : op.rendimento * 100) },
  { rotulo: "Balanço (kg)", valor: (op) => op.balanco.diferencaKg },
  { rotulo: "Balanço", valor: (op) => ROTULOS_STATUS_VERIFICACAO[op.balanco.status] },
];

const COLUNAS_OP_CONSUMIDORA: ColunaExport<OpConsumidora>[] = [
  ...COLUNAS_OP,
  { rotulo: "kg deste lote", valor: (op) => op.kgDesteLote },
  { rotulo: "Consumo", valor: (op) => situacao(op.consumoRemovido) },
];

const COLUNAS_FRUTO: ColunaExport<FrutoConsumido>[] = [
  { rotulo: "Lote", valor: (f) => f.codigo },
  { rotulo: "Produto", valor: (f) => f.produto },
  { rotulo: "kg consumido", valor: (f) => f.kgConsumido },
  { rotulo: "Recepção", valor: (f) => f.dataRecepcao },
  { rotulo: "Origem", valor: (f) => descreverOrigem(f.origem) },
  { rotulo: "Qualidade", valor: (f) => f.origem?.qualidade ?? "" },
  { rotulo: "Situação", valor: (f) => situacao(f.removido) },
];

type LinhaPolpa = OpConsumidora["lotesPolpa"][number] & { op: string };
const COLUNAS_POLPA: ColunaExport<LinhaPolpa>[] = [
  { rotulo: "OP", valor: (p) => p.op },
  { rotulo: "Lote", valor: (p) => p.codigo },
  { rotulo: "Produto", valor: (p) => p.produto },
  { rotulo: "kg produzido", valor: (p) => p.kg },
  { rotulo: "Saldo (kg)", valor: (p) => p.saldoKg },
  { rotulo: "Situação", valor: (p) => situacao(p.removido) },
];

const COLUNAS_DESTINO: ColunaExport<{ rotulo: string; kg: number }>[] = [
  { rotulo: "Movimento", valor: (l) => l.rotulo },
  { rotulo: "kg", valor: (l) => l.kg },
];

/** Relatório completo do lote para o PDF, na ordem da tela. */
export function secoesDoRastreio(r: Rastreio): SecaoPdf<unknown>[] {
  const secoes = [secaoPdf({ titulo: "Lote", linhas: [r.lote], colunas: COLUNAS_LOTE })];
  if (r.recepcao) secoes.push(secaoPdf({ titulo: "Origem: recepção", linhas: [r.recepcao], colunas: COLUNAS_RECEPCAO }));
  if (r.opOrigem) {
    secoes.push(secaoPdf({ titulo: "Origem: OP", linhas: [r.opOrigem], colunas: COLUNAS_OP }));
    secoes.push(secaoPdf({ titulo: "Frutos consumidos", linhas: r.frutosConsumidos, colunas: COLUNAS_FRUTO }));
  }
  if (r.lote.categoria === "FRUTO") {
    secoes.push(secaoPdf({ titulo: "OPs que consumiram o lote", linhas: r.opsQueConsumiram, colunas: COLUNAS_OP_CONSUMIDORA }));
    secoes.push(
      secaoPdf({
        titulo: "Lotes de polpa gerados",
        linhas: r.opsQueConsumiram.flatMap((op) => op.lotesPolpa.map((p) => ({ ...p, op: op.numero }))),
        colunas: COLUNAS_POLPA,
      }),
    );
  }
  secoes.push(
    secaoPdf({
      titulo: r.destino.confere ? "Destino do lote" : "Destino do lote (não confere com o saldo)",
      linhas: linhasDoDestino(r.destino),
      colunas: COLUNAS_DESTINO,
    }),
  );
  secoes.push(secaoPdf({ titulo: "Clientes que receberam", linhas: r.clientes, colunas: COLUNAS_CLIENTES }));
  return secoes;
}

export function nomeDoArquivo(codigo: string): string {
  return `rastreabilidade-${codigo.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/export/rastreabilidade.test.ts`
Expected: PASS.

- [ ] **Step 5: Rota de exportação**

`src/app/(dashboard)/producao/rastreabilidade/export/route.ts`:

```ts
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { podeExecutar } from "@/server/auth/permissions";
import { rastrearLote } from "@/server/services/rastreabilidade";
import { cabecalhoDoRelatorio } from "@/server/export/cabecalhoDoRelatorio";
import { COLUNAS_CLIENTES, nomeDoArquivo, secoesDoRastreio } from "@/server/export/rastreabilidade";
import { gerarPdfSecoes } from "@/lib/export/pdf";
import { responderArquivoPdf, responderExport } from "@/lib/export/responder";

/** PDF = relatório completo; CSV/Excel = clientes atingidos (uma linha por item vendido). */
export async function GET(request: Request) {
  const sessao = await requireSessaoAtiva();
  if (!podeExecutar(sessao.perfil, "producao:ler")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const incluirCancelados = url.searchParams.get("cancelados") === "1";
  const rastreio = await rastrearLote(sessao, url.searchParams.get("lote") ?? "", { incluirCancelados });
  if (!rastreio) return new Response("Lote não encontrado", { status: 404 });

  const codigo = rastreio.lote.codigo;
  const cabecalho = () =>
    cabecalhoDoRelatorio(sessao, {
      titulo: `Rastreabilidade do lote ${codigo}`,
      filtros: [incluirCancelados ? "Inclui cancelados e removidos" : null],
    });
  const formato = url.searchParams.get("formato");

  if (formato === "pdf") {
    const bytes = await gerarPdfSecoes(secoesDoRastreio(rastreio), await cabecalho());
    return responderArquivoPdf(bytes, nomeDoArquivo(codigo));
  }

  return responderExport(rastreio.clientes, COLUNAS_CLIENTES, {
    nomeArquivo: nomeDoArquivo(codigo),
    nomeAba: "Clientes",
    formato,
    cabecalhoPdf: cabecalho,
  });
}
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/server/export/rastreabilidade.ts src/server/export/rastreabilidade.test.ts "src/app/(dashboard)/producao/rastreabilidade/export/route.ts"
git commit -m "feat(producao): exportação da rastreabilidade em PDF, CSV e Excel"
```

---

### Task 5: Tela de rastreabilidade e menu

**Files:**
- Create: `src/app/(dashboard)/producao/_shared/link-rastreio.tsx`
- Create: `src/app/(dashboard)/producao/_shared/status-lote-badge.tsx`
- Modify: `src/app/(dashboard)/producao/estoque/page.tsx` (usar `StatusLoteBadge`, remover `VARIANTE_STATUS` local)
- Create: `src/app/(dashboard)/producao/rastreabilidade/cartoes.tsx`
- Create: `src/app/(dashboard)/producao/rastreabilidade/page.tsx`
- Modify: `src/app/(dashboard)/nav-items.ts`, `src/app/(dashboard)/nav-items.test.ts`

**Interfaces:**
- Consumes: `rastrearLote`, `buscarLotes`, tipos e `descreverOrigem` (Task 3); `linhasDoDestino` (Task 2).
- Produces: `hrefRastreio(codigo: string, incluirCancelados?: boolean): string`, `LinkRastreio({ codigo, incluirCancelados?, className? })`, `StatusLoteBadge({ status })`.

- [ ] **Step 1: Teste do menu que falha**

Em `nav-items.test.ts`, no teste "seção Produção…", trocar o título para `"seção Produção com recepção, processamento, estoque, ajustes e rastreabilidade para quem tem producao:ler"` e a lista esperada para:

```ts
      expect(producao?.itens.map((i) => i.href)).toEqual([
        "/producao/recepcao",
        "/producao/processamento",
        "/producao/estoque",
        "/producao/ajustes",
        "/producao/rastreabilidade",
      ]);
```

Run: `npx vitest run "src/app/(dashboard)/nav-items.test.ts"`
Expected: FAIL.

- [ ] **Step 2: Item no menu**

Em `nav-items.ts`, depois da linha de "Ajustes de estoque":

```ts
      { href: "/producao/rastreabilidade", label: "Rastreabilidade", acao: "producao:ler" },
```

Run: `npx vitest run "src/app/(dashboard)/nav-items.test.ts"`
Expected: PASS.

- [ ] **Step 3: Componentes compartilhados**

`src/app/(dashboard)/producao/_shared/link-rastreio.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

export function hrefRastreio(codigo: string, incluirCancelados = false): string {
  const params = new URLSearchParams({ lote: codigo });
  if (incluirCancelados) params.set("cancelados", "1");
  return `/producao/rastreabilidade?${params}`;
}

/** Código do lote que abre a rastreabilidade. */
export function LinkRastreio({
  codigo,
  incluirCancelados = false,
  className,
}: {
  codigo: string;
  incluirCancelados?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={hrefRastreio(codigo, incluirCancelados)}
      title="Rastrear lote"
      className={cn("underline decoration-dotted underline-offset-4 hover:decoration-solid", className)}
    >
      {codigo}
    </Link>
  );
}
```

`src/app/(dashboard)/producao/_shared/status-lote-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { ROTULOS_STATUS_LOTE, type StatusLote } from "@/lib/producao/statusLote";

const VARIANTE_STATUS: Record<StatusLote, "default" | "secondary" | "destructive" | "outline"> = {
  OK: "default",
  VENCENDO: "secondary",
  VENCIDO: "destructive",
  ZERADO: "outline",
};

export function StatusLoteBadge({ status }: { status: StatusLote }) {
  return <Badge variant={VARIANTE_STATUS[status]}>{ROTULOS_STATUS_LOTE[status]}</Badge>;
}
```

Em `estoque/page.tsx`: apagar o `VARIANTE_STATUS` local (linhas ~21–26), trocar `<Badge variant={VARIANTE_STATUS[lote.status]}>{ROTULOS_STATUS_LOTE[lote.status]}</Badge>` por `<StatusLoteBadge status={lote.status} />`, importar `StatusLoteBadge` de `../_shared/status-lote-badge` e remover imports que ficarem sem uso (`StatusLote`, `ROTULOS_STATUS_LOTE`, se não forem usados em outro lugar do arquivo).

- [ ] **Step 4: Cartões**

`src/app/(dashboard)/producao/rastreabilidade/cartoes.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData } from "@/lib/formatacao";
import { linhasDoDestino, type DestinoLote } from "@/lib/producao/destinoLote";
import { ROTULOS_CATEGORIA_PRODUTO, ROTULOS_STATUS_ENTREGA } from "@/lib/schemas/enums";
import { descreverOrigem, type LinhaCliente, type OpRastreio, type Rastreio } from "@/server/services/rastreabilidade";
import { BranqueamentoBadge, KG, PERCENTUAL, StatusOPBadge, VerificacaoBadge } from "../processamento/formatos";
import { LinkRastreio } from "../_shared/link-rastreio";
import { StatusLoteBadge } from "../_shared/status-lote-badge";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function Vazio({ colunas, texto }: { colunas: number; texto: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colunas} className="py-6 text-center text-sm text-muted-foreground">
        {texto}
      </TableCell>
    </TableRow>
  );
}

const Removido = () => <Badge variant="outline">Removido</Badge>;

function LinkOP({ numero }: { numero: string }) {
  return (
    <Link href={`/producao/processamento/${encodeURIComponent(numero)}`} className="underline-offset-4 hover:underline">
      {numero}
    </Link>
  );
}

export function CartaoLote({ rastreio, acoes }: { rastreio: Rastreio; acoes: React.ReactNode }) {
  const { lote } = rastreio;
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            {lote.codigo}
            <StatusLoteBadge status={lote.status} />
          </CardTitle>
          <CardDescription>
            {ROTULOS_CATEGORIA_PRODUTO[lote.categoria]} · {lote.produto}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">{acoes}</div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Dado rotulo={lote.categoria === "FRUTO" ? "Recepção" : "Fabricação"}>{formatarData(lote.data)}</Dado>
          <Dado rotulo="Validade">{formatarData(lote.validade)}</Dado>
          <Dado rotulo="Local">{lote.local}</Dado>
          <Dado rotulo="Quantidade inicial">{KG.format(lote.quantidadeInicialKg)} kg</Dado>
          <Dado rotulo="Saldo">{KG.format(lote.saldoKg)} kg</Dado>
        </dl>
      </CardContent>
    </Card>
  );
}

function ResumoOP({ op }: { op: OpRastreio }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <Dado rotulo="OP">
        <span className="flex flex-wrap items-center gap-1">
          <LinkOP numero={op.numero} />
          <StatusOPBadge status={op.status} />
        </span>
      </Dado>
      <Dado rotulo="Data">{formatarData(op.data)}</Dado>
      <Dado rotulo="Responsável">{op.responsavel ?? "—"}</Dado>
      <Dado rotulo="Branqueamento">
        <span className="flex flex-wrap items-center gap-1">
          {op.branqueamentoTemperaturaC === null ? "—" : `${op.branqueamentoTemperaturaC} °C`}
          {" · "}
          {op.branqueamentoTempoS === null ? "—" : `${op.branqueamentoTempoS} s`}
          <BranqueamentoBadge status={op.branqueamento} />
        </span>
      </Dado>
      <Dado rotulo="Rendimento · balanço">
        <span className="flex flex-wrap items-center gap-1">
          {op.rendimento === null ? "—" : PERCENTUAL.format(op.rendimento)}
          {" · "}
          {KG.format(op.balanco.diferencaKg)} kg
          <VerificacaoBadge status={op.balanco.status} />
        </span>
      </Dado>
    </dl>
  );
}

export function CartaoOrigem({ rastreio, incluirCancelados }: { rastreio: Rastreio; incluirCancelados: boolean }) {
  const { recepcao, opOrigem } = rastreio;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Origem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {recepcao ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Dado rotulo="Recepção">
              {formatarData(recepcao.data)}
              {recepcao.cancelada ? <Badge variant="destructive" className="ml-2">Excluída</Badge> : null}
            </Dado>
            <Dado rotulo="Origem">{descreverOrigem(recepcao)}</Dado>
            <Dado rotulo="Qualidade">{recepcao.qualidade ?? "—"}</Dado>
            <Dado rotulo="Peso bruto · descarte">
              {KG.format(recepcao.pesoBrutoKg)} kg · {KG.format(recepcao.descarteKg)} kg
            </Dado>
            <Dado rotulo="Documento">{recepcao.documento ?? "—"}</Dado>
          </dl>
        ) : null}
        {opOrigem ? (
          <>
            <ResumoOP op={opOrigem} />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote de fruto</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">kg consumido</TableHead>
                    <TableHead>Recepção</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Qualidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rastreio.frutosConsumidos.length === 0 ? <Vazio colunas={6} texto="Nenhum fruto consumido." /> : null}
                  {rastreio.frutosConsumidos.map((f, n) => (
                    <TableRow key={`${f.codigo}-${n}`} className={f.removido ? "text-muted-foreground" : undefined}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <LinkRastreio codigo={f.codigo} incluirCancelados={incluirCancelados} />
                        {f.removido ? <span className="ml-2"><Removido /></span> : null}
                      </TableCell>
                      <TableCell>{f.produto}</TableCell>
                      <TableCell className="text-right tabular-nums">{KG.format(f.kgConsumido)}</TableCell>
                      <TableCell>{formatarData(f.dataRecepcao)}</TableCell>
                      <TableCell>{descreverOrigem(f.origem)}</TableCell>
                      <TableCell>{f.origem?.qualidade ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}
        {!recepcao && !opOrigem ? (
          <p className="text-sm text-muted-foreground">Lote sem recepção nem OP de origem registrada.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CartaoParaFrente({ rastreio, incluirCancelados }: { rastreio: Rastreio; incluirCancelados: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Para frente</CardTitle>
        <CardDescription>OPs que usaram este fruto e os lotes de polpa que elas geraram.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {rastreio.opsQueConsumiram.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este fruto não foi usado em nenhuma OP.</p>
        ) : null}
        {rastreio.opsQueConsumiram.map((op) => (
          <section key={op.numero} className="space-y-3">
            <ResumoOP op={op} />
            <p className="text-sm">
              Usou <span className="font-medium tabular-nums">{KG.format(op.kgDesteLote)} kg</span> deste lote
              {op.consumoRemovido ? <span className="ml-2"><Removido /></span> : null}
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote de polpa</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">kg produzido</TableHead>
                    <TableHead className="text-right">Saldo (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {op.lotesPolpa.length === 0 ? <Vazio colunas={4} texto="Nenhuma polpa lançada." /> : null}
                  {op.lotesPolpa.map((p) => (
                    <TableRow key={p.codigo} className={p.removido ? "text-muted-foreground" : undefined}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <LinkRastreio codigo={p.codigo} incluirCancelados={incluirCancelados} />
                        {p.removido ? <span className="ml-2"><Removido /></span> : null}
                      </TableCell>
                      <TableCell>{p.produto}</TableCell>
                      <TableCell className="text-right tabular-nums">{KG.format(p.kg)}</TableCell>
                      <TableCell className="text-right tabular-nums">{KG.format(p.saldoKg)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

export function CartaoDestino({ destino }: { destino: DestinoLote }) {
  const linhas = linhasDoDestino(destino);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Destino do lote</CardTitle>
        <CardDescription>Para onde foi cada kg, pelos movimentos de estoque.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!destino.confere ? (
          <p className="text-sm text-destructive">
            A soma dos movimentos não bate com o saldo do lote. Avise o suporte.
          </p>
        ) : null}
        <Table className="max-w-md">
          <TableBody>
            {linhas.map((l, n) => (
              <TableRow key={l.rotulo} className={n === linhas.length - 1 ? "font-medium" : undefined}>
                <TableCell>{l.rotulo}</TableCell>
                <TableCell className="text-right tabular-nums">{KG.format(l.kg)} kg</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function resumoDosClientes(clientes: LinhaCliente[]) {
  const validos = clientes.filter((c) => !c.pedidoCancelado);
  return {
    clientes: new Set(validos.map((c) => `${c.cliente.cnpjCpf ?? ""}|${c.cliente.nome}`)).size,
    kg: validos.reduce((s, c) => s + c.kg, 0),
  };
}

export function CartaoClientes({ clientes, incluirCancelados }: { clientes: LinhaCliente[]; incluirCancelados: boolean }) {
  const resumo = resumoDosClientes(clientes);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clientes que receberam</CardTitle>
        <CardDescription>
          {resumo.clientes} {resumo.clientes === 1 ? "cliente" : "clientes"} · {KG.format(resumo.kg)} kg
          {incluirCancelados ? " (sem contar pedidos cancelados)" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Lote vendido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead className="text-right">kg</TableHead>
              <TableHead>Entrega</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.length === 0 ? <Vazio colunas={8} texto="Nenhuma venda deste lote." /> : null}
            {clientes.map((c, n) => (
              <TableRow key={`${c.pedidoNumero}-${c.loteVendido}-${n}`} className={c.pedidoCancelado ? "text-muted-foreground" : undefined}>
                <TableCell className="whitespace-nowrap">
                  <Link href={`/vendas/pedidos/${c.pedidoNumero}`} className="underline-offset-4 hover:underline">
                    {c.pedidoNumero}
                  </Link>
                  {c.pedidoCancelado ? <Badge variant="destructive" className="ml-2">Cancelado</Badge> : null}
                </TableCell>
                <TableCell>{formatarData(c.pedidoData)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <LinkRastreio codigo={c.loteVendido} incluirCancelados={incluirCancelados} />
                  {c.opNumero ? <p className="text-xs text-muted-foreground">polpa da <LinkOP numero={c.opNumero} /></p> : null}
                </TableCell>
                <TableCell>
                  {c.cliente.nome}
                  {c.cliente.cnpjCpf ? <p className="text-xs text-muted-foreground">{c.cliente.cnpjCpf}</p> : null}
                </TableCell>
                <TableCell className="text-sm">
                  {[c.cliente.contato, c.cliente.telefone, c.cliente.email].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {[c.cliente.enderecoEntrega, c.cliente.municipio].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{KG.format(c.kg)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {c.entrega ? ROTULOS_STATUS_ENTREGA[c.entrega.status] : "Retira"}
                  {c.entrega?.dataRealizada ? (
                    <p className="text-xs text-muted-foreground">
                      {formatarData(c.entrega.dataRealizada)}
                      {c.entrega.recebidoPor ? ` · ${c.entrega.recebidoPor}` : ""}
                    </p>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

Confira a rota do detalhe do pedido (`src/app/(dashboard)/vendas/pedidos/[numero]`): o parâmetro é o número do pedido, então `/vendas/pedidos/${c.pedidoNumero}` está certo.

- [ ] **Step 5: Página**

`src/app/(dashboard)/producao/rastreabilidade/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarLotes, rastrearLote } from "@/server/services/rastreabilidade";
import { formatarData } from "@/lib/formatacao";
import { KG } from "../processamento/formatos";
import { hrefRastreio, LinkRastreio } from "../_shared/link-rastreio";
import { CartaoClientes, CartaoDestino, CartaoLote, CartaoOrigem, CartaoParaFrente } from "./cartoes";

function hrefExport(codigo: string, formato: "pdf" | "csv" | "xlsx", incluirCancelados: boolean) {
  const params = new URLSearchParams({ lote: codigo, formato });
  if (incluirCancelados) params.set("cancelados", "1");
  return `/producao/rastreabilidade/export?${params}`;
}

export default async function RastreabilidadePage({
  searchParams,
}: {
  searchParams: Promise<{ lote?: string; cancelados?: string }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const sp = await searchParams;
  const termo = (sp.lote ?? "").trim();
  const incluirCancelados = sp.cancelados === "1";
  const rastreio = termo ? await rastrearLote(sessao, termo, { incluirCancelados }) : null;
  const encontrados = termo && !rastreio ? await buscarLotes(sessao, termo) : [];

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Rastreabilidade</h1>
        <p className="text-sm text-muted-foreground">
          De onde veio um lote e para quem foi, até os clientes da polpa feita com o fruto. Use no recall e na fiscalização.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="lote">Código do lote</Label>
          <Input id="lote" name="lote" defaultValue={termo} placeholder="Ex.: FA-261110-01 ou FA-2611" className="w-64" />
        </div>
        {incluirCancelados ? <input type="hidden" name="cancelados" value="1" /> : null}
        <Button type="submit">Rastrear</Button>
      </form>

      {termo && !rastreio ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {encontrados.length === 0 ? "Nenhum lote encontrado" : `Lotes com "${termo}" no código`}
            </CardTitle>
          </CardHeader>
          {encontrados.length > 0 ? (
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Saldo (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {encontrados.map((l) => (
                    <TableRow key={l.codigo}>
                      <TableCell className="font-medium">
                        <LinkRastreio codigo={l.codigo} incluirCancelados={incluirCancelados} />
                      </TableCell>
                      <TableCell>{l.produto}</TableCell>
                      <TableCell>{formatarData(l.data)}</TableCell>
                      <TableCell className="text-right tabular-nums">{KG.format(l.saldoKg)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {encontrados.length === 20 ? (
                <p className="pt-2 text-xs text-muted-foreground">Mostrando os 20 mais recentes. Digite mais do código para filtrar.</p>
              ) : null}
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {rastreio ? (
        <>
          <CartaoLote
            rastreio={rastreio}
            acoes={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={hrefRastreio(rastreio.lote.codigo, !incluirCancelados)} />}
                >
                  {incluirCancelados ? "Ocultar cancelados" : "Mostrar cancelados"}
                </Button>
                {(["pdf", "csv", "xlsx"] as const).map((formato) => (
                  <Button
                    key={formato}
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<a href={hrefExport(rastreio.lote.codigo, formato, incluirCancelados)} />}
                  >
                    {formato === "xlsx" ? "Excel" : formato.toUpperCase()}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/producao/lotes/${rastreio.lote.id}/etiqueta`} target="_blank" />}
                >
                  Etiqueta
                </Button>
              </>
            }
          />
          <CartaoOrigem rastreio={rastreio} incluirCancelados={incluirCancelados} />
          {rastreio.lote.categoria === "FRUTO" ? (
            <CartaoParaFrente rastreio={rastreio} incluirCancelados={incluirCancelados} />
          ) : null}
          <CartaoDestino destino={rastreio.destino} />
          <CartaoClientes clientes={rastreio.clientes} incluirCancelados={incluirCancelados} />
        </>
      ) : null}
    </div>
  );
}
```

Confira em outra página que use exportação (ex.: `producao/processamento/page.tsx`) como os botões de exportação são feitos e siga o mesmo componente se houver um pronto.

- [ ] **Step 6: Tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/producao/_shared" "src/app/(dashboard)/producao/rastreabilidade" "src/app/(dashboard)/producao/estoque/page.tsx" "src/app/(dashboard)/nav-items.ts" "src/app/(dashboard)/nav-items.test.ts"
git commit -m "feat(producao): tela de rastreabilidade por lote"
```

---

### Task 6: Código do lote vira link nas outras telas

**Files:**
- Modify: `src/app/(dashboard)/producao/estoque/page.tsx` (célula do código, linha ~185)
- Modify: `src/app/(dashboard)/producao/recepcao/page.tsx` (célula do código, linha ~115)
- Modify: `src/app/(dashboard)/producao/processamento/[numero]/page.tsx` (tabelas de consumo e produção)
- Modify: `src/app/(dashboard)/vendas/pedidos/[numero]/page.tsx` (célula do lote, linha ~133)

**Interfaces:**
- Consumes: `LinkRastreio` (Task 5).

- [ ] **Step 1: Trocar o texto do código pelo link**

Em cada arquivo, importar `LinkRastreio` (`../_shared/link-rastreio` no estoque e na recepção; `../../_shared/link-rastreio` no detalhe da OP; `@/app/(dashboard)/producao/_shared/link-rastreio` no detalhe do pedido) e trocar:

- estoque: `{lote.codigo}` → `<LinkRastreio codigo={lote.codigo} />`
- recepção: `{r.lote.codigo}` → `<LinkRastreio codigo={r.lote.codigo} />`
- detalhe da OP, consumo: `{c.lote.codigo}` → `<LinkRastreio codigo={c.lote.codigo} />`
- detalhe da OP, produção: `{p.lote.codigo}` → `<LinkRastreio codigo={p.lote.codigo} />`
- detalhe do pedido: `{item.lote.codigo}` → `<LinkRastreio codigo={item.lote.codigo} />`

Se o alias `@/app/...` não resolver, use o caminho relativo `../../../producao/_shared/link-rastreio`.

- [ ] **Step 2: Tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/producao/estoque/page.tsx" "src/app/(dashboard)/producao/recepcao/page.tsx" "src/app/(dashboard)/producao/processamento/[numero]/page.tsx" "src/app/(dashboard)/vendas/pedidos/[numero]/page.tsx"
git commit -m "feat(producao): código do lote abre a rastreabilidade"
```

---

### Task 7: Ajuda e documentos

**Files:**
- Modify: `content/ajuda/passo-a-passo.md` (nova seção 5.6, depois de "5.5. Etiqueta do lote")
- Modify: `docs/modulos/producao-estoque-vendas/03-regras-de-negocio.md` (RN-28)
- Modify: `docs/modulos/producao-estoque-vendas/08-duvidas-decisoes.md` (D-22, D-23 depois de D-21)
- Modify: `docs/modulos/producao-estoque-vendas/09-plano-de-entrega.md` (marcar 7f como a 7e foi marcada)
- Modify: `docs/superpowers/specs/2026-11-10-fase-7f-rastreabilidade-design.md` (status)

- [ ] **Step 1: Ajuda**

Inserir antes de `## 6. Vendas`:

```markdown
### 5.6. Rastreabilidade (recall)

Em **Produção → Rastreabilidade**, digite o código do lote e clique em
**Rastrear**. Também dá para clicar no código do lote no estoque, na
recepção, na OP ou no pedido. Se digitar só parte do código (ex.:
`FA-2611`), aparece a lista de lotes que batem.

- **Lote de polpa:** mostra a OP que o produziu (branqueamento, rendimento,
  balanço), os lotes de fruto usados, com a origem de cada um, e os
  clientes que compraram a polpa.
- **Lote de fruto:** mostra a recepção (talhão ou produtor), as OPs que o
  usaram, os lotes de polpa gerados e **todos os clientes** que compraram
  o fruto ou qualquer polpa dessas OPs. Num recall, essa é a lista de quem
  avisar.
- **Destino do lote:** quanto entrou, quanto foi vendido, usado em OP ou
  ajustado (amostra, avaria, vencido…) e o saldo.

Pedidos e OPs cancelados e linhas removidas ficam ocultos. Use **Mostrar
cancelados** para vê-los. O **PDF** traz o relatório completo para a
fiscalização; **CSV** e **Excel** trazem a lista de clientes com contato.
```

- [ ] **Step 2: RN-28 (doc 3)**

No fim do bloco **RN-28**, depois do parágrafo "**Mudança:** ...", acrescentar:

```markdown
**Destino do lote:** a consulta também mostra para onde foi cada kg
(vendido, consumido em OP, ajustes por motivo, saldo), pelos movimentos de
estoque. **Lista conservadora (D-22):** para um fruto, entram todos os
clientes de qualquer polpa das OPs que o usaram, sem ratear kg.
```

- [ ] **Step 3: Decisões (doc 8)**

Depois da linha `| D-21 | ...`, acrescentar:

```markdown
| D-22 | Recall do fruto | Na rastreabilidade de um fruto, ratear os kg da polpa entre os frutos da OP para dizer "quanto" cada cliente recebeu? | Não: listar todos os clientes de qualquer polpa da OP. A pergunta do recall é "quem pode ter recebido". | 7f | **Lista conservadora, sem rateio** (2026-11-10). |
| D-23 | Cancelados na rastreabilidade | Pedidos e OPs cancelados e linhas removidas aparecem? | Ocultos por padrão, com a opção "Mostrar cancelados" (marcados), também na exportação. | 7f | **Ocultos, com opção de mostrar** (2026-11-10). |
```

- [ ] **Step 4: Plano de entrega (doc 9) e spec**

Em `09-plano-de-entrega.md`, marcar a 7f como concluída do mesmo jeito que a 7e está marcada (procure "7e" no arquivo e repita o formato). Na spec, trocar `Status: desenho aprovado` por `Status: implementada (AAAA-MM-DD)` com a data do dia, e acrescentar logo abaixo um parágrafo curto com os ajustes feitos na implementação (se houver).

- [ ] **Step 5: Commit**

```bash
git add content/ajuda/passo-a-passo.md docs/modulos/producao-estoque-vendas docs/superpowers/specs/2026-11-10-fase-7f-rastreabilidade-design.md
git commit -m "docs(producao): ajuda e decisões da rastreabilidade (7f)"
```

---

### Task 8: Verificação final e navegador

- [ ] **Step 1: Suíte completa**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo verde. Se algum teste falhar, investigar antes de seguir.

- [ ] **Step 2: Conferência no navegador**

1. `npm run dev` (se a porta 3000 estiver presa, matar o PID do `next` antigo).
2. Entrar com `admin@nx-control-erp.local` / `TrocarSenha123!`, empresa "Empresa Demonstração".
3. Criar dados de teste: duas recepções, uma OP que consuma as duas e gere duas polpas, encerrar, um pedido de uma polpa com entrega, um pedido in natura do fruto, um pedido cancelado e um ajuste de amostra.
4. Conferir:
   - o menu Produção → Rastreabilidade;
   - a busca por trecho;
   - a consulta de um lote de polpa e de um lote de fruto (cartões, links, destino que fecha com o saldo);
   - Mostrar/Ocultar cancelados;
   - PDF, CSV e Excel (abrir os arquivos);
   - os links de código no estoque, na recepção, na OP e no pedido;
   - a largura de celular (sem rolagem horizontal fora das tabelas).
5. Apagar do banco de dev os dados criados para o teste e a pasta `.playwright-mcp/`.

- [ ] **Step 3: Relatório final**

Resumo para o usuário: o que foi entregue, decisões tomadas (D-22, D-23), ajustes feitos em relação à spec e pendências (D-10 segue aguardando a ADEPARA). O usuário faz push, PR e merge.
