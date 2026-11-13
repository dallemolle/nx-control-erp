# Fase 7g2b — Relatório de origem e relatório de processamento

Data: 2026-11-13 · Status: desenho aprovado

Segunda metade da 7g2 (D-27); com ela a 7g fica concluída. A primeira
metade está na [spec da 7g2a](2026-11-12-fase-7g2a-relatorios-design.md),
cujas convenções este documento reaproveita sem repetir (tela por relatório
em `/producao/relatorios/<nome>`, D-28; contagem do painel, D-29).

Regras de origem: seções "Origem da matéria-prima (REL_ORIGEM)" e
"Processamento (REL_PROCESSAMENTO)" do
[doc 7](../../modulos/producao-estoque-vendas/07-relatorios-indicadores.md);
RN-10, RN-11, RN-12, RN-13, RN-30, RN-31 e RN-33 do
[doc 3](../../modulos/producao-estoque-vendas/03-regras-de-negocio.md).

Decisões deste desenho (registrar no doc 08):

- **D-30 — Últimas OPs não se repetem:** a tabela "Últimas OPs" do doc 07
  já existe na tela Processamento (mesmas colunas, filtro, exportação). O
  relatório de processamento traz só o link "Ver as OPs do período" para
  `/producao/processamento?inicio=…&fim=…`.
- **D-31 — OP aberta no relatório de processamento:** os volumes seguem a
  D-29 (abertas entram em nº de OPs, fruto, polpa e rendimento médio, e
  batem com o painel e o mensal). Rendimento mínimo e máximo, balanço de
  massa e custo usam **só OPs encerradas**, porque a OP aberta com fruto
  lançado e polpa ainda não lançada distorce mínimo e balanço.
- **D-32 — Ano do relatório de origem e valor de fruto próprio:** a
  produtividade dos talhões e o preço por mês usam o ano da data "Até" do
  período (um filtro só). Valor pago e preço médio aparecem só para
  fornecedores; nos talhões ficam "—", porque o valor gravado é o
  custo-padrão da fruta (D-04), não um pagamento.

## 1. Modelo

Sem mudanças no schema e sem migration. Origem sai de `RecepcaoFruto`
(+ `Talhao`, `Fornecedor`, `Produto`, `Fruta`); processamento sai de
`listarOPs` (que já traz `aguaLitros`, `carocoResiduoKg`, `perdaKg`, o
resumo da OP e o custo gravado das encerradas).

## 2. Base comum

