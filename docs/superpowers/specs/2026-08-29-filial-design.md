# Design — Nível de filial (Empresa → Filial)

Status: Aprovado. Ainda não implementado — entra como retrofit dentro da
Fase 1 (ver `docs/fases/fase-1-fundacao.md`).

## Contexto

O modelo de dados isola tudo por `empresaId` (CNPJ). Na prática, uma empresa
pode ter mais de uma filial (cada uma com seu próprio CNPJ, mesma raiz,
sufixo de ordem diferente), e o sistema precisa desse segundo nível de
controle abaixo de empresa.

## Modelo de dados

Novo model `Filial`: `id`, `empresaId`, `nome`, `cnpj` (único, próprio da
filial), `ativo`, `criadoEm`/`atualizadoEm` — relação com `Empresa`
(`onDelete: Cascade`). `Empresa` mantém seu `cnpj` atual (identifica a
matriz/raiz) e ganha `filiais Filial[]`.

O isolamento das entidades de negócio passa a ser **misto por entidade**,
não uniforme:

- **Por empresa** (cadastro único, compartilhado entre todas as filiais):
  `Cliente`, `Fornecedor`. Mantêm `empresaId` como está hoje — não mudam de
  coluna nem de unique constraint.
- **Por filial**: `CentroCusto`, `CentroLucro`, `Safra`, `Projeto`,
  `CategoriaFinanceira`, `ContaBancaria`. Trocam `empresaId` por
  `filialId`, com os `@@unique` reescritos por filial (ex:
  `@@unique([filialId, codigo])`).

`Banco` (catálogo global de instituições) não muda — continua sem
`empresaId`/`filialId`.

`AuditLog` ganha `filialId String?` mantendo `empresaId String?` — ações de
nível empresa (criar/atualizar/(in)ativar uma empresa, vincular usuário a
uma empresa) ficam só com `empresaId`; ações sobre entidades filial-scoped
ganham os dois, permitindo à Fase 6 filtrar auditoria por filial específica
ou consolidado por empresa. Ações sobre Cliente/Fornecedor (empresa-scoped)
também ganham `filialId: sessao.filialId` — não como fronteira de
isolamento (essas entidades continuam lidas/gravadas por `empresaId`,
compartilhadas entre filiais), mas como rastro de qual filial estava ativa
no momento da escrita, útil para auditoria/traceability. A auditoria da
própria criação de uma Filial (`criarFilial`) carrega `filialId` da filial
recém-criada — não da filial ativa da sessão, que é uma entrada
independente e não uma exceção ao critério acima.

`UsuarioEmpresa` não muda — perfil fixo (`ADMINISTRADOR`, `FINANCEIRO`,
`TESOURARIA`, `GESTOR`, `AUDITOR`, `CONSULTA`) continua definindo quais
ações/módulos o usuário acessa, como hoje.

Novo model `UsuarioEmpresaFilial`: `id`, `usuarioEmpresaId`, `filialId`,
`podeAlterar Boolean @default(false)`, `ativo`, `criadoEm`.
`@@unique([usuarioEmpresaId, filialId])`. A existência da linha já concede
**leitura** naquela filial; `podeAlterar = true` libera escrita — sempre
limitado pelo que o perfil já permite (ex: um `AUDITOR` continua só-leitura
mesmo com `podeAlterar = true`, porque o perfil dele nunca autoriza
escrita).

## RBAC e contexto ativo

Sessão passa a guardar empresa ativa **e** filial ativa (hoje só guarda
empresa ativa). Fluxo de seleção: `/selecionar-empresa` (como hoje) →
`/selecionar-filial` (novo), listando as filiais em que o usuário tem ao
menos leitura via `UsuarioEmpresaFilial`. Troca de filial sem novo login,
no mesmo padrão da troca de empresa atual.

`requirePermission` passa a checar duas camadas:

1. O perfil autoriza a ação naquele módulo (como já é hoje, sem mudança).
2. Para ações de escrita sobre entidades filial-scoped,
   `UsuarioEmpresaFilial.podeAlterar` precisa ser `true` na filial ativa.

Entidades empresa-scoped (`Cliente`, `Fornecedor`) continuam validando a
permissão de filial pela filial ativa do usuário (ele precisa ter acesso a
pelo menos uma filial daquela empresa), mas leem/gravam por `empresaId` —
qualquer filial autorizada da empresa enxerga e, se tiver `podeAlterar`,
edita o mesmo cadastro.

A tela de cadastro de usuário (`/usuarios`) ganha uma seção "acesso por
filial": para cada filial da empresa, o ADM marca leitura e/ou alteração
para aquele usuário.

## Migração dos dados existentes (retrofit na Fase 1)

1. Migration cria `Filial`. Para cada `Empresa` existente, cria uma filial
   "Matriz" com o `cnpj` que hoje está em `Empresa`.
2. Backfill de `filialId` nas 6 tabelas filial-scoped (`CentroCusto`,
   `CentroLucro`, `Safra`, `Projeto`, `CategoriaFinanceira`,
   `ContaBancaria`) apontando para a Matriz de cada empresa; coluna vira
   `NOT NULL` e `empresaId` é removido dessas 6.
3. `Cliente`/`Fornecedor` não mudam de coluna — nenhum backfill necessário
   ali.
4. Backfill de `UsuarioEmpresaFilial`: todo `UsuarioEmpresa` existente
   ganha acesso à Matriz da sua empresa com `podeAlterar = true` —
   comportamento idêntico ao atual para quem só tem uma unidade.
5. `AuditLog` histórico fica com `filialId` nulo (não vale a pena
   reconstruir retroativamente).
6. `prisma/seed.ts` passa a criar a empresa de demonstração já com sua
   filial Matriz.
7. Os 3 cadastros já implementados (`Cliente`, `Fornecedor`, `Centro de
   custo`) são adaptados: os dois primeiros continuam em `empresaId`
   (nenhuma mudança de schema, só a UI/serviço ganham a checagem de
   `UsuarioEmpresaFilial` para a filial ativa); Centro de custo migra para
   `filialId`.

## Impacto nos docs de fase

- `fase-1-fundacao.md`: modelo de dados ganha `Filial`/
  `UsuarioEmpresaFilial`; "O que falta" passa a incluir CRUD de filiais, a
  seção de acesso-por-filial no cadastro de usuário, fluxo de seleção de
  filial e a migração das 6 entidades — antes dos 6 cadastros restantes
  (que já nascem cientes de qual dos dois níveis usar).
- `fase-2-financeiro.md`: "contas bancárias por empresa" → "por filial".
- `fase-5-controladoria.md` / `fase-6-gestao.md`: "Filtros globais" ganham
  "Filial"; nota de que dashboards/relatórios consolidam por empresa (soma
  das filiais) ou detalham por filial.
- `fase-3-conciliacao.md` / `fase-4-fluxo-de-caixa.md`: sem menção direta a
  empresa hoje — nenhum ajuste de texto necessário.

## Fora de escopo

- Unificar Cliente/Fornecedor com granularidade por filial (decisão
  explícita: ficam por empresa).
- Substituir o sistema de 6 perfis fixos por permissões totalmente
  granulares — o toggle leitura/alteração por filial é um refinamento
  sobre o perfil existente, não uma reescrita do RBAC.
