# Fase 7f — Rastreabilidade

Data: 2026-11-10 · Status: desenho aprovado

Sexto sub-projeto da Fase 7 (ver
[plano de entrega](../../modulos/producao-estoque-vendas/09-plano-de-entrega.md)).
Parte da 7b (lotes, ledger de estoque, ajustes), da 7c (pedidos e entregas)
e da 7e (OP com consumo e produção). Entrega a **consulta por lote para
trás e para frente**, até os clientes da polpa derivada, com o destino de
cada kg do lote e exportação em PDF (relatório completo), CSV e Excel
(clientes atingidos). **Não inclui** a etiqueta (entregue na 7e; D-10
segue aguardando a ADEPARA), consulta entre filiais nem painel e
relatórios (7g).

Regras de origem: RN-28 do
[doc 3](../../modulos/producao-estoque-vendas/03-regras-de-negocio.md),
F6 do [doc 5](../../modulos/producao-estoque-vendas/05-fluxos-telas-permissoes.md)
e a seção "Rastreabilidade e etiqueta" do
[doc 7](../../modulos/producao-estoque-vendas/07-relatorios-indicadores.md).

Decisões deste desenho (registrar no doc 08):

- **D-22 — Lista conservadora no recall:** para um lote de fruto, entram
  todos os clientes que compraram qualquer lote de polpa de uma OP que
  consumiu esse fruto, sem rateio proporcional de kg. A pergunta do recall
  é "quem pode ter recebido", não "quanto".
- **D-23 — Cancelados:** pedido cancelado, OP cancelada e linha de
  consumo/produção removida ficam **ocultos por padrão**. A opção "Mostrar
  cancelados" exibe-os marcados. A exportação segue a mesma escolha.
- **Destino do lote:** a consulta mostra para onde foi cada kg do lote
  (vendido, consumido em OP, ajustes por motivo, saldo), tirado do ledger.
- **Contato completo do cliente** na tela e no PDF, para o recall.

## 1. Modelo

Sem mudanças no schema e sem migration. A árvore sai das relações que já
existem:

```
Lote (FRUTO) ─ RecepcaoFruto                       (origem)
     │
     └─ ConsumoOP ─ OrdemProducao ─ ProducaoOP ─ Lote (POLPA)
                                                    │
Lote (qualquer) ─ ItemPedidoVenda ─ PedidoVenda ─ Cliente, Entrega
Lote (qualquer) ─ MovimentoEstoque                 (destino do lote)
```

Só fruto é consumido em OP (`ordemProducao.ts` recusa outra categoria),
então a profundidade é fixa: não há polpa de polpa nem recursão. Índices
usados: `consumos_op(loteId)`, `itens_pedido_venda(loteId)`,
`movimentos_estoque(loteId)`, `producoes_op.loteId` (único) e
`lotes(filialId, codigo)` (único).

## 2. Serviço (`src/server/services/rastreabilidade.ts`)

Tudo restrito a `sessao.filialId`. O código digitado é normalizado
(`trim`, maiúsculas).

### `buscarLotes(sessao, trecho)`

Até 20 lotes da filial cujo código contém o trecho (sem diferenciar
maiúsculas), mais recentes primeiro: código, produto, data, saldo. Serve
para a lista de resultados quando o código não bate exato.

### `rastrearLote(sessao, codigo, { incluirCancelados })`

Retorna `null` se o lote não existir na filial. Senão:

