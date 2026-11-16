# Rateio do custo da OP pelo preço de referência

Data: 2026-11-16 · Status: implementada (2026-11-16)

Ajustes na implementação: `ratearCustoOP` recebe o `CustoOP` e devolve sempre
`{ custoKgPorProduto, semPreco }` (com o médio em todos quando falta preço);
a auditoria passou a gravar listas como lista (`src/server/audit/diff.ts`
transformava arrays em texto), necessário para o `rateio` do `ENCERRAR`.

Último item do backlog da Fase 7 (D-06). Hoje todas as polpas de uma OP
recebem o mesmo custo/kg (RN-13), igual à planilha. Como o grosso usa mais
fruto por kg e vale mais, a margem por qualidade fica distorcida: o grosso
parece mais lucrativo do que é e o fino menos. O custo total da OP está
certo; o que muda é a divisão entre os produtos.

Regras de origem: RN-13 do
[doc 3](../../modulos/producao-estoque-vendas/03-regras-de-negocio.md);
D-05, D-06 e D-17 do
[doc 8](../../modulos/producao-estoque-vendas/08-duvidas-decisoes.md).

## Decisões deste desenho (registrar no doc 08)

- **D-06 — fechada:** o custo da OP é rateado entre os produtos pelo **preço
  de referência/kg** do cadastro (valor de venda relativo). Sem preço em
  algum produto, a OP não encerra (2026-11-16).
- **D-17 — fechada:** não haverá importação de arquivo; a filial da
  Hortitex é criada pelo Administrador e implantada do zero. Mudança de plano
  vira tarefa nova (2026-11-16).

Não há decisão nova; a próxima livre continua sendo D-36.

## Regra (RN-13 revisada)

- `custo total = custo do fruto consumido + custo dos insumos` (sem mudança).
- Cada linha de produção ativa tem peso `kg × preço de referência/kg` do seu
  produto. Para cada produto:
  `custo/kg = custo total × preço ÷ Σ(kg × preço)` das linhas da OP.
  Ou seja, o custo/kg é proporcional ao preço, e `Σ(kg × custo/kg)` = custo
  total (a menos de centavos de arredondamento; custo/kg com 4 casas).
- **Sem rateio necessário:** se a OP tem um único produto, ou todos os
  produtos têm o mesmo preço, o resultado é o custo médio
  (`custo total ÷ kg de polpa`), igual a hoje. Nesse caso a falta de preço
  não importa.
- **Preço faltando** (mais de um produto distinto e algum sem preço ou com
  preço zero):
  - OP aberta: o custo provisório usa o custo médio em todos os lotes e a
    tela avisa quais produtos estão sem preço;
  - encerrar é recusado: "Cadastre o preço de referência de: Polpa X, Polpa
    Y".
- **Custo médio/kg da OP** = `custo total ÷ kg de polpa`, continua gravado em
  `OrdemProducao.custoKgPolpa` (agora com esse significado).
- O preço usado é o do cadastro **no momento** do cálculo (como os insumos,
  D-05). O que congela é o resultado: `Lote.custoKg` gravado no encerramento.
  Reabrir e encerrar de novo recalcula com o preço daquele momento.
- OPs já encerradas não são recalculadas (só existem dados de teste).

Exemplo: R$ 1.200 de custo; 100 kg grosso (R$ 30), 150 kg médio (R$ 20),
50 kg fino (R$ 10). Σ(kg × preço) = 3.000 + 3.000 + 500 = 6.500.
Grosso = 1.200 × 30 ÷ 6.500 = R$ 5,5385/kg; médio R$ 3,6923; fino
R$ 1,8462. Conferência: 553,85 + 553,85 + 92,31 = 1.200,01. Médio da OP:
R$ 4,00/kg.

## Modelo

Sem migration. `Lote.custoKg` já guarda o custo por lote (usado em vendas e
margem); `OrdemProducao.custoKgPolpa` passa a ser o custo médio.

## Código

**Função pura** em `src/lib/producao/op.ts`:

```ts
ratearCustoOP(
  custoTotal: number,
  producoes: { produtoId: string; descricao: string; quantidadeKg: number; precoKg: number | null }[],
): { ok: true; custoKgPorProduto: Map<string, number> }
 | { ok: false; semPreco: string[]; custoMedioKg: number }
```

- sem produção ou kg total zero → `ok: true` com mapa vazio;
- um produto distinto → `ok: true` com o custo médio;
- algum preço nulo ou ≤ 0 → `ok: false` com as descrições (sem repetir,
  na ordem das linhas) e o custo médio, para o provisório;
