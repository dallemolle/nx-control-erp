# Tema por empresa (white-label)

Data: 2026-11-15 · Status: implementada (2026-11-15)

Ajustes na implementação: as fontes do tema são aplicadas com regras
`font-family` (o `@theme inline` do `globals.css` fixa as variáveis de fonte);
o `<style>` do tema fica no lugar, sem `precedence`, para sair do documento ao
restaurar o padrão ou trocar de empresa; a seção Marca também recebe o logo
para fundo claro.

Pedido do cliente: a aplicação deve ter a cara do cliente (cores, fontes,
raio de borda, logo), configurável **por empresa**, sem mudar o padrão do
sistema. O tema chega como um **arquivo JSON num formato próprio**, que uma IA
gera a partir do manual de marca e o sistema importa e valida. O primeiro
tema de exemplo é o da Hortitex.

Evolui a [identidade visual por empresa](2026-09-18-identidade-visual-por-empresa-design.md)
(cor da sidebar + logo). Entrega 1 de 2; a entrega 2, o editor visual
(seletores de cor por papel, prévia ao vivo editável), foi feita em
2026-11-15: [2026-11-15-editor-visual-tema-design.md](2026-11-15-editor-visual-tema-design.md).

## Decisões deste desenho

1. **A empresa define a paleta; o usuário escolhe só claro/escuro.** Com tema,
   o seletor de aparência mostra só Claro e Escuro (ou nada, se o tema não
   tiver modo escuro). Sem tema, as 6 variações (A/B/C × claro/escuro)
   continuam como hoje.
2. **Fontes pelo nome no Google Fonts.** O tema informa os nomes das famílias;
   o sistema valida e monta o link. URL livre não é aceita. Toda pilha tem
   fontes alternativas, então o texto nunca fica sem fonte.
3. **Contraste:** abaixo de 4,5:1 (WCAG AA) bloqueia nos pares essenciais e só
   avisa nos secundários. As regras ficam publicadas no schema, no modelo de
   pedido para a IA e no exemplo, para o tema gerado já passar.
4. **Espaçamento fica fora** do formato: mudar a escala por empresa desalinha
   telas inteiras. Logo e favicon também ficam fora do JSON (são imagens): vão
   por upload.
5. **`corPrimaria` continua** valendo para quem usa; com tema, o tema
   prevalece.
