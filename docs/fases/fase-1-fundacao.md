# Fase 1 — Fundação

Status: 🟡 **Em andamento.** Arquitetura, autenticação, RBAC, auditoria,
empresas e usuários estão completos e testados. Dos 9 cadastros básicos
previstos, 3 estão implementados (servem de padrão de referência) e 6 estão
pendentes.

## Escopo desta fase

Arquitetura, banco de dados, autenticação, empresas, usuários, permissões e
cadastros básicos — a base sobre a qual as Fases 2-6 (contas a pagar/receber,
conciliação, fluxo de caixa, controladoria, gestão) serão construídas.

## Arquitetura

Aplicação única Next.js (App Router), full-stack, hospedada na Vercel:

- **Server Actions** como camada principal de mutação — type-safe, colocadas
  junto do domínio.
- **Route Handlers** só onde o modelo HTTP é necessário (auth, futuros
  exports/importações).
- **Camada de serviços** (`src/server/services/*`) concentra toda regra de
  negócio. UI e Server Actions apenas chamam serviços — nunca recalculam nada
  no client.
- **RBAC centralizado**: `requirePermission(perfil, acao)` em
  `src/server/auth/permissions.ts`, chamado no início de toda operação
  sensível.
- **Auditoria centralizada**: `registrarAuditoria(...)` em
  `src/server/audit/registrar.ts`, chamado explicitamente pelos serviços de
  escrita — grava usuário, ação, entidade e diff (valor anterior/novo).
- **Multi-empresa desde o schema**: toda entidade de negócio carrega
  `empresaId`; um usuário pode ter perfis diferentes em empresas diferentes
  via `UsuarioEmpresa`.

### Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 16 (App Router) |
| Linguagem | TypeScript estrito |
| Banco | PostgreSQL (Neon em produção; Docker Compose local em dev) |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Auth | Auth.js (NextAuth v5), Credentials provider, sessão **JWT** |
| UI | shadcn/ui (Base UI) + Tailwind CSS |
| Validação | Zod |
| Testes | Vitest |
| Deploy | Vercel |

### Desvio em relação ao plano original: estratégia de sessão

O plano original previa sessão em banco (tabela própria) para permitir
revogação imediata ao desativar um usuário. Na implementação, descobrimos que
o Auth.js **recusa** `session.strategy: "database"` combinado com o
Credentials provider (erro `UnsupportedStrategy`). A solução adotada foi
sessão **JWT** com uma reconsulta ao usuário no callback `session` a cada
requisição (`src/server/auth/config.ts`) — o efeito prático de revogação
imediata é mantido (a próxima requisição de um usuário desativado já falha),
só a implementação mudou. A tabela `Sessao` que existia para o adapter
customizado foi removida via migration.

## Modelo de dados

Todas as 13 entidades da Fase 1 estão modeladas em `prisma/schema.prisma` e
migradas no banco (independentemente de já terem service/UI implementados):

`Empresa`, `Usuario`, `UsuarioEmpresa` (perfil por empresa), `CentroCusto`
(hierárquico), `CentroLucro`, `Safra`, `Projeto`, `CategoriaFinanceira`
(hierárquica), `Cliente`, `Fornecedor`, `Banco`, `ContaBancaria`, `AuditLog`.

Padrões aplicados a todas: nunca há exclusão física de registro de negócio
(campo `ativo`), sempre `criadoEm`/`atualizadoEm`, e todo dado é isolado por
`empresaId`.

## O que está implementado

- **Autenticação**: login por email/senha (bcrypt), sessão JWT com checagem
  de usuário ativo a cada requisição.
- **RBAC**: 6 perfis (`ADMINISTRADOR`, `FINANCEIRO`, `TESOURARIA`, `GESTOR`,
  `AUDITOR`, `CONSULTA`) com mapa de permissões em
  `src/server/auth/permissions.ts`.
- **Auditoria**: toda escrita crítica grava em `AuditLog` com diff de campos
  alterados; tela de consulta em `/auditoria`.
- **Multi-empresa**: seleção de empresa ativa após login (`/selecionar-empresa`),
  troca de empresa sem novo login, isolamento de dados por `empresaId`.
