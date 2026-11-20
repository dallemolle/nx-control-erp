# Ajuda contextual com simulação da tela (piloto: Contas a pagar)

Data: 2026-11-19 · Status: implementada (2026-11-19)

Hoje a ajuda do sistema é um único manual em markdown
([passo-a-passo.md](../../../content/ajuda/passo-a-passo.md), ~500 linhas),
aberto em **Ajuda → Passo a passo**. Para aprender uma tela, a pessoa sai
dela, procura a seção no manual e lê uma descrição corrida, sem ver os
campos. Isso dá trabalho para quem estuda o sistema e não basta para quem
nunca usou.

Objetivo: cada tela ganha um ícone de ajuda que abre um popup com
**roteiros guiados**: uma réplica da tela que vai sendo preenchida passo a
passo com um exemplo, destacando o campo da vez e explicando o que fazer.
Critério de sucesso: **uma pessoa que nunca usou o sistema consegue fazer o
lançamento seguindo só a ajuda.**

A entrega é por etapas. Esta spec cobre a engine e o **piloto em Contas a
pagar**; as demais telas do Financeiro vêm depois, uma por sessão, depois de o
piloto ser aprovado no uso.

## Decisões

- **Passos guiados, não treino interativo:** a pessoa assiste e lê, não
  digita. Cada passo destaca um campo, preenche o valor do exemplo e mostra o
  texto. Descartados: treino interativo, em que a pessoa digita para avançar
  (validar a entrada a cada passo multiplica o custo por tela), e tour sobre
  a tela real (quebra quando o layout muda e não alcança formulários que
  dependem de dados ou de permissão).
- **Réplica com os componentes do próprio sistema:** as cenas usam os
  mesmos `Input`, `Select`, `Button`, `Table` e `Badge` de
  `src/components/ui/`, somente leitura. Fica com a cara do sistema e segue o
  tema da empresa (nx-tema) sem esforço. Descartados: HTML estático em
  iframe (não segue o tema, duplica estilos) e os formulários reais em
  "modo demonstração" (teria que espalhar props de demo por componentes que
  chamam server actions). Custo aceito: quando o formulário real mudar, a
  cena precisa ser ajustada à mão. O plano deixa isso como item da revisão
  de cada mudança de tela (ver **Manutenção**).
- **Roteiros são dados, cenas são componentes:** o texto fica separado da
  réplica. Escrever ou corrigir um roteiro não exige mexer em JSX.
- **Um exemplo contínuo:** todos os roteiros usam a mesma história, para a
  pessoa ver a ligação entre as operações (o título cadastrado no primeiro
  roteiro é o que recebe baixa no segundo).
- **O manual continua:** a página Passo a passo fica como visão geral e
  índice. A seção da tela ganha um link que abre o mesmo popup, que funciona
  até para quem não tem permissão de abrir a tela.

## O que o usuário vê

### Botão de ajuda

Um ícone `CircleHelp` (lucide) ao lado do título da tela, com
`aria-label="Ajuda: Contas a pagar"` e dica "Como usar esta tela". Aparece
para todo mundo que abre a tela.

### Popup

Um `Dialog` largo (`sm:max-w-4xl`, tela cheia no celular), em três partes:

1. **Cabeçalho:** "Ajuda — Contas a pagar" e uma frase sobre para que serve
   a tela.
2. **Roteiros:** botões no topo (rolagem horizontal no celular), um por
   roteiro. Ao abrir, nenhum roteiro está escolhido: a área mostra a lista
   com o "Quando usar" de cada um, como um índice.
