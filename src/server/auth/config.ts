import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/server/db/client";
import { verificarSenha } from "./senha";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const senha = credentials?.senha;
        if (typeof email !== "string" || typeof senha !== "string") return null;

        const usuario = await prisma.usuario.findUnique({ where: { email } });
        if (!usuario || !usuario.ativo) return null;

        const senhaValida = await verificarSenha(senha, usuario.senhaHash);
        if (!senhaValida) return null;

        return { id: usuario.id, name: usuario.nome, email: usuario.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    // Reconsulta o usuário a cada requisição para revogar o acesso imediatamente
    // quando ele for desativado (Credentials + Auth.js só suporta estratégia JWT,
    // então a revogação não vem de apagar uma sessão em banco, e sim daqui).
    async session({ session, token }) {
      const usuarioId = typeof token.id === "string" ? token.id : undefined;
      if (!usuarioId) {
        session.user = undefined as unknown as typeof session.user;
        return session;
      }

      const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
      if (!usuario || !usuario.ativo) {
        session.user = undefined as unknown as typeof session.user;
        return session;
      }

      session.user.id = usuario.id;
      session.user.name = usuario.nome;
      session.user.email = usuario.email;
      return session;
    },
  },
});
