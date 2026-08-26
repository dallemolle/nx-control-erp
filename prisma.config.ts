import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // process.env direto (nao o helper `env()`) porque `prisma generate` nao
    // precisa de conexao com o banco e nao pode falhar so por essas variaveis
    // nao estarem definidas (ex.: build na Vercel antes de configurar o Neon).
    // CLI (migrate/studio) usa conexao direta; em Neon, DIRECT_URL evita o pooler.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
