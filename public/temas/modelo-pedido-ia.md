# Pedido para gerar um tema do NX Control

Cole este texto numa IA (ChatGPT, Claude, Gemini…) junto com o manual de marca
do cliente (cores, fontes, logo). A resposta é um arquivo JSON que se importa
em **Administração → Empresas → Tema e marca**.

---

Você vai gerar o tema visual de uma empresa para o sistema NX Control, a partir
do manual de marca que envio junto. Responda **somente com o JSON**, sem texto
antes ou depois e sem comentários, seguindo exatamente o formato `"nx-tema"`
versão 1 descrito abaixo.

## Estrutura

```json
{
  "formato": "nx-tema",
  "versao": 1,
  "nome": "<nome da marca>",
  "cores": { "claro": { … }, "escuro": { … } },
  "fontes": {
    "texto":   { "pilha": "<fontes do texto>",   "google": ["<família do Google Fonts>"] },
    "titulos": { "pilha": "<fontes dos títulos>", "google": ["<família do Google Fonts>"] }
  },
  "raio": "<raio dos cantos, ex.: 12px>"
}
```

- `cores.claro` é obrigatório. `cores.escuro` é opcional: inclua se o manual
  tiver versão escura (ou se for possível derivar uma com bom contraste).
- `fontes` e `raio` são opcionais.
- **Não invente campos.** Qualquer campo fora desta lista faz o arquivo ser recusado.

## Papéis de cor (em cada modo)

Todas as cores no formato `#RRGGBB` (6 dígitos hexadecimais, com `#`).

| Papel | Obrigatório | O que é |
|---|---|---|
| `fundo` | sim | Fundo principal das telas. |
| `texto` | sim | Texto principal sobre o fundo. |
| `primaria` | sim | Cor da marca: botões principais, links, destaques. |
| `textoSobrePrimaria` | sim | Texto dentro de um botão na cor primária. |
| `sidebar` | sim | Fundo do menu lateral. |
| `textoSobreSidebar` | sim | Texto do menu lateral. |
| `cartao` | não | Fundo de cartões, diálogos e menus suspensos. |
| `apoio` | não | Fundo de apoio: faixas, campos desabilitados, áreas secundárias. |
| `textoSobreApoio` | não | Texto sobre o fundo de apoio. |
| `textoApagado` | não | Texto secundário: legendas, dicas, rodapés. |
| `destaque` | não | Fundo do item com o mouse em cima ou selecionado em menus e listas (deve ser discreto). |
| `textoSobreDestaque` | não | Texto sobre o destaque. |
| `borda` | não | Bordas e linhas de tabela. |
| `foco` | não | Contorno do campo em foco. |
| `erro` | não | Mensagens e botões de erro/exclusão. |
| `cabecalho` | não | Fundo da barra do topo. |
| `textoCabecalho` | não | Texto da barra do topo. |
| `graficos` | não | Lista com exatamente 5 cores para séries de gráficos. |

## Regras de contraste (obrigatórias)

Contraste mínimo de **4,5:1** (WCAG AA) entre texto e fundo:

- **Bloqueiam a importação** se ficarem abaixo de 4,5:1: `texto`/`fundo`,
  `textoSobrePrimaria`/`primaria`, `textoSobreSidebar`/`sidebar`,
  `textoCabecalho`/`cabecalho`.
- **Geram aviso** abaixo de 4,5:1: `textoApagado`/`fundo`, `texto`/`cartao`,
  `textoSobreApoio`/`apoio`, `textoSobreDestaque`/`destaque`, `erro`/`fundo`.

Se uma cor da marca não tiver contraste suficiente para texto (amarelos e
verdes claros costumam falhar), use-a só em `graficos` ou como fundo com um
texto escuro por cima, nunca como cor de texto sobre o fundo.

## Fontes

- `google`: até 2 nomes de família **do Google Fonts**, exatamente como
  aparecem lá (só letras, números e espaços). Se a fonte da marca não estiver
  no Google Fonts, use uma equivalente gratuita que esteja.
- `pilha`: a lista de fontes em ordem de preferência, separadas por vírgula:
  a fonte da marca (entre aspas duplas se tiver espaço), a do Google e uma
  genérica no fim (`sans-serif` ou `serif`). Só nomes; nada de `url(`.

## Raio

Número em `px` (até 32px) ou `rem` (até 2rem). Ex.: `"6px"` para cantos discretos,
`"12px"` para arredondados.

## Exemplo completo (marca Hortitex)

```json
{
  "formato": "nx-tema",
  "versao": 1,
  "nome": "Hortitex",
  "cores": {
    "claro": {
      "fundo": "#f7f1e3", "texto": "#3a281c", "primaria": "#1f4d2e", "textoSobrePrimaria": "#f7f1e3",
      "sidebar": "#1f4d2e", "textoSobreSidebar": "#f7f1e3", "cartao": "#fbf7ee", "apoio": "#ebe0c8",
      "textoApagado": "#6b5645", "destaque": "#ebe0c8", "erro": "#b83a24", "cabecalho": "#f7f1e3",
      "graficos": ["#1f4d2e", "#4f8a3c", "#b83a24", "#e8a93a", "#6b5645"]
    },
    "escuro": {
      "fundo": "#16221a", "texto": "#f5eedd", "primaria": "#6fae5e", "textoSobrePrimaria": "#16221a",
      "sidebar": "#25362b", "textoSobreSidebar": "#f5eedd", "cartao": "#1d2b21", "apoio": "#25362b",
      "textoApagado": "#b9b29e", "destaque": "#25362b", "erro": "#e5694f", "cabecalho": "#16221a",
      "graficos": ["#6fae5e", "#9bcb7f", "#e5694f", "#f0b84f", "#b9b29e"]
    }
  },
  "fontes": {
    "texto": { "pilha": "\"Calibri\", Carlito, system-ui, sans-serif", "google": ["Carlito"] },
    "titulos": { "pilha": "\"Cambria\", Caladea, Georgia, serif", "google": ["Caladea"] }
  },
  "raio": "12px"
}
```

Agora gere o tema para a marca do manual anexo.