```ts
type Rastreio = {
  lote: {
    id; codigo; produto; categoria: "FRUTO" | "POLPA";
    data; validade; local; quantidadeInicialKg; saldoKg;
    status: StatusLote; // statusDoLote (src/lib/producao/statusLote.ts)
  };
  // Fruto: a recepção. Polpa: a OP de origem e os frutos consumidos.
  recepcao: {
    data; origem: "PROPRIA" | "TERCEIRO"; talhao?; fornecedor?;
    qualidade?; pesoBrutoKg; descarteKg; documento?; cancelada: boolean;
  } | null;
  opOrigem: OpRastreio | null;           // só polpa
  frutosConsumidos: FrutoConsumido[];    // só polpa: lotes de fruto da OP de origem
  opsQueConsumiram: OpConsumidora[];     // só fruto
  destino: DestinoLote;
  clientes: LinhaCliente[];
};

type OpRastreio = {
  numero; data; status; responsavel?;
  branqueamentoTemperaturaC?; branqueamentoTempoS?;
  rendimento: number | null; balanco; branqueamento; // de resumirOP
};

type FrutoConsumido = {
  codigo; produto; kgConsumido; dataRecepcao;
  origem; talhao?; fornecedor?; qualidade?; removido: boolean;
};

type OpConsumidora = OpRastreio & {
  kgDesteLote: number;   // soma dos consumos não removidos deste lote na OP
  lotesPolpa: { codigo; produto; kg; saldoKg; removido: boolean }[];
};

// Tudo do ledger (MovimentoEstoque do lote, quantidade com sinal: saída < 0).
// Os campos abaixo são mostrados em kg positivos, salvo `ajustes`.
type DestinoLote = {
  entradaKg: number;          // ENTRADA ou PRODUCAO_OP
  estornoEntradaKg: number;   // ESTORNO_RECEPCAO ou ESTORNO_PRODUCAO_OP (recepção cancelada, polpa removida)
  vendidoKg: number;          // VENDA − ESTORNO_VENDA
  consumidoOpKg: number;      // CONSUMO_OP − ESTORNO_CONSUMO_OP
  ajustes: { motivo: MotivoAjusteEstoque; kg: number }[]; // líquido por motivo (+ entrada, − saída)
  saldoKg: number;            // Lote.saldoKg
  confere: boolean;           // soma assinada de todos os movimentos = saldoKg
};

type LinhaCliente = {
  caminho: "DIRETO" | "POLPA";   // DIRETO = o próprio lote consultado
  loteVendido: string;           // código
  opNumero?: string;             // quando POLPA
  pedidoNumero: number; pedidoData; pedidoCancelado: boolean;
  kg: number;
  entrega: { status; dataPrevista; dataRealizada?; recebidoPor? } | null; // null = retira na propriedade
  cliente: {
    nome; cnpjCpf?; contato?; telefone?; email?; municipio?; enderecoEntrega?;
  };
};
```

Regras:

- **Polpa:** `opOrigem` e `frutosConsumidos` vêm de `ProducaoOP` →
  `OrdemProducao` → `ConsumoOP`. Clientes: só `DIRETO`.
- **Fruto:** `recepcao` vem de `RecepcaoFruto`. `opsQueConsumiram` vem de
  `ConsumoOP` deste lote, agrupado por OP. Clientes: `DIRETO` (venda in
  natura) mais `POLPA` (itens de pedido de todo lote de polpa dessas OPs).
- **Cancelados (D-23):** sem `incluirCancelados`, saem pedidos
  `CANCELADO`, OPs `CANCELADA` (e o que vem delas) e linhas com
  `removidoEm`. Com a opção, entram marcados (`pedidoCancelado`,
  `status`, `removido`). `destino` vem do ledger, que já tem os
  estornos, e não muda com a opção.
- **Rendimento, balanço e branqueamento** pelo `resumirOP` de
  `src/lib/producao/op.ts`, com a configuração de produção da filial,
  considerando só as linhas não removidas.
- **Consultas fixas:** lote + recepção/OP de origem; consumos do lote;
  OPs envolvidas com consumos, produções e lotes de polpa (um `findMany`
  com `in`); itens de pedido dos lotes envolvidos com pedido, entrega e
  cliente (um `findMany` com `in`); movimentos do lote (um `findMany`,
  com o motivo do ajuste).
  Nenhum laço de consulta por lote, OP ou pedido.
- `clientes` ordenado por data do pedido e número.

## 3. Tela (`/producao/rastreabilidade`, `producao:ler`)

Server Component. Parâmetros: `?lote=<código ou trecho>&cancelados=1`.

- **Busca:** campo de código (formulário GET). Código exato → consulta.
  Sem correspondência exata → lista de `buscarLotes` com link para cada
  um; nenhuma → "Nenhum lote encontrado". Sem `lote` → só o campo e uma
  linha explicando o uso.
- **Cartão Lote:** código, produto, data, validade, local, kg inicial,
  saldo e status. Ações: PDF, CSV, Excel e Etiqueta (a rota da 7e; o
  bloqueio de polpa de OP aberta continua valendo lá).
- **Cartão Origem:** recepção (fruto) ou OP + tabela de frutos consumidos
  (polpa).
- **Cartão Para frente** (só fruto): para cada OP, cabeçalho com nº,
  data, status, kg deste lote, rendimento, balanço e branqueamento, mais a
  tabela de lotes de polpa gerados.