- Filtro De/Até na URL (`inicio`, `fim`) por `periodoDaUrl`; padrão = mês
  atual; atalhos de `producao/_shared/atalhos.ts` ("Mês atual", "Mês
  anterior", "Ano").
- Uma consulta por fonte para o intervalo inteiro; nada de consulta por
  talhão, fornecedor ou mês. Mês = mês UTC da data do evento
  (`agruparPorMes`).
- Recepções e OPs canceladas ficam fora; linhas de OP removidas também
  (D-29).
- Funções puras em `src/lib/producao/relatorios.ts`; divisões com
  denominador zero devolvem `null` (tela mostra "—").
- Tabelas com `TabelaRelatorio`/`formatarCelula` de
  `producao/relatorios/_shared/tabela.tsx`.

## 3. Relatório de origem (`/producao/relatorios/origem`)

Serviço: `buscarRelatorioOrigem(sessao, periodo)` em
`src/server/services/relatorioProducao/origem.ts`. O ano é
`periodo.fim.getUTCFullYear()`.

### Consultas

1. Período: `recepcaoFruto.groupBy` por `talhaoId`, `fornecedorId` e
   `produtoId`, `status = ATIVA`, somando `pesoBrutoKg`, `descarteKg`,
   `valorTotal` e contando as recepções.
2. Ano: `groupBy` por `talhaoId` (`origem = PROPRIA`), somando bruto e
   descarte e contando as recepções.
3. Ano: `groupBy` por `produtoId` e `data` (`origem = TERCEIRO`), somando
   bruto, descarte e valor; separado em 12 meses com `agruparPorMes`.
4. Cadastros: talhões da filial (com fruta e área), fornecedores
   envolvidos, produtos e frutas da empresa.

Peso líquido = bruto − descarte, como no painel.

### Tabelas

- **Por origem:** uma linha por talhão próprio e por fornecedor. Colunas:
  origem (nome), tipo (Própria/Terceiro), kg líquido por fruta (só frutas
  com recepção no período, em ordem de nome), kg total, valor pago, preço
  médio (Σ valor ÷ Σ kg líquido), descarte % (Σ descarte ÷ Σ bruto), nº de
  cargas (recepções). Valor pago e preço médio "—" nos talhões (D-32).
  Ordenada por kg total, com linha de total (valor e preço médio do total
  só de terceiros).
- **Produtividade dos talhões em <ano>:** todos os talhões ativos da filial
  e os inativos com colheita no ano. Colunas: talhão, fruta, área (ha), kg
  no período, kg no ano, t/ha no ano (`kg ano ÷ 1000 ÷ área`, RN-30; área
  zero = "—"), nº de colheitas no ano (recepções). Ordenada por nome. Linha
  de total soma área, kg e colheitas; t/ha do total "—" (mistura frutas).
- **Preço médio pago a terceiros por mês em <ano>:** linhas Jan–Dez e a do
  ano; uma coluna por fruta com compra de terceiros no ano; célula =
  Σ valor ÷ Σ kg líquido; mês sem compra "—".

### Gráfico

**Top 10 origens por kg** (barras horizontais), no topo, no lugar da
tabela "Top 10" do doc 07 (que repetiria as dez primeiras linhas, como o
top 10 de clientes da 7g2a).

### Vazio

Sem recepção no período: "Nada no período" na tabela por origem e gráfico
oculto; a produtividade e o preço por mês continuam aparecendo (são do ano)
com "Nada no ano." se também estiverem vazios.

## 4. Relatório de processamento (`/producao/relatorios/processamento`)

Serviço: `buscarRelatorioProcessamento(sessao, periodo)` em
`src/server/services/relatorioProducao/processamento.ts`, sobre
`listarOPs(filialId, periodo)` sem as canceladas.

### Tabelas (uma linha por fruta com OP no período, em ordem de nome, e total)

- **Resumo por fruta:**
  - abertas e encerradas (D-29): nº de OPs, fruto (kg), polpa (kg),
    rendimento médio (Σ polpa ÷ Σ fruto, RN-10);
  - só encerradas (D-31): rendimento mínimo e máximo (por OP, entre as que
    têm fruto > 0) e custo médio (Σ custo total ÷ Σ polpa, RN-13, mesma
    conta do painel).
- **Balanço de massa por fruta (OPs encerradas):** fruto, água (1 L = 1 kg),
  polpa, caroço/resíduo, perda, diferença kg e % (RN-11 sobre as somas) e
  nº de OPs com balanço "Verificar" (status de cada OP, pela tolerância
  configurada).
- **Custo por fruta (OPs encerradas):** custo do fruto, dos insumos e total
  (R$, gravados no encerramento), polpa (kg), custo/kg.
- **Link** "Ver as OPs do período" (D-30).

Sem gráfico (o doc 07 não sugere nenhum para este relatório).

### Vazio

Sem OP no período: "Nada no período". Com OPs abertas e nenhuma encerrada:
os blocos de balanço e custo mostram "Nenhuma OP encerrada no período", e
mín/máx/custo médio do resumo ficam "—".

## 5. Exportação

Rotas `…/relatorios/origem/export/route.ts` e
`…/relatorios/processamento/export/route.ts`, com `producao:ler` (senão 403)
e os mesmos parâmetros da tela.

- **PDF:** `gerarPdfSecoes` + `responderArquivoPdf`, cabeçalho por
  `cabecalhoDoRelatorio` (empresa, filial, período e, na origem, o ano);
  uma seção por tabela; gráficos não vão.
- **CSV / Excel (`responderExport`):** uma tabela só com coluna "Seção",
  como a de vendas da 7g2a; cada seção preenche só suas colunas; sem linhas
  de total.
  - **Origem** (`src/server/export/relatorioOrigem.ts`): Seção,
    Origem/Talhão, Tipo, Fruta, Mês, Kg, Valor, Preço médio, Descarte %,
    Cargas, Área (ha), Kg no ano, t/ha, Colheitas. Os kg por fruta saem em
    formato longo (uma linha por origem e fruta).
  - **Processamento** (`src/server/export/relatorioProcessamento.ts`):
    Seção, Fruta, Nº OPs, Fruto (kg), Polpa (kg), Rendimento médio,
    Rendimento mín., Rendimento máx., Água, Caroço/resíduo, Perda,
    Diferença (kg), Diferença %, OPs a verificar, Custo fruto, Custo
    insumos, Custo total, Custo/kg.
- Nomes: `relatorio-origem` e `relatorio-processamento` (a data entra pelo
  responder).

## 6. Menu e permissões

`nav-items.ts`, grupo Produção, depois de "Relatório de vendas": "Relatório
de origem" e "Relatório de processamento", ambos `producao:ler`; o
`nav-items.test.ts` passa a listar os dois. Serviços com
`requirePermission(sessao.perfil, "producao:ler")`; nenhuma escrita, nenhuma
auditoria nova.

## 7. Ajuda e documentos

- `content/ajuda/passo-a-passo.md`, seção 5.8: os dois relatórios (filtros,
  tabelas, D-30, D-31, D-32).
- Doc 08: D-30, D-31, D-32.
- Doc 09 e `docs/fases/fase-7-producao-estoque-vendas.md`: conclusão da
  7g2b (e da 7g).

## 8. Testes

- **Unidade** (`src/lib/producao/relatorios.test.ts`): agregação por
  origem (kg por fruta, descarte %, preço médio só de terceiros);
  produtividade (t/ha, área zero); preço por mês (mês sem compra); resumo
  por fruta com mín/máx só de encerradas; balanço e custo agregados;
  denominador zero.
- **Integração** (Postgres real, fixtures de `producaoTestFixtures.ts`):
  - `origem.test.ts`: dois talhões (um inativo com colheita no ano), dois
    fornecedores, uma recepção cancelada, recepções no ano fora do período.
    Confere as três tabelas e que o kg total bate com o fruto recebido do
    painel no mesmo período.
  - `processamento.test.ts`: OPs encerradas e abertas de duas frutas, uma OP
    cancelada, uma linha removida. Confere os três blocos e que fruto,
    polpa e nº de OPs batem com o painel.
- **Permissão** (`relatorios.permissao.test.ts`): recusa dos dois serviços
  novos.
- **Exportação:** linhas do CSV dos dois relatórios (unidade).
- **Navegador:** desktop e celular (390px), cenário numa empresa de teste;
  gráfico, link para as OPs, atalhos de período e os três formatos de
  exportação; dados de teste apagados no fim.

## 9. Fora da 7g2b

- Comparação com período anterior; consulta entre filiais.
- Gráficos no PDF.
