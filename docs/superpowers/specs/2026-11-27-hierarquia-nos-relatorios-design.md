# Hierarquia de categorias e centros de custo nos relatórios

Data: 2026-11-27 · Status: aprovada

Item 36 do [backlog](../../backlog.md), seção "Cadastros — lacunas achadas ao
escrever a ajuda contextual" ("O 'pai' das categorias e dos centros de custo
não é usado").

## Problema

Categorias financeiras e centros de custo têm um campo "pai", mas nenhum
relatório usa a hierarquia: o `parentId` só é lido no cadastro (coluna Pai e
checagem de ciclo). Quem monta "Taxas de cartão" dentro de "Despesas
bancárias" vê, no Orçamento, as duas linhas soltas, sem um total do grupo.

Além disso, o cadastro aceita pai de tipo diferente (Receita dentro de
Despesa), o que não faz sentido num total e quebra os blocos Despesas/Receitas
do Orçamento.

## Regra

- **O pai continua com valores próprios.** Categoria ou centro que tem filhos
  segue recebendo orçamento e lançamentos como hoje (decisão do usuário).
- **Linha do pai = próprio + descendentes**, em todas as colunas de valor, em
  qualquer profundidade, somado em centavos.
- **"Direto em <pai>":** quando o pai tem valor próprio diferente de zero em
  alguma coluna, aparece como primeira linha filha dele, para a soma das
  filhas fechar com o total do pai.
- **Indicadores recalculados sobre o total:** no Orçamento, Previsto,
  Variação, Variação % e Estouro da linha do pai saem dos totais do grupo
  (mesma fórmula de `montarLinhaComparativo`). Cada linha tem o próprio
  Estouro: uma filha pode estourar com o grupo dentro do orçado, e o grupo
  pode estourar sem nenhuma filha estourar.
- **Total do rodapé** (Fluxo por dimensão) continua sendo `totalDoFluxo`
  sobre as linhas planas (valores próprios), o que equivale a somar só as
  linhas de nível 1: nada é contado duas vezes.
- **Linha de topo** quando o pai não está na lista (pai inativo, sem valores,
  ou de outra filial) ou é de tipo diferente.
- **Ordem:** a de entrada dentro de cada nível (os serviços já entregam em
  ordem alfabética, com inativos e "Não classificado" no fim), filhos logo
  abaixo do pai.
- **Cadastro:** a categoria pai precisa ser do mesmo tipo. Criar ou editar
  com pai de outro tipo é recusado com "A categoria pai precisa ser do mesmo
  tipo (Despesa ou Receita)". Mudar o tipo de uma categoria que tem filhas de
  outro tipo também é recusado (mesma mensagem, citando as filhas). O que já
  existe misturado não é alterado; só aparece sem pai nos relatórios.
  Centro de custo não tem tipo: nada muda no cadastro dele.

## Decisões deste desenho

- Hierarquia só onde existe: categorias (Orçamento) e centros de custo (Fluxo
  por dimensão com dimensão Centro de custo). Centro de lucro, safra e
  projeto não têm pai e ficam como estão.
- A soma fica fora dos serviços: `listarComparativoOrcamento` e
  `listarFluxoDeCaixaPorDimensao` continuam devolvendo valores próprios, só
  ganham `parentId` por linha. Os testes atuais seguem valendo.
- A grade de valores orçados continua editável por categoria (o campo do pai
  é o orçamento próprio dele); só ganha a ordem em árvore e o recuo. Não
  ganha linha de total: os totais ficam no comparativo, para não misturar
  campo editável com soma.
- Recolher é só da tela (estado local, começa tudo aberto); não muda
  nenhum número, porque o total já está na linha do pai.

## Componentes

### Árvore — `src/lib/arvoreDeLinhas.ts` (novo, puro)

`montarArvore(linhas, opcoes)`:

- Entrada: linhas planas com `id`, `parentId`, `grupo` (tipo da categoria;
  para centros, um valor único) e um objeto de valores numéricos.
- Saída: lista em ordem de árvore; cada item tem `id`, `nivel` (1 = topo),
  `temFilhos`, `paiId` efetivo, `valores` (próprio + descendentes) e
  `direto: boolean` para as linhas "Direto em…" (id derivado, ex.
  `<paiId>:direto`).
- Pai ausente ou de outro `grupo` → topo. Ciclo (não deveria existir, o
  cadastro impede) → o item que fecharia o ciclo vira topo.