3. **Roteiro aberto:**
   - "Quando usar" (1–2 frases) e, se houver, quem pode fazer (ex.: "Precisa
     do perfil Administrador, Financeiro ou Tesouraria").
   - A **cena**, a réplica da parte da tela envolvida (lista ou formulário).
     O campo do passo atual tem contorno na cor primária, fundo levemente
     realçado e entra na área visível com `scrollIntoView` (rolagem suave,
     desligada com `prefers-reduced-motion`). Os campos dos passos anteriores
     já aparecem preenchidos.
   - O **texto do passo** em uma caixa embaixo da cena: número, instrução
     curta em negrito ("Escolha o fornecedor") e explicação em linguagem
     simples. Pode ter uma **dica** em destaque (ex.: "Se a nota ainda não
     chegou, deixe em branco e complete depois").
   - Navegação: **‹ Anterior · 3 de 11 · Próximo ›**. Também funciona pelas
     setas ← → do teclado. No último passo, "Próximo" vira **"E depois?"**.
   - **"E depois?":** a tela final do roteiro, que conta o que acontece fora
     dela (ex.: a baixa vai para Aprovações pendentes e outra pessoa
     aprova) e sugere o próximo roteiro, com botão para abri-lo.

O texto do passo fica numa região `aria-live="polite"` para leitor de tela.
A cena é decorativa (`aria-hidden`, `inert`): os campos simulados não
recebem foco nem clique.

### Link no Passo a passo

No markdown, um link com âncora especial:

```md
[Ver simulação](#ajuda/contas-a-pagar/cadastrar-titulo)
```

O renderizador de links de [markdown-content.tsx](../../../src/components/markdown-content.tsx)
reconhece o prefixo `#ajuda/` e troca o link por um botão que abre o popup
já no roteiro indicado. É usada uma âncora porque o `react-markdown` limpa
URLs com protocolo desconhecido (algo como `ajuda:` viraria vazio). Se a tela
ou o roteiro não existirem no registro, o link aparece como texto comum.

## Piloto: Contas a pagar

### O exemplo

> A fazenda comprou **adubo** da **Agro Insumos Ltda**: nota fiscal
> **NF-e 1234**, série 1, emitida em **10/09/2026**, total de **R$ 3.000,00**,
> em **3 parcelas de R$ 1.000,00** (vencimentos 10/10, 10/11 e 10/12/2026;
> as parcelas 1 e 2 aparecem vencidas e a 3, em aberto).
> Categoria **Insumos Agrícolas**, centro de custo **Lavoura**, safra
> **2025/26**, pagamento por **boleto** pela conta **Banco do Brasil — CC
> 12345-6**.

Os nomes são fictícios e ficam fixos nos roteiros. Não vêm do banco: a ajuda
não lê dado nenhum da empresa.

### Roteiros

| # | Roteiro | Cena | Resumo dos passos |
|---|---|---|---|
| 1 | Cadastrar um título a pagar | Lista → Novo título | Botão "Novo título a pagar"; fornecedor; documento; emissão e competência (com a diferença entre as duas); categoria; centro de custo/lucro, safra e projeto (opcionais e para que servem); conta bancária prevista; forma de pagamento; seção Documento fiscal (classificação Fiscal × Gerencial, tipo, nº, série, emissão da nota, chave de acesso de 44 dígitos colada do DANFE); parcelas (primeira, "Adicionar parcela", conferir a soma); Salvar. **E depois?** O título aparece na lista e clicar na linha mostra as parcelas. |
| 2 | Pagar uma parcela (baixa) | Lista com parcelas → Registrar baixa | Achar o título e expandir; botão "Baixar" na parcela 1; data do pagamento; valor pago; juros, multa e desconto (exemplo com R$ 12,00 de juros por atraso); conta bancária de onde saiu o dinheiro; "Registrar baixa". **E depois?** A baixa fica pendente em Aprovações pendentes; se a empresa exige, outra pessoa aprova; aprovada, gera a saída na conta e a parcela fica paga. |
| 3 | Mudar o vencimento | Lista com parcelas | Expandir; campo de data na parcela; nova data; "Alterar". Só parcela em aberto. |
| 4 | Renegociar uma parcela vencida | Lista → Renegociar parcela | Botão "Renegociar"; novas parcelas (exemplo: a parcela 2 vira duas de R$ 500,00); "Adicionar parcela"; confirmar. Aviso: operação final, a parcela original não aceita baixa nem nova renegociação. |
| 5 | Cancelar uma parcela | Lista com parcelas | Quando usar (não vai mais ser paga); botão "Cancelar". Na tela real não há confirmação: o passo avisa que o clique já cancela. Aviso: operação final. |
| 6 | Encontrar e exportar | Barra de filtros → Lista | Filtros combináveis (exemplo: fornecedor Agro Insumos + status Vencida); "Limpar filtros"; Exportar CSV/Excel/PDF respeita os filtros; para que serve cada formato. |

A **importação por CSV** entra só como texto no índice do popup ("Para lançar
muitos títulos de uma vez, use Importar CSV; veja o manual"), sem roteiro.

Os textos dos passos seguem a mesma regra: verbo no imperativo na instrução,
explicação sem jargão, e termo técnico (competência, classificação fiscal,
centro de custo) explicado na primeira vez que aparece.

### Cenas do piloto

As cenas espelham os componentes reais em
`src/app/(dashboard)/financeiro/_titulos/`:

- **Lista**: cabeçalho da tela (título, links de exportar, botão novo),
  tabela de títulos (Documento, Fornecedor, Categoria, Parcelas, Ações) com o
  título do exemplo expandido e as parcelas com suas ações (data + Alterar,
  Baixar, Renegociar, Cancelar). Espelha `titulo-table.tsx`.
- **Barra de filtros**: espelha `barra-de-filtros.tsx`.
- **Novo título**: espelha `titulo-dialog-form.tsx` e
  `secao-documento-fiscal.tsx`, com os mesmos rótulos e a mesma ordem.
- **Registrar baixa**: espelha `baixa-dialog.tsx`.
- **Renegociar parcela**: espelha `renegociar-dialog.tsx`.

As cenas recebem `tipo: "PAGAR" | "RECEBER"`, como as telas reais, para que a
ajuda de Contas a receber seja só um conjunto de roteiros novo, sem cenas
novas.

## Arquitetura

```
src/components/ajuda/
  botao-ajuda.tsx          ícone + Dialog (client); props: tela, roteiroInicial?
  ajuda-dialog.tsx         cabeçalho, abas de roteiro, índice, "E depois?"
  simulador.tsx            estado do passo, teclado, destaque e rolagem
  campos-simulados.tsx     CampoSimulado, SelectSimulado, BotaoSimulado:
                           primitivas de src/components/ui com data-alvo,
                           somente leitura, estilo de destaque
                           (o link do markdown usa BotaoAjuda gatilho="link")

src/ajuda/
  tipos.ts                 DefinicaoAjuda, Roteiro, Passo
  roteiro.ts               lógica pura: valoresAte(roteiro, n), limites
  registro.ts              mapa tela → DefinicaoAjuda (carregado sob demanda)
  contas-a-pagar/
    cenas.tsx              CenaLista (com os filtros), CenaNovoTitulo,
                           CenaBaixa, CenaRenegociar
    exemplo.ts             dados fixos da história
    roteiros.ts            os 6 roteiros
```

### Tipos

```ts
type Passo<A extends string> = {
  alvo: A;                       // data-alvo destacado na cena
  instrucao: string;             // "Escolha o fornecedor"
  explicacao: string;
  dica?: string;
  preenche?: Partial<Record<A, string>>; // valores que aparecem a partir deste passo
};

type Roteiro<C extends Record<string, string>> = {
  id: string;                    // "cadastrar-titulo" (usado no link #ajuda/...)
  titulo: string;
  quandoUsar: string;
  quemPode?: string;
  cena: keyof C;                 // qual cena mostrar (pode trocar no meio, ver abaixo)
  passos: Passo<C[keyof C]>[];
  eDepois: { texto: string; proximoRoteiro?: string };
};
```

Cada cena exporta a lista dos seus alvos como `const` (`ALVOS_NOVO_TITULO =
["fornecedor", "documento", ...] as const`), e o `alvo` do passo é tipado
por essa lista. **Um passo que aponta para um campo que não existe na cena
não compila.**

Cada passo diz a sua cena: `cena` é obrigatório no passo, sem herança do
roteiro. Os tipos vêm de `construtorDeRoteiros<typeof ALVOS>()`. A cena de
filtros é a própria cena da lista. Ao trocar de cena, a transição é um fade
curto.

### Estado

O simulador guarda só `{ roteiroId, passo }`. Os valores mostrados na cena
são derivados: `valoresAte(roteiro, passo)` junta os `preenche` dos passos
`0..passo`. Voltar um passo desfaz o preenchimento sem estado extra. Nada é
persistido: fechar e reabrir o popup volta ao índice.

### Carregamento

O conteúdo da ajuda não entra no bundle da tela: `BotaoAjuda` importa a
`DefinicaoAjuda` com `import()` dinâmico ao abrir o popup (o `registro.ts`
mapeia a tela para uma função de import). Até carregar, o popup mostra um
esqueleto.

### Integração com as telas

Em [contas-a-pagar/page.tsx](../../../src/app/(dashboard)/financeiro/contas-a-pagar/page.tsx),
o `h1` passa a ficar num `flex items-center gap-1` com `<BotaoAjuda
tela="contas-a-pagar" />` ao lado. É a única mudança na tela.

Em [passo-a-passo.md](../../../content/ajuda/passo-a-passo.md), a seção 3.1
ganha, logo abaixo do primeiro parágrafo, uma linha com os links "Ver
simulação" para os roteiros, e a mesma ideia é dita na Introdução ("nas telas
que têm o ícone ?, a ajuda abre direto da tela").

## Erros e casos de borda

- Tela sem definição no registro: o `BotaoAjuda` não renderiza nada. Nunca
  mostra popup vazio.
- Link `#ajuda/` com tela ou roteiro inexistente: vira texto comum (ver
  acima). Se só o roteiro não existir, abre o índice da tela.
- Falha no `import()` dinâmico (deploy novo no meio da sessão): o popup
  mostra "Não foi possível carregar a ajuda. Recarregue a página." e um link
  para o Passo a passo.
- Celular: a cena fica com largura da tela e rolagem vertical. O destaque
  rola até o campo. A caixa de texto do passo e a navegação ficam fixas no
  rodapé do popup, sempre visíveis.
- Tema escuro e tema da empresa: as cenas usam só tokens do tema (nenhuma
  cor fixa), então seguem sozinhas.

## Testes

- **Unidade (vitest)**, em `src/ajuda/roteiro.test.ts`:
  - `valoresAte` acumula os `preenche` até o passo N e um passo posterior
    sobrescreve o valor;
  - limites: não passa de 0 nem do último passo; o "E depois?" é o passo
    `passos.length`.
- **Validação do conteúdo** (`src/ajuda/contas-a-pagar/roteiros.test.ts`),
  para cada roteiro: pelo menos um passo; ids únicos; `eDepois.texto` não
  vazio; `proximoRoteiro`, se houver, existe; nenhuma instrução repetida em
  sequência.
- **Link do markdown:** teste do parser de `#ajuda/tela/roteiro` (válido,
  sem roteiro, inválido).
- **Navegador (Playwright), manual:** abrir Contas a pagar, clicar no ?,
  percorrer os 6 roteiros até o "E depois?" com o mouse e com as setas, em
  tema claro, escuro e largura de 390px; abrir pelo link do Passo a passo.
  **Teste do critério de sucesso:** seguindo só o roteiro 1 e o 2, cadastrar
  um título e registrar a baixa de verdade na tela real, sem consultar outra
  fonte.

## Manutenção

As cenas espelham formulários reais, então uma mudança de campo em
`_titulos/` precisa ser repetida na cena. Para isso não depender de memória,
o plano inclui um comentário no topo de cada componente espelhado
(`// Espelhado em src/ajuda/contas-a-pagar/cenas.tsx: ajuste a ajuda junto`;
desde a ajuda de Contas a receber, o arquivo é `src/ajuda/_titulos/cenas.tsx`).

## Fora do escopo

- Ajuda contextual em Contas a receber → feito (2026-11-19, branch
  `feat/ajuda-contas-a-receber`: cenas movidas para `src/ajuda/_titulos/`,
  com o exemplo como parâmetro, e roteiros em `src/ajuda/contas-a-receber/`).
- Ajuda contextual nas demais telas do Financeiro (Aprovações pendentes,
  Repasses de cartão, Tesouraria, Conciliação, Fluxos de caixa) → backlog,
  uma tela por sessão depois do piloto aprovado no uso.
- Ajuda contextual nos outros menus (Produção, Vendas, Cadastros,
  Controladoria, Administração) → backlog, depois do Financeiro.
- Treino interativo, em que a pessoa digita para avançar — descartado
  (custo por tela alto; os passos guiados cobrem o critério de sucesso).
- Tour sobre a tela real — descartado (frágil a mudanças de layout e não
  alcança formulários que dependem de dados ou permissão).
- Roteiro de importação por CSV — descartado (fica como texto no índice; é
  uso eventual e o manual explica as colunas).
- Guardar quais roteiros a pessoa já viu — descartado (conveniência).
- Vídeos ou GIFs gravados da tela — descartado (desatualizam a cada mudança e
  não seguem o tema).