- **Empresas** (`/empresas`, admin): CRUD completo.
- **Usuários** (`/usuarios`, admin): criação, vínculo a empresas com perfil,
  troca de perfil, ativar/desativar (com proteção contra autodesativação).
- **Cadastros implementados** (padrão "flat"): **Clientes**
  (`/cadastros/clientes`), **Fornecedores** (`/cadastros/fornecedores`).
- **Cadastro implementado** (padrão hierárquico, com prevenção de ciclo):
  **Centros de custo** (`/cadastros/centros-de-custo`).
- **Dashboard** (`/`): contagens reais por empresa (clientes, fornecedores,
  centros de custo/lucro, safras, contas bancárias, usuários).

## O que falta para fechar a Fase 1

Replicar os dois padrões já validados para os 6 cadastros restantes (schema
já existe, falta service + Server Actions + UI):

- Padrão "flat" (igual Cliente/Fornecedor): **Centro de lucro**, **Safra**,
  **Projeto**, **Banco**, **Conta bancária**.
- Padrão hierárquico (igual Centro de custo): **Categoria financeira**.

## Testes automatizados

19 testes (Vitest) cobrindo as regras críticas identificadas no plano —
CRUDs simples são verificados manualmente, não unitariamente, por serem
glue code sobre essas peças já testadas:

- `src/server/auth/permissions.test.ts` — RBAC.
- `src/server/audit/diff.test.ts` + `registrar.test.ts` — cálculo de diff e
  persistência de auditoria (integração com Postgres real).
- `src/server/services/hierarquia.test.ts` — prevenção de ciclo em
  hierarquias (centro de custo / categoria financeira).
- `src/server/services/usuarioEmpresa.test.ts` — validação de vínculo
  usuário↔empresa ativo (integração com Postgres real).
- `src/server/auth/senha.test.ts` — hash/verificação de senha.

## Como rodar localmente

```bash
docker compose up -d           # Postgres local
cp .env.example .env           # ajustar se necessário
npm install
npm run db:migrate             # aplica as migrations
npm run db:seed                # cria empresa/admin de demonstração
npm run dev                    # http://localhost:3000
```

Login de demonstração criado pelo seed: `admin@nx-control-erp.local` /
`TrocarSenha123!` (ou o valor de `SEED_ADMIN_SENHA`, se definido).

```bash
npm run test    # suíte Vitest
npm run build   # build de produção + type-check
```

Em produção (Vercel), configurar `DATABASE_URL`/`DIRECT_URL` apontando para
um projeto Neon e `AUTH_SECRET` com um valor aleatório gerado localmente
(veja a nota de deploy abaixo — `npx auth secret` **não** deve ser usado,
resolve para o pacote errado).

### Nota de deploy: geração do Prisma Client na Vercel

O pacote `@prisma/client` só expõe `PrismaClient` e os tipos do schema
(`Perfil`, `Prisma`, etc.) depois que `prisma generate` roda. Isso passa
despercebido em dev porque o comando é rodado manualmente em algum momento,
mas quebra o build numa Vercel "limpa" (`npm install` nunca gera o client),
com erros do tipo `Module '"@prisma/client"' has no exported member
'PrismaClient'` e uma cascata de `implicitly has an 'any' type` em tudo que
deriva dele. Por isso `package.json` tem:

```json
"postinstall": "prisma generate",
"build": "prisma generate && next build",
```

o `postinstall` cobre o caso normal, e o `prisma generate` no `build` é um
reforço para cenários de build com cache de `node_modules`.

Mesmo com isso, o build continuou falhando com os mesmos erros — a causa
era outra (ver nota abaixo sobre `allowScripts`), o `postinstall` nem estava
rodando.

### Nota de deploy: npm 12 bloqueia scripts de instalação não aprovados

A partir do npm 12 (usado no build da Vercel; localmente ainda estávamos na
11.x), scripts de `preinstall`/`postinstall` de dependências só rodam se
estiverem listados em `allowScripts` no `package.json` — sem isso, o npm só
avisa ("not yet covered by allowScripts") e **pula o script**. Isso incluía
o `preinstall` do próprio `prisma` e o `postinstall` do `@prisma/engines`
(que baixa os binários da engine), então mesmo com `postinstall: "prisma
generate"` configurado, o Prisma nunca ficava pronto para gerar o client
corretamente.