- Soma em centavos.

### Orçamento

- `src/server/services/orcamento.ts`: `LinhaComparativoOrcamento` ganha
  `parentId`. Nova função `comparativoEmArvore(linhasDoMes)` que usa
  `montarArvore` com orçado/realizado/projetado e remonta cada linha com
  `montarLinhaComparativo` sobre os totais, devolvendo também `nivel`,
  `temFilhos`, `paiId` e `direto`.
- `orcamento/page.tsx`: comparativo do mês via `comparativoEmArvore`,
  renderizado pelo componente cliente `LinhasRecolhiveis`; grade em ordem de
  árvore com recuo no nome (`montarArvore` só para a ordem e o nível, por
  bloco Despesas/Receitas).
- `orcamento/export/route.ts`: mesma árvore por mês; nome recuado e coluna
  "Nível".

### Fluxo de caixa por dimensão

- `src/server/services/fluxoDeCaixaPorDimensao.ts`: `LinhaFluxoPorDimensao`
  ganha `parentId` (preenchido só para Centro de custo, inclusive nas linhas
  "(inativo)"; `null` nas demais e em "Não classificado").
- `fluxo-por-dimensao/page.tsx` e `export/route.ts`: árvore só quando a
  dimensão é Centro de custo; Total com as linhas de nível 1 (para as outras
  dimensões, todas são nível 1 e nada muda). Exportação com coluna "Nível".

### Componente de tela — `LinhasRecolhiveis`

Componente cliente em `src/app/(dashboard)/controladoria/_shared/`: recebe as
linhas já prontas (ids, nível, temFilhos, paiId) e as células renderizadas,
guarda quais pais estão recolhidos, mostra ▸/▾ no pai e esconde os
descendentes recolhidos. Recuo por nível; pai em negrito; "Direto em…" em
texto secundário.

### Cadastro de categorias — `src/server/services/categoriaFinanceira.ts`

`validarParentMesmaFilial` passa a conferir também o tipo; `atualizar`
recusa trocar o tipo quando há filhas de outro tipo. A mensagem chega ao
diálogo pelo fluxo de erro de ação que já existe.

### Ajuda

- `src/ajuda/categorias` e `src/ajuda/centros-de-custo`: passos sobre o pai
  passam a dizer que o Orçamento (categorias) e o Fluxo por dimensão
  (centros) somam os filhos no pai; categoria pai do mesmo tipo.
- `src/ajuda/orcamento` e `src/ajuda/fluxo-por-dimensao`: cenas espelham as
  telas (comentário no topo das páginas); incluir um grupo com filha no
  exemplo e um passo sobre recolher.
- Manual: as seções 7.2 e 7.3 citadas no backlog eram do
  `passo-a-passo.md`, aposentado em 2026-11-21; o `primeiros-passos.md` não
  fala do pai. Nada a mudar.

## Fora do escopo

- Dashboard executivo e fluxos de caixa por categoria — descartado: o
  backlog pede só Orçamento e Fluxo por dimensão, e os outros não mostram
  categoria por linha.
- Hierarquia em centro de lucro, safra e projeto — descartado: não têm pai
  no cadastro e nada pediu.
- Pai só agrupador (sem valores próprios) — descartado pelo usuário.
- Linha de total do grupo na grade de valores orçados — descartado: o total
  já está no comparativo.
- Lembrar o que foi recolhido entre visitas — descartado: comodidade.
- Corrigir categorias já cadastradas com pai de outro tipo — descartado:
  aparecem sem pai nos relatórios, e a edição já obriga a corrigir.

## Testes

- `src/lib/arvoreDeLinhas.test.ts`: pai com e sem valor próprio; três
  níveis; pai ausente vira topo; pai de outro grupo vira topo; ciclo não
  trava; ordem de entrada por nível; soma em centavos; total pelas linhas de
  nível 1 igual ao total plano.
- `orcamento.test.ts`: `comparativoEmArvore` com Estouro do pai sobre o total
  e filha estourando com grupo dentro do orçado; "Direto em…".
- `fluxoDeCaixaPorDimensao.test.ts`: `parentId` nas linhas de centro de
  custo, `null` nas outras dimensões.
- `categoriaFinanceira.test.ts`: recusa pai de outro tipo; recusa trocar o
  tipo com filhas de outro tipo.
- Conferência no navegador: Orçamento e Fluxo por dimensão com um grupo de
  três níveis, recolher/expandir, exportações.
