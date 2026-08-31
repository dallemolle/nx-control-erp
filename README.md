# nx-control-erp

Sistema web de gestão financeira, tesouraria e planejamento de caixa —
contas a pagar/receber, conciliação bancária, fluxo de caixa (realizado,
projetado e estratégico), orçamento e controladoria por centro de custo,
centro de lucro e safra, com auditoria e controle de acesso por perfil.

Construído em fases incrementais. Veja **[docs/fases/](./docs/fases/README.md)**
para o escopo de cada fase e o status atual do projeto.

## Status atual

🟡 **Fase 1 — Fundação** em andamento: autenticação, RBAC, auditoria,
multi-empresa, empresas, usuários e 3 de 9 cadastros básicos já
implementados e testados. Detalhes em
[docs/fases/fase-1-fundacao.md](./docs/fases/fase-1-fundacao.md).

## Stack

Next.js 16 (App Router) · TypeScript · PostgreSQL (Neon em produção) ·
Prisma 7 · Auth.js v5 · shadcn/ui + Tailwind CSS · Zod · Vitest · Vercel.

## Como rodar localmente

Pré-requisitos: Node.js 20+, Docker (para o Postgres local).

```bash
docker compose up -d           # sobe um Postgres local
cp .env.example .env           # ajuste as variáveis se necessário
npm install
npm run db:migrate             # aplica as migrations
npm run db:seed                # cria empresa e usuário admin de demonstração
npm run dev                    # http://localhost:3000
```

Login de demonstração criado pelo seed:
`admin@nx-control-erp.local` / `TrocarSenha123!`
(ou o valor de `SEED_ADMIN_SENHA`, se você definir essa variável antes do seed).

## Scripts úteis

```bash
npm run test        # suíte de testes (Vitest)
npm run test:watch  # testes em modo watch
npm run build        # build de produção + type-check
npm run lint          # eslint
npm run db:migrate    # nova migration a partir do schema.prisma
npm run db:deploy     # aplica migrations pendentes (uso em produção)
npm run db:seed       # popula dados de demonstração
```

## Deploy

Aplicação pensada para rodar na Vercel com banco Neon Postgres. Em produção,
configure `DATABASE_URL`/`DIRECT_URL` apontando para o projeto Neon e
`AUTH_SECRET` com um valor aleatório gerado localmente, por exemplo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Migrations em produção/staging rodam via GitHub Actions
(`.github/workflows/prisma-migrate.yml`), com detalhes de configuração em
[docs/fases/fase-1-fundacao.md](./docs/fases/fase-1-fundacao.md#nota-de-deploy-variáveis-de-ambiente-e-migrations-em-produçãostaging).
Se o job falhar com **`P3005` ("The database schema is not empty")**, veja o
procedimento de baseline na
[nota de deploy correspondente](./docs/fases/fase-1-fundacao.md#nota-de-deploy-erro-p3005-the-database-schema-is-not-empty)
— nunca use `prisma migrate reset` para resolver isso, apaga o banco.