6. Fora desta entrega: editor visual; botão "gerar com IA" chamando uma API
   (o fluxo com IA externa + importação já resolve, sem custo). — editor
   **feito** (PR #101); botão de IA **descartado:** o fluxo externo
   resolve sem custo.

## Formato do arquivo (`nx-tema`, versão 1)

```json
{
  "formato": "nx-tema",
  "versao": 1,
  "nome": "Hortitex",
  "cores": {
    "claro": { "fundo": "#f7f1e3", "texto": "#3a281c", "primaria": "#1f4d2e", "textoSobrePrimaria": "#f7f1e3",
               "sidebar": "#1f4d2e", "textoSobreSidebar": "#f7f1e3" },
    "escuro": { }
  },
  "fontes": {
    "texto":   { "pilha": "\"Calibri\", Carlito, system-ui, sans-serif", "google": ["Carlito"] },
    "titulos": { "pilha": "\"Cambria\", Caladea, Georgia, serif", "google": ["Caladea"] }
  },
  "raio": "12px"
}
```

- `formato` = `"nx-tema"` e `versao` = `1` obrigatórios; `nome` obrigatório
  (1–60 caracteres, texto simples).
- `cores.claro` obrigatório; `cores.escuro` opcional (sem ele, a empresa fica
  só no modo claro).
- `fontes` opcional; `fontes.texto` e `fontes.titulos` opcionais. `google`:
  até 2 famílias por pilha.
- `raio` opcional.
- **Campos desconhecidos são recusados** em qualquer nível.

### Papéis de cor e variáveis CSS

Cada modo (`claro`, `escuro`) tem os mesmos papéis.

| Papel | Obrigatório | Variáveis | Se ausente |
|---|---|---|---|
| `fundo` | sim | `--background` | — |
| `texto` | sim | `--foreground`, `--card-foreground`, `--popover-foreground` | — |
| `primaria` | sim | `--primary` | — |
| `textoSobrePrimaria` | sim | `--primary-foreground` | — |
| `sidebar` | sim | `--sidebar` | — |
| `textoSobreSidebar` | sim | `--sidebar-foreground` | — |
| `cartao` | não | `--card`, `--popover` | `fundo` |
| `apoio` | não | `--secondary`, `--muted` | tom de `fundo` deslocado 4 pontos de luminosidade (`tomDestaque`) |
| `textoSobreApoio` | não | `--secondary-foreground` | `texto` |
| `textoApagado` | não | `--muted-foreground` | padrão do sistema |
| `destaque` | não | `--accent` (hover e item selecionado em menus e listas) | `apoio` |
| `textoSobreDestaque` | não | `--accent-foreground` | `texto` |
| `borda` | não | `--border`, `--input` | padrão do sistema |
| `foco` | não | `--ring`, `--sidebar-ring` | `primaria` |
| `erro` | não | `--destructive` | padrão do sistema |
| `cabecalho` | não | `--app-header-background` | `fundo` |
| `textoCabecalho` | não | `--app-header-foreground` | `texto` (se `cabecalho` ausente) ou cor contrastante calculada |
| `graficos` | não | `--chart-1` … `--chart-5` (lista de 5 cores) | padrão do sistema |

Derivados da sidebar, como já é feito hoje para `corPrimaria`:
`--sidebar-accent` = `tomDestaque(sidebar, 8)`, `--sidebar-primary` =
`tomDestaque(sidebar, 16)`, cada um com o texto contrastante calculado;
`--sidebar-border` = `textoSobreSidebar` com 10% de opacidade.

"Padrão do sistema" = o valor da variação A no mesmo modo (claro ou escuro).

### Validação

- Cores: só `#RRGGBB` (6 dígitos, com `#`); normalizadas para minúsculas.
- `raio`: número com `px` ou `rem`, de 0 a 32px (0 a 2rem).
- Nomes de fonte do Google: só letras, números e espaços (`^[A-Za-z0-9 ]{1,40}$`).
- `pilha`: nomes de fonte separados por vírgula, cada um sem aspas ou entre
  aspas duplas, com os mesmos caracteres; recusa `url(`, `;`, `{`, `}`, `<`,
  `@` e qualquer outro caractere. Máximo de 200 caracteres.
- **Contraste** (luminância relativa da WCAG 2.x, por modo):
  - essenciais, **bloqueiam** abaixo de 4,5:1: `texto`/`fundo`,
    `textoSobrePrimaria`/`primaria`, `textoSobreSidebar`/`sidebar`,
    `textoCabecalho`/`cabecalho` (com a herança aplicada);
  - secundários, **avisam** abaixo de 4,5:1: `textoApagado`/`fundo`,
    `texto`/`cartao`, `textoSobreApoio`/`apoio`,
    `textoSobreDestaque`/`destaque`, `erro`/`fundo`.
- Mensagens apontam o caminho e o motivo, ex.:
  `cores.escuro.textoSobrePrimaria sobre primaria: contraste 3,1:1 (mínimo 4,5:1)`.

Funções puras em `src/lib/tema/`:
- `temaSchema` (Zod 4) e `type Tema`;
- `validarTema(json: unknown): { ok: true; tema: Tema; avisos: string[] } | { ok: false; erros: string[] }`;
- `contraste(corA, corB): number`;
- `variaveisDoTema(tema): { claro: Record<string, string>; escuro: Record<string, string> | null }`
  (aplica herança e derivados);
- `cssDoTema(tema): string` (monta o bloco `<style>`);
- `urlGoogleFonts(tema): string | null` (pesos 400 e 700; `display=swap`).

O `public/temas/nx-tema.schema.json` é gerado do `temaSchema` com
`z.toJSONSchema`, e um teste garante que o arquivo publicado é igual ao
gerado.

## Gravação

`Empresa` ganha (uma migration):

- `tema Json?` — o tema validado e normalizado;
- `logoEscuroUrl String?` — logo para fundo escuro (o `logoUrl` atual é o de
  fundo claro);
- `faviconUrl String?`.

Uploads de logo escuro e favicon reaproveitam o `processarLogo` do serviço de
empresa (Vercel Blob público, 1 MB; favicon aceita PNG, SVG e ICO).

Serviço `src/server/services/temaEmpresa.ts`, todas as funções com
`empresa:gerenciar`:

- `importarTema(sessao, empresaId, json, confirmarAvisos)`: valida; com erros,
  recusa; com avisos e sem `confirmarAvisos`, recusa pedindo confirmação;
  grava e audita `IMPORTAR_TEMA` (anterior/novo);
- `restaurarTemaPadrao(sessao, empresaId)`: `tema = null`, audita
  `RESTAURAR_TEMA`; não mexe nos logos;
- `atualizarMarcaEmpresa(sessao, empresaId, { logoEscuro, favicon, remover… })`:
  uploads, auditados como a edição da empresa.

## Aplicação

Só nas telas do painel (`src/app/(dashboard)/layout.tsx`, que já busca a
empresa); login e seleção de empresa/filial ficam no padrão.

- Com `empresa.tema`, o layout roda `validarTema` de novo. Válido: renderiza
  `<style>` com as variáveis em `html[class] { … }` (claro) e
  `html[class*="-dark"] { … }` (escuro, se houver). A especificidade desses
  seletores supera a das classes `.theme-*`, e o bloco vale para a página
  inteira, inclusive diálogos e menus suspensos (portais). Inválido: ignora o
  tema (padrão do sistema) e registra um aviso no log do servidor.
- Fontes: `<link rel="preconnect">` para `fonts.googleapis.com` e
  `fonts.gstatic.com` e `<link rel="stylesheet">` com a URL de
  `urlGoogleFonts`; as variáveis de fonte do texto e dos títulos recebem as
  pilhas do tema.
- `ThemeToggle` recebe `modo: "livre" | "claro-escuro" | "so-claro"`. Com
  tema: mostra só Claro (`theme-a`) e Escuro (`theme-a-dark`); `so-claro`:
  o botão some. Sem tema: `livre`, como hoje.
- Logo da sidebar: se a cor da sidebar em uso pede texto claro
  (`corDeTextoContrastante`), usa `logoEscuroUrl` (cai em `logoUrl`); senão,
  `logoUrl`. Sem tema, como hoje.
- Favicon: `generateMetadata` do layout do painel devolve `icons` com
  `faviconUrl` quando houver.

## Tela

Administração → Empresas → ação **Tema e marca** na linha da empresa →
`/empresas/[id]/tema`, só para `empresa:gerenciar`.

- **Tema atual:** nome do tema (ou "Padrão do sistema"), botões **Exportar
  tema** (download `tema-<empresa>.json`) e **Restaurar padrão** (com
  confirmação).
- **Importar tema:** arquivo `.json` ou JSON colado num campo de texto →
  **Validar**. Mostra os erros (bloqueiam) e os avisos de contraste; uma
  **prévia** no modo claro e no escuro (botão primário, texto, texto apagado,
  cartão, faixa da sidebar com o logo, amostra das fontes) com as cores do
  arquivo; botão **Aplicar tema** (com avisos, pede confirmação explícita).
- **Marca:** uploads de logo para fundo claro (o atual), logo para fundo
  escuro e favicon, com prévia e "remover".
- **Ajuda:** links de download para o schema, o modelo de pedido para a IA e
  o exemplo Hortitex (arquivos estáticos em `public/temas/`).

## Material de apoio

`docs/temas/README.md` — como funciona, papéis, regras de validação e
contraste, passo a passo do fluxo com IA. Os arquivos para download ficam em
`public/temas/` (servidos em `/temas/…`):

- `nx-tema.schema.json` — gerado do `temaSchema`.
- `modelo-pedido-ia.md` — texto para colar numa IA junto com o manual de
  marca: explica os papéis, exige só `#RRGGBB`, as regras de contraste
  (4,5:1 nos pares essenciais), proíbe campos extras e pede só o JSON.
- `hortitex.json` — o tema da Hortitex (mapeamento abaixo).

### Tema Hortitex

| Papel | Claro | Escuro |
|---|---|---|
| fundo | `#f7f1e3` (surface) | `#16221a` |
| texto | `#3a281c` (ink) | `#f5eedd` |
| primaria | `#1f4d2e` (verde-floresta) | `#6fae5e` |
| textoSobrePrimaria | `#f7f1e3` (on-brand) | `#16221a` |
| sidebar | `#1f4d2e` | `#25362b` (areia escura) |
| textoSobreSidebar | `#f7f1e3` | `#f5eedd` |
| cartao | `#fbf7ee` (creme mais claro, para destacar do fundo) | `#1d2b21` |
| apoio | `#ebe0c8` (areia) | `#25362b` |
| textoApagado | `#6b5645` (muted) | `#b9b29e` |
| destaque | `#ebe0c8` | `#25362b` |
| erro | `#b83a24` (pimenta) | `#e5694f` |
| cabecalho | `#f7f1e3` | `#16221a` |
| graficos | `#1f4d2e`, `#4f8a3c`, `#b83a24`, `#e8a93a`, `#6b5645` | `#6fae5e`, `#9bcb7f`, `#e5694f`, `#f0b84f`, `#b9b29e` |

Fontes: texto `"Calibri", Carlito, system-ui, sans-serif` (Google: Carlito);
títulos `"Cambria", Caladea, Georgia, serif` (Google: Caladea). Raio `12px`.
Os SVGs do logo são enviados por upload pelo desenvolvedor (não entram no
repositório).

Os valores de `cartao` e da sidebar escura não estão no manual; foram
escolhidos dentro da paleta para a sidebar se destacar do fundo no escuro e o
cartão se destacar no claro. O teste confirma que todos os pares essenciais
passam.

## Testes

- **Unitários** (`src/lib/tema/*.test.ts`):
  - Hortitex aceito, sem erros;
  - recusas: cor `#fff`, `red` e `#gggggg`; campo desconhecido; `formato` ou
    `versao` errados; `url(` e `;` na pilha; nome de fonte com caractere
    inválido; raio `40px` e `1em`; `cores.claro` ausente;
  - contraste: `contraste("#000000", "#ffffff")` = 21; par essencial ruim
    bloqueia com a mensagem do caminho; secundário ruim só avisa;
  - `variaveisDoTema`: herança (`cartao` → `fundo`, `foco` → `primaria`,
    `textoCabecalho` sem `cabecalho` → `texto`) e derivados da sidebar;
  - tema sem `escuro` → `escuro: null`;
  - `cssDoTema` só contém propriedades da lista conhecida e valores
    validados;
  - `urlGoogleFonts` com os nomes codificados e `display=swap`; sem `google`,
    `null`;
  - `public/temas/nx-tema.schema.json` igual ao gerado; `public/temas/hortitex.json`
    válido.
- **Integração** (`temaEmpresa.test.ts`): importar grava e audita; com
  avisos, exige confirmação; restaurar zera e audita; só o Administrador
  (`PermissionError` para os demais perfis); empresa inexistente recusada;
  JSON salvo inválido (formato mudou) é ignorado na aplicação, com o padrão.
- **Navegador:** importar a Hortitex numa empresa de teste; conferir claro e
  escuro, diálogo (portal) com as cores da marca, fontes Caladea/Carlito
  carregadas, seletor só com Claro/Escuro, logo; exportar; restaurar o
  padrão; 390px sem rolagem horizontal; empresa sem tema igual a antes.

## Docs

- `docs/temas/README.md` e `public/temas/` (acima).
- Ajuda (`content/ajuda/passo-a-passo.md`), seção de Empresas: tema e marca,
  fluxo com IA.
- `docs/fases/fase-1-fundacao.md`: registro da conclusão (identidade visual
  por empresa evoluída para tema).
