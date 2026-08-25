import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Perfil } from "@prisma/client";
import { auth } from "./config";
import { requireVinculoAtivo, AcessoNegadoError } from "@/server/services/usuarioEmpresa";

export const EMPRESA_ATIVA_COOKIE = "empresaAtivaId";

export type SessaoAtiva = {
  usuarioId: string;
  nome: string;
  empresaId: string;
  perfil: Perfil;
};

export async function requireUsuarioAutenticado() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return { id: session.user.id, nome: session.user.name ?? session.user.email ?? "" };
}

export async function requireSessaoAtiva(): Promise<SessaoAtiva> {
  const usuario = await requireUsuarioAutenticado();

  const cookieStore = await cookies();
  const empresaId = cookieStore.get(EMPRESA_ATIVA_COOKIE)?.value;
  if (!empresaId) {
    redirect("/selecionar-empresa");
  }

  try {
    const perfil = await requireVinculoAtivo(usuario.id, empresaId);
    return { usuarioId: usuario.id, nome: usuario.nome, empresaId, perfil };
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      redirect("/selecionar-empresa");
    }
    throw erro;
  }
}
