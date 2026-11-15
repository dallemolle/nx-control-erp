# Editor visual do tema

Data: 2026-11-15 · Status: aprovado, aguardando plano

Entrega 2 de 2 do [tema por empresa](2026-11-15-tema-por-empresa-design.md).
A entrega 1 criou o formato `nx-tema` v1, a validação, a gravação e a
importação de JSON (gerado por IA). Esta entrega permite **criar e ajustar o
tema na própria tela**, com seletores por papel e prévia ao vivo, sem
depender da IA.

## Decisões deste desenho

1. **Edita tudo do formato:** cores (papéis obrigatórios e opcionais, claro e
   escuro, gráficos), raio e fontes. Fontes num modo simples (nome no Google
   + tipo sans/serif, pilha montada sozinha) e num modo avançado (pilha
   completa).
2. **Ponto de partida:** o tema gravado da empresa; sem tema, o **padrão do
   sistema** convertido para `nx-tema`. Sem assistente "gerar a partir de uma
   cor" nesta entrega (pode entrar depois sem mudar o editor).
3. **Importar JSON carrega no editor**, em vez de ir direto para "Aplicar":
   dá para ajustar antes de salvar.
4. **Layout lado a lado:** controles à esquerda em grupos recolhíveis, prévia
   fixa à direita com abas Claro/Escuro; a aba ativa define qual modo os
   controles editam.
5. **Validação e prévia no navegador** com as funções puras de
   `src/lib/tema/`; o servidor valida de novo ao salvar (`importarTema`).
   **Sem mudança de banco, formato ou serviço.**
6. Fora: aplicar o tema ao vivo no painel inteiro durante a edição; trava
   contra edição simultânea (prevalece o último a salvar, a auditoria
   registra os dois); verificação de que a fonte existe no Google.

## Tema padrão em `nx-tema`

O padrão do sistema (`globals.css`, variação A) usa `oklch(...)` e hex com
transparência, que o formato não aceita. Nova constante `TEMA_PADRAO: Tema`
em `src/lib/tema/padrao.ts`, com o equivalente `#RRGGBB` dos papéis
obrigatórios no claro e no escuro (`theme-a` e `theme-a-dark`; conversão
feita uma vez e registrada no comentário com o valor de origem), mais os
opcionais que já são hex no padrão (ex.: `cartao` e `apoio` do escuro,
`graficos`). Opcionais cujo padrão não cabe em hex (`borda`, `textoApagado`,
`erro` no claro) ficam ausentes, ou seja, "Automático" = padrão do sistema.
Nome: `"Padrão do sistema"`; sem fontes; sem raio.

Teste: `TEMA_PADRAO` passa em `validarTema` sem erros.

## Funções puras (`src/lib/tema/editor.ts`)

- `temaInicial(temaSalvo: unknown, nomeEmpresa: string): { tema: Tema; aviso: string | null }`
  — tema salvo válido → ele; ausente → `TEMA_PADRAO` com `nome` = nome da
  empresa; inválido → `TEMA_PADRAO` e o aviso "O tema gravado não passa mais
  na validação; o editor começou do padrão do sistema."
- `definirCor(tema, modo, papel, valor: string | undefined): Tema` —
  `undefined` remove um papel opcional; papel obrigatório nunca é removido
  (ignora). Normaliza para minúsculas.
- `definirGrafico(tema, modo, indice, valor)` e `graficosAutomaticos(tema, modo, ligado)`.
- `alternarModoEscuro(tema, ligado): Tema` — ligar sem `escuro` copia
  `TEMA_PADRAO.cores.escuro`; desligar remove `cores.escuro`.
- `pilhaDaFonte(google: string, tipo: "sans" | "serif"): string` —
  `"<Nome>", system-ui, sans-serif` ou `"<Nome>", Georgia, serif`.
- `definirFonte(tema, grupo: "texto" | "titulos", fonte | undefined)`,
  `definirRaio(tema, px: number | undefined)`, `definirNome(tema, nome)`.
- `paresDeContraste(tema, modo): Record<papel, { razao: number; nivel: "essencial" | "secundario"; ok: boolean }>`
  — para o selo ao lado de cada seletor, com a herança aplicada; os pares e
  níveis são os mesmos de `validarTema` (extrair a lista de pares de
  `validar.ts` para uma constante compartilhada, para não divergir).

Todas imutáveis (devolvem um novo `Tema`).

## Tela

`/empresas/[id]/tema`, só `empresa:gerenciar`. As seções "Tema atual" e
"Importar tema" dão lugar ao **editor**; a seção **Marca** (uploads) fica
como está, abaixo.

### Componentes (`src/app/(dashboard)/empresas/[id]/tema/`)

| Arquivo | Papel |
|---|---|
| `editor-tema.tsx` (cliente) | Estado em `useReducer` sobre as funções puras; layout lado a lado; barra de ações; aviso de alterações não salvas |
| `campo-cor.tsx` | `<input type="color">` + campo hex + selo de contraste; nos opcionais, interruptor **"Automático (herda de …)"** que, ligado, remove o papel |
| `grupo-papeis.tsx` | Grupo recolhível de campos |
| `campos-fonte-raio.tsx` | Texto e títulos: fonte do Google + sans/serif, "pilha avançada" (campo livre validado); raio em controle deslizante de 0 a 32px com "Automático" |
| `previa-tema.tsx` | Reaproveitado; ganha abas Claro/Escuro controladas pelo editor |
| `importar-tema-form.tsx` | Vira um botão "Importar JSON" (arquivo ou texto colado num diálogo) que alimenta o editor |