Correção: rodar `npx npm@latest approve-scripts --all` localmente, que
grava a allowlist em `package.json`:

```json
"allowScripts": {
  "esbuild@0.28.2": true,
  "prisma@7.9.1": true,
  "unrs-resolver@1.12.2": true,
  "@prisma/engines@7.9.1": true
}
```

Sempre que uma dependência nova trouxer install scripts, o npm vai avisar de
novo e o comando precisa ser rerodado (ou `npm approve-scripts <pkg>` para
aprovar só o pacote específico).

### Nota de deploy: `prisma.config.ts` não pode depender de env vars

`prisma.config.ts` inicialmente lia `DIRECT_URL` com o helper `env(...)` do
`prisma/config`, que **lança erro se a variável não existir** — isso
derrubava até o `prisma generate` (que não precisa de conexão nenhuma com o
banco) sempre que `DATABASE_URL`/`DIRECT_URL` não estavam configuradas no
ambiente, como numa Vercel recém-criada antes de apontar para o Neon. A
correção foi trocar para leitura direta de `process.env` (`??`), que resolve
para `undefined` em vez de lançar erro — comandos que realmente precisam da
conexão (`migrate`, `studio`) continuam funcionando normalmente e falham com
mensagem própria se a variável estiver ausente.

### Nota de deploy: variáveis de ambiente e migrations em produção/staging

O build da Vercel só roda `prisma generate` (não `migrate deploy`) — ou seja,
ele nunca aplica migrations no banco sozinho. As migrations são aplicadas por
um workflow separado do GitHub Actions
(`.github/workflows/prisma-migrate.yml`), disparado a cada push em `main` ou
`staging` que altere `prisma/schema.prisma` ou `prisma/migrations/**`
(também pode ser rodado manualmente pela aba Actions → "Prisma migrate
deploy" → "Run workflow", escolhendo o branch).

O job usa **GitHub Environments** para nunca misturar os bancos: o branch
`main` roda no ambiente `production`, qualquer outro branch (hoje, só
`staging`) roda no ambiente `staging` — cada ambiente tem seu próprio
`DATABASE_URL`/`DIRECT_URL`. Configurar em Settings → Environments do
repositório:

1. Criar o ambiente `production`, com secrets `DATABASE_URL` (pooled) e
   `DIRECT_URL` (direct/unpooled) apontando para o projeto/branch de
   produção no Neon.
2. Criar o ambiente `staging`, com os mesmos nomes de secret, apontando para
   um banco (ou branch do Neon) separado de staging — nunca reaproveitar a
   connection string de produção aqui.
3. (Opcional, recomendado para produção) marcar o ambiente `production` como
   protegido, exigindo aprovação manual antes do job rodar.

Checklist para o primeiro deploy com um projeto Neon:

1. Nas configurações do projeto na Vercel (Settings → Environment Variables),
   configurar `DATABASE_URL` (connection string **pooled** do Neon),
   `DIRECT_URL` (connection string **direta/unpooled** do Neon) e
   `AUTH_SECRET`. Gere o valor de `AUTH_SECRET` localmente com:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   (`npx auth secret` **não** funciona aqui — o pacote `auth` do npm é o CLI
   de uma lib diferente, "Better Auth", e gera a variável com outro nome.)
2. Criar os ambientes `production`/`staging` no GitHub como descrito acima.
3. No primeiro push que adiciona o workflow, ele não dispara sozinho (o
   `paths` filter só reage a mudanças em `prisma/`) — rodar manualmente uma
   vez pela aba Actions ("Run workflow"), ou rodar `npm run db:deploy`
   localmente apontando para o Neon.
4. Opcionalmente rodar `npm run db:seed` (defina `SEED_ADMIN_*`/
   `SEED_EMPRESA_*` para dados reais — os padrões são só para dev local; veja
   `prisma/seed.ts`).