- senão, o rateio acima, arredondado a 4 casas.

`custoOP` continua devolvendo os totais e `custoKgPolpa` (médio).

**Serviço** `src/server/services/ordemProducao.ts`:

- `linhasAtivas` passa a trazer, nas produções, `produtoId`, descrição e
  `precoReferenciaKg` do produto (o tipo `LinhasOP` ganha esses campos; quem
  só usa `quantidadeKg` não muda).
- `recalcularCustoProvisorio`: calcula o rateio; com `ok`, grava o custo/kg
  em cada lote conforme o produto; senão grava o médio. Os lotes de mesmo
  produto recebem o mesmo valor (um `updateMany` por produto).
- `encerrarOP`: depois das validações atuais, recusa se `ok: false` (mensagem
  acima); grava totais e médio na OP e o custo/kg por produto nos lotes. A
  auditoria `ENCERRAR` ganha `rateio: [{ produto, kg, precoKg, custoKg }]`.
- O resumo da OP expõe `semPreco: string[]` (vazio quando o rateio é possível
  ou desnecessário), para o aviso da tela.

## Telas

**OP** (`/producao/processamento/[numero]`):

- Resumo: rótulo "Custo médio/kg" (encerrada) e "Custo médio/kg
  (provisório)" (aberta).
- Tabela de produção: coluna **"Custo/kg"** antes de "Local", lida de
  `lote.custoKg` (provisório enquanto aberta).
- OP aberta com `semPreco` não vazio: aviso acima da tabela de produção,
  "Sem preço de referência: Polpa X. Cadastre o preço para encerrar a OP; até
  lá o custo é o médio." Link "Editar produtos" para `/cadastros/produtos`
  só para quem tem `cadastroProducao:escrever`.

**Listagem de processamento** (`/producao/processamento`) e seu export:
coluna "Custo/kg" vira "Custo médio/kg". **Relatório de processamento**
(7g2b): o cálculo já é total ÷ kg; mudam só os rótulos — tabela "Custo por
fruta" coluna "Custo" vira "Custo médio" (`relatorios/processamento/page.tsx`)
e "Custo/kg (R$)" vira "Custo médio/kg (R$)" nas duas ocorrências de
`src/server/export/relatorioProcessamento.ts`. O Estoque continua mostrando
"Custo/kg" do lote, que agora é o rateado.

**Cadastro de produto** (`produto-dialog-form.tsx`): dica abaixo do campo
preço de referência, "Sugerido na venda e usado para dividir o custo da OP
entre as polpas."

## Testes

- **Unitários** (`op.test.ts`, `ratearCustoOP`): exemplo de três produtos
  (valores acima e soma ≈ total); dois produtos; produto único sem preço
  (médio, `ok`); duas linhas do mesmo produto; preço faltando e preço zero
  (`ok: false`, nomes sem repetir, médio); kg zero; mesmo preço em todos
  (igual ao médio).
- **Serviço** (`ordemProducao.test.ts`): encerrar com dois produtos grava
  custos diferentes nos lotes e o médio na OP; encerrar com preço faltando é
  recusado; provisório com preço faltando grava o médio e `semPreco` sai no
  resumo; reabrir, mudar o preço e encerrar recalcula; os testes atuais de
  custo (produto único) seguem passando.
- **Navegador:** cenário por script (fruta, dois produtos de polpa com
  preços, um sem preço), OP com as duas polpas: aviso, recusa ao encerrar,
  cadastrar o preço, encerrar e conferir custo/kg por lote; limpar no fim.

## Docs

- Doc 03: RN-13 reescrita (rateio pelo preço; bloqueio sem preço).
- Doc 08: D-06 e D-17 fechadas com data.
- Backlog: sai "Rateio do custo da OP por qualidade"; entra "Histórico do
  preço de referência do produto" (ver Fora do escopo).
- Ajuda (`content/ajuda/passo-a-passo.md`): seção da OP explica o custo por
  produto e o bloqueio; cadastro de produto cita o preço de referência.
- `docs/fases/fase-7-producao-estoque-vendas.md` e README do módulo: Fase 7
  concluída, sem backlog pendente.

## Fora do escopo

- Recalcular OPs já encerradas — **descartado:** só existem dados de teste.
- Fator de equivalência separado do preço ou informado por OP —
  **descartado:** o usuário escolheu o preço de referência.
- Histórico de preço de referência (hoje o preço usado fica só na auditoria
  do encerramento) — **→ backlog.**
