# Relatórios exportáveis — Fase 6, sub-projeto 6b

## Contexto

Fase 6 (Gestão) tem 4 peças distintas: Dashboard executivo (sub-projeto 6a,
já implementado e mesclado em `staging`), Relatórios exportáveis, Filtros
globais e Auditoria/aprovações. Este documento desenha o segundo:
**Relatórios exportáveis**.

Escopo em prosa original: `docs/fases/fase-6-gestao.md`, seção
"Relatórios" — export em Excel, CSV e PDF de: contas a pagar/receber,
aging de fornecedores/clientes, fluxo de caixa realizado/projetado,
conciliação bancária, orçado x realizado, caixa por centro de
custo/lucro/safra, necessidade de capital de giro, obrigações e
recebimentos futuros, movimentação bancária, auditoria de alterações.

### Por que decompor

A lista original cobre ~10 relatórios × 3 formatos — uma explosão de
escopo bidimensional grande demais para um único sub-projeto. Este
documento desenha só o **mecanismo de export** (reaproveitável por
qualquer relatório futuro) e o aplica a 2 relatórios de referência,
escolhidos para cobrir os 2 formatos de dado mais comuns no sistema: uma
lista tabular (**Contas a pagar/receber**) e um relatório de período com
números agregados (**Fluxo de caixa realizado**). Estender o botão de
export para os relatórios restantes é wiring repetitivo sobre o mesmo
mecanismo — trabalho futuro, não deste documento.

### Decisões já confirmadas com o usuário

1. Formatos nesta versão: **CSV e Excel**. PDF fica fora — é o formato
   mais caro (layout de página, cabeçalho/rodapé, paginação) e nenhum dos
   dois formatos escolhidos precisa dele para os casos de uso reais
   (abrir na planilha, reprocessar dados).
2. "Necessidade de capital de giro" fica fora do escopo — mesmo motivo já
   registrado para o Dashboard executivo: não existe modelo de dados para
   esse conceito no sistema hoje (sem cadastro de
   empréstimo/financiamento).
3. Relatórios de referência: **Contas a pagar/receber** e **Fluxo de
   caixa realizado**.

## Seção 1 — Arquitetura do mecanismo de export

- **Route Handlers, não Server Actions.** Cada relatório ganha um
  `export/route.ts` colocado na própria pasta da página (ex.:
  `financeiro/contas-a-pagar/export/route.ts`). Server Actions não fazem
  download binário de forma limpa (não há um jeito idiomático de
  devolver um arquivo com `Content-Disposition` a partir de uma Server
  Action); um Route Handler resolve isso nativamente.
- **Utilitários genéricos em `src/lib/export/`** — a lógica de gerar
  CSV/Excel nunca se duplica entre relatórios, presente ou futuro:

  ```ts
  export type ColunaExport<T> = {
    rotulo: string;
    valor: (linha: T) => string | number | Date;
  };

  // src/lib/export/csv.ts
  export function gerarCsv<T>(linhas: T[], colunas: ColunaExport<T>[]): string;

  // src/lib/export/excel.ts
  export async function gerarExcel<T>(
    linhas: T[],
    colunas: ColunaExport<T>[],
    nomeAba: string,
  ): Promise<Buffer>;
  ```

  Cada relatório só declara suas colunas (rótulo + como extrair o valor
  da linha) — nenhuma lógica de serialização é escrita por relatório.

- **Dependência nova: `exceljs`** para Excel — permite números e datas
  como células nativas (não texto formatado), então o usuário pode
  somar/filtrar/ordenar direto na planilha. CSV usa `Papa.unparse` do
  `papaparse` (já presente no projeto, hoje só usado para importação).

- **Localização do CSV**: separador `;` (não `,`) — em configuração
  regional pt-BR do Excel, `,` é separador decimal, não de coluna; um CSV
  separado por vírgula abre despejado numa única coluna. `Papa.unparse`
  aceita `delimiter: ";"`. O arquivo também leva um BOM UTF-8 no início,
  para acentos renderizarem corretamente ao abrir no Excel.

- **Permissão**: cada rota replica a checagem de permissão do relatório
  correspondente.
  - `listarFluxoDeCaixaRealizado` (`fluxoDeCaixa.ts`) já chama
    `requirePermission(sessao.perfil, "lancamento:ler")` internamente —
    a rota de export do fluxo de caixa herda essa checagem de graça, só
    precisa capturar o `PermissionError`.
  - `listarTitulos` (`titulo.ts`) não checa permissão por si (a página
    `contas-a-pagar/page.tsx` checa `titulo:ler` antes de chamar) — a
    rota de export de contas a pagar/receber precisa da checagem
    explícita, replicando o que a página já faz.