### Grupos de papéis

- **Essenciais:** fundo, texto, primária, texto sobre primária, sidebar,
  texto sobre sidebar.
- **Superfícies e apoio:** cartão, apoio, texto sobre apoio, texto apagado,
  destaque, texto sobre destaque.
- **Cabeçalho, foco, borda e erro:** cabeçalho, texto do cabeçalho, foco,
  borda, erro.
- **Gráficos:** 5 cores com "Automático" (padrão do sistema) para o grupo
  inteiro (o formato exige as 5 juntas).
- **Fontes e raio.**

O rótulo "herda de …" segue a tabela de papéis da entrega 1 (ex.: cartão →
fundo, foco → primária, borda → padrão do sistema).

### Topo e ações

- Topo: campo **Nome do tema**; interruptor **Ter modo escuro** (desligar
  pede confirmação); abas **Claro | Escuro** (a de Escuro some sem modo
  escuro).
- Barra de ações (fixa no rodapé da área do editor): **Importar JSON**,
  **Exportar** (baixa o estado atual do editor como
  `tema-<empresa>.json`, gerado no cliente), **Restaurar padrão** (só com
  tema gravado; ação existente, com confirmação; recarrega o editor com o
  padrão), **Descartar alterações**, **Salvar**.
- Resumo acima do Salvar: "N erros · M avisos"; clicar leva ao primeiro
  campo com problema.

### Fluxos

- **Editar:** cada mudança passa pelo reducer → `validarTema` +
  `variaveisDoTema` + `paresDeContraste` → prévia, selos e resumo na hora.
- **Importar JSON:** `validarTema` no cliente. Válido: substitui o estado
  (pede confirmação se houver alterações). Inválido: diálogo com a lista de
  erros; o editor não muda.
- **Salvar:** com erros, desabilitado. Sem erros: server action
  `salvarTemaAction(empresaId, json, confirmarAvisos)` → `importarTema`
  (permissão, validação, auditoria `IMPORTAR_TEMA`) → `revalidatePath("/", "layout")`.
  Com avisos e sem confirmação, abre a confirmação (regra de hoje).
  Erro do servidor aparece no resumo.
- **Alterações não salvas:** comparação com o último estado salvo;
  `beforeunload` e confirmação em Descartar e Importar.
- **Tema gravado inválido:** abre no padrão com o aviso de `temaInicial`.

### Validação ao vivo

- Selo por campo com a razão de contraste com o par (`4,8:1`). Essencial
  abaixo de 4,5:1: vermelho, conta como erro e bloqueia o Salvar.
  Secundário abaixo de 4,5:1: âmbar, conta como aviso.
- Campo hex digitado inválido: marcado; o estado mantém o último valor
  válido até a correção.
- Nome de fonte e pilha avançada: validados pelas regras do schema;
  mensagem no próprio campo.
- `<link>` do Google Fonts da prévia atualizado com *debounce* de ~600ms.
  Texto de ajuda: se o nome não existir no Google, vale a fonte alternativa.

### Celular (390px)

Prévia em cima, compacta e não fixa; controles numa coluna; barra de ações
fixa no rodapé da tela. Sem rolagem horizontal.

## Testes

- **Unitários** (`src/lib/tema/editor.test.ts`, `padrao.test.ts`):
  `TEMA_PADRAO` válido; `temaInicial` com tema salvo, sem tema (nome da
  empresa) e com tema inválido (aviso); `definirCor` com `undefined` remove
  opcional e ignora obrigatório; normaliza para minúsculas; ligar escuro
  copia o padrão e desligar remove; `pilhaDaFonte` sans/serif passa no
  schema; `definirRaio(undefined)` remove; `paresDeContraste` concorda com
  `validarTema` (par essencial ruim → erro em ambos; secundário → aviso em
  ambos); funções não mutam a entrada.
- **Integração:** `salvarTemaAction` delega a `importarTema` e revalida
  (permissão, avisos e auditoria já cobertos em `temaEmpresa.test.ts`).
- **Navegador (Playwright):** empresa sem tema → editor no padrão; trocar a
  primária → prévia muda; contraste essencial ruim → Salvar bloqueado e
  selo vermelho; importar `hortitex.json` → editor carregado; salvar →
  painel com as cores; desligar escuro → seletor de aparência só com Claro;
  descartar volta ao salvo; 390px sem rolagem horizontal; empresa sem tema
  continua igual a antes.

## Docs

- Ajuda (`content/ajuda/passo-a-passo.md`), seção de Empresas: o editor como
  caminho principal e a IA + importação como atalho.
- `docs/temas/README.md`: seção do editor.
- `docs/fases/fase-1-fundacao.md`: registro da entrega 2.
- Spec da entrega 1: marcar a entrega 2 como feita.
