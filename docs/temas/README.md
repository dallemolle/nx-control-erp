# Temas por empresa

Cada empresa pode ter um **tema** que troca as cores (modo claro e escuro), as
fontes e o raio dos cantos do painel, para o sistema ter a cara do cliente.
Empresa sem tema usa o visual padrão do NX Control, com as 6 variações de
sempre. Logo (fundo claro e fundo escuro) e favicon vão por upload na mesma
tela.

Spec: [2026-11-15-tema-por-empresa-design.md](../superpowers/specs/2026-11-15-tema-por-empresa-design.md).

## Onde importar

Administração → Empresas → **Tema e marca** na linha da empresa (só o
Administrador). A tela é um [editor visual](#editor-visual); **Exportar**
baixa o tema do editor e **Restaurar padrão** volta ao visual do sistema.

## Editor visual

Spec: [2026-11-15-editor-visual-tema-design.md](../superpowers/specs/2026-11-15-editor-visual-tema-design.md).
É o caminho principal para criar e ajustar o tema, sem depender da IA.

- Começa do tema salvo da empresa; sem tema, do padrão do sistema
  (`TEMA_PADRAO`, com o nome da empresa).
- Cores em grupos recolhíveis (essenciais, superfícies e apoio, cabeçalho/foco/
  borda/erro, gráficos). Nos papéis opcionais, **Automático** herda de outro
  papel. Cada cor de texto tem um selo de contraste (ok, aviso, erro) e a
  prévia muda na hora.
- Abas **Claro** / **Escuro** definem qual modo os controles editam; **Ter modo
  escuro** liga e desliga o modo escuro.
- **Fontes e raio:** nome no Google Fonts + sans/serif (ou pilha avançada) e
  raio de 0 a 32px.
- **Salvar** fica bloqueado enquanto houver erro de contraste essencial; avisos
  pedem confirmação. **Descartar alterações** volta ao último estado salvo.
- **Importar JSON** (arquivo ou texto colado, ex.: gerado por IA) carrega o tema
  no editor para ajustar antes de salvar. O tema importado precisa passar na
  validação (erros de contraste essenciais incluídos) para ser carregado.
- **Exportar** gera o JSON no navegador a partir do estado do editor.

## Gerar um tema com IA

1. Baixe o [modelo de pedido](../../public/temas/modelo-pedido-ia.md)
   (na tela: "Modelo de pedido para a IA").
2. Cole o texto numa IA junto com o manual de marca do cliente.
3. Salve a resposta como `.json` (ou copie o texto) e importe na tela.
4. Se aparecer erro, cole a mensagem de volta na IA e peça a correção.

## Arquivos (servidos em `/temas/…`)

| Arquivo | Para quê |
|---|---|
| [`nx-tema.schema.json`](../../public/temas/nx-tema.schema.json) | JSON Schema do formato (validação em editores e IAs). Gerado do `temaSchema`: depois de mudar `src/lib/tema/schema.ts`, rode `npm run tema:schema` (um teste falha se o arquivo ficar desatualizado). |
| [`modelo-pedido-ia.md`](../../public/temas/modelo-pedido-ia.md) | Texto para colar numa IA com o manual de marca. |
| [`hortitex.json`](../../public/temas/hortitex.json) | Primeiro tema de exemplo (marca Hortitex). |

## Regras (resumo)

- Formato `"nx-tema"`, versão `1`; campos desconhecidos são recusados.
- Cores só `#RRGGBB`. Papéis obrigatórios: `fundo`, `texto`, `primaria`,
  `textoSobrePrimaria`, `sidebar`, `textoSobreSidebar`. Os opcionais herdam
  (ex.: `cartao` usa `fundo`; `foco` usa `primaria`).
- Contraste mínimo 4,5:1: bloqueia em texto/fundo, texto sobre primária,
  texto sobre sidebar e texto do cabeçalho; nos demais pares, só avisa.
- Fontes só pelo nome do Google Fonts (até 2 por pilha) + pilha de
  alternativas; nada de URL. Raio até 32px.
- Sem `cores.escuro`, a empresa fica só no modo claro.

O código está em `src/lib/tema/` (formato, validação, CSS) e
`src/server/services/temaEmpresa.ts` (gravação).