- **Erros**: `PermissionError` capturado → resposta `403` (texto simples,
  sem redirect — é uma rota de API, não uma página). Qualquer outro erro
  → `500`.

- **Botão de export = link simples, sem JavaScript**: um `<a
  href="/financeiro/contas-a-pagar/export?formato=csv">Exportar
  CSV</a>` — o navegador já trata o download a partir do cabeçalho
  `Content-Disposition: attachment` da resposta, sem precisar de
  componente client nem `fetch` manual.

## Seção 2 — Mapeamento de colunas dos 2 relatórios de referência

### Contas a pagar/receber

Uma linha por **parcela** (não por título) — é o nível de detalhe mais
útil: cada parcela tem seu próprio vencimento/valor/status, e é assim que
a maioria dos ERPs exporta esse tipo de relatório.

| Coluna | Origem |
|---|---|
| Documento | `titulo.documento` |
| Fornecedor/Cliente | `titulo.fornecedor?.nome ?? titulo.cliente?.nome` |
| Categoria | `titulo.categoriaFinanceira.nome` |
| Nº parcela | `parcela.numero` |
| Vencimento | `parcela.dataVencimento` |
| Valor atualizado | `Number(parcela.valorAtualizado)` |
| Status | `parcela.status` |

Duas rotas — `contas-a-pagar/export/route.ts` (tipo `"PAGAR"` fixo) e
`contas-a-receber/export/route.ts` (tipo `"RECEBER"` fixo) — espelhando
as duas páginas que já existem separadas hoje. Sem query param de tipo.

### Fluxo de caixa realizado

Uma linha por **sub-período** — o array que `listarFluxoDeCaixaRealizado`
já devolve, na mesma granularidade e data de referência que a página
estiver mostrando (`?granularidade=&data=`, os mesmos nomes de query
param que a página já usa).

| Coluna | Origem |
|---|---|
| Período | `formatarRotuloPeriodo(granularidade, periodo.inicio, periodo.fim)` |
| Saldo inicial | `periodo.saldoInicial` |
| Entradas | `periodo.entradas` |
| Saídas | `periodo.saidas` |
| Geração líquida | `periodo.geracaoLiquida` |
| Saldo final | `periodo.saldoFinal` |

## Seção 3 — Arquivos e wiring na UI

- `src/lib/export/csv.ts`, `src/lib/export/excel.ts` — os dois
  utilitários genéricos da Seção 1.
- `src/app/(dashboard)/financeiro/contas-a-pagar/export/route.ts`,
  `.../contas-a-receber/export/route.ts`,
  `.../fluxo-de-caixa/export/route.ts` — um `GET` cada, aceitando
  `?formato=csv|xlsx` (e, no caso do fluxo de caixa,
  `?granularidade=&data=` também).
- `src/app/(dashboard)/_shared/exportar-links.tsx` (novo, compartilhado
  entre os 3 pontos de wiring): `<ExportarLinks baseHref="..."
  queryString="..." />` renderiza os 2 links ("Exportar CSV" / "Exportar
  Excel"), evitando repetir o mesmo par de `<a>` três vezes.
- Nas 3 páginas (`contas-a-pagar/page.tsx`, `contas-a-receber/page.tsx`,
  `fluxo-de-caixa/page.tsx`): adicionar `<ExportarLinks
  baseHref="/financeiro/contas-a-pagar/export" />` (e equivalentes) perto
  do título da página — no caso do fluxo de caixa, `queryString` propaga
  `granularidade`/`data` atuais da página para a URL de export, para que
  o arquivo exportado reflita exatamente o período que está na tela.
- Nome do arquivo: `<nome-do-relatorio>-<data-de-hoje>.<ext>` (ex.:
  `contas-a-pagar-2026-09-12.csv`, `fluxo-de-caixa-2026-09-12.xlsx`) —
  data do momento do export, não do período do relatório (evita colisão
  de nome ao exportar o mesmo relatório mais de uma vez no mesmo mês).

## Arquivos afetados (resumo)

- `src/lib/export/csv.ts`, `src/lib/export/excel.ts` (novos).
- `package.json` — nova dependência `exceljs`.
- `src/app/(dashboard)/financeiro/contas-a-pagar/export/route.ts`,
  `.../contas-a-receber/export/route.ts`,
  `.../fluxo-de-caixa/export/route.ts` (novos).
- `src/app/(dashboard)/_shared/exportar-links.tsx` (novo).
- `src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx`,
  `.../contas-a-receber/page.tsx`, `.../fluxo-de-caixa/page.tsx`
  (editar: adicionar `<ExportarLinks />`).
- `docs/backlog.md` — registrar PDF e os ~8 relatórios restantes como
  trabalho futuro sobre o mesmo mecanismo.