- **Cartão Destino do lote:** entrada, estorno da entrada (só se houver),
  vendido, consumido em OP, cada ajuste por motivo e saldo. Se `confere` for falso, aviso de divergência.
- **Cartão Clientes que receberam:** total de clientes distintos e de kg;
  tabela com caminho, lote vendido, OP, pedido, data, cliente, documento,
  telefone, e-mail, município, endereço, kg e entrega.
- **Mostrar cancelados:** botão que alterna `cancelados=1`; linhas
  canceladas/removidas com badge.
- **Links:** lote → `/producao/rastreabilidade?lote=`, OP →
  `/producao/processamento/[numero]`, pedido → `/vendas/pedidos/[numero]`.

### Atalhos e menu

- `nav-items.ts`: item **Rastreabilidade** em Produção.
- O **código do lote vira link** para a rastreabilidade no estoque, na
  recepção, no detalhe da OP (lotes consumidos e produzidos) e no detalhe
  do pedido (por item). Sem botão extra nas linhas.

## 4. Exportação (`/producao/rastreabilidade/export`)

`GET ?lote=<código exato>&formato=pdf|csv|xlsx&cancelados=1`, com
`producao:ler`. Lote inexistente → 404.

- **CSV e Excel:** `responderExport` com as linhas de `clientes`
  (colunas iguais às da tabela da tela, mais "Cancelado"). Nome do
  arquivo: `rastreabilidade-<codigo>`.
- **PDF:** relatório completo. Cabeçalho com empresa/filial, lote, quem
  gerou e se inclui cancelados. Seções: Lote, Origem (recepção ou OP +
  frutos consumidos), Para frente (uma tabela de OPs e uma de lotes de
  polpa), Destino do lote, Clientes que receberam. Seção sem linhas mostra
  "Nenhum registro".

### PDF em seções (`src/lib/export/pdf.ts`)

Nova `gerarPdfSecoes(secoes, cabecalho)`, em que cada seção é
`{ titulo: string; linhas: T[]; colunas: ColunaExport<T>[] }`. Cada
seção tem título, larguras de coluna próprias, cabeçalho de colunas
repetido na quebra de página e "Nenhum registro" quando vazia. Rodapé e
cabeçalho do documento ficam como hoje. `gerarPdf(linhas, colunas,
cabecalho)` passa a chamar `gerarPdfSecoes` com uma seção sem título, e a
saída dos exports atuais não muda.

## 5. Permissões

Nada novo: `producao:ler` cobre a tela e a exportação (doc 5). Dados de
cliente aparecem para quem tem `producao:ler`, como já acontece na
entrega.

## 6. Ajuda e documentos

- `content/ajuda/passo-a-passo.md`: seção "Rastrear um lote (recall)".
- Doc 3 (RN-28): o destino do lote e a lista conservadora.
- Doc 8: D-22 e D-23 com data.
- Doc 9 e este arquivo: status ao final.

## 7. Testes

- **`rastreabilidade.test.ts`** (Vitest, banco de dev). Cenário fixo:
  dois lotes de fruto (um próprio com talhão, um de terceiro), uma OP
  encerrada que consome os dois e gera dois lotes de polpa, uma linha de
  consumo removida, uma OP cancelada, pedidos de polpa (um cancelado), uma
  venda in natura do fruto e um ajuste de amostra. Confere:
  - polpa → OP de origem, frutos consumidos (sem o removido), clientes
    diretos;
  - fruto → recepção, OPs (sem a cancelada), lotes de polpa, clientes
    `DIRETO` e `POLPA`;
  - `incluirCancelados` traz pedido cancelado, OP cancelada e linha
    removida marcados;
  - destino do lote fecha com o saldo;
  - lote de outra filial → `null`; `buscarLotes` por trecho.
- **`pdf.test.ts`:** `gerarPdfSecoes` com duas seções (uma vazia) gera
  PDF válido; `gerarPdf` continua passando nos testes atuais.
- **Navegador:** busca por trecho, consulta de fruto e de polpa, mostrar
  cancelados, os três formatos de exportação e os atalhos.

## 8. Fora da 7f

- Consulta entre filiais.
- Rateio proporcional de kg do fruto por cliente (D-22).
- Busca por período, produto ou cliente (relatórios da 7g).
- D-10 (dizeres da etiqueta).
