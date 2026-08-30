import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Perfil } from "@prisma/client";
import { auth } from "./config";
import { requireVinculoAtivo, AcessoNegadoError } from "@/server/services/usuarioEmpresa";
import {
  requireVinculoFilialAtivo,
  AcessoFilialNegadoError,
} from "@/server/services/usuarioEmpresaFilial";

export const EMPRESA_ATIVA_COOKIE = "empresaAtivaId";
export const FILIAL_ATIVA_COOKIE = "filialAtivaId";

export type SessaoAtiva = {
  usuarioId: string;
  nome: string;
  empresaId: string;
  perfil: Perfil;
  filialId: string;
  podeAlterarFilial: boolean;
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

  let perfil: Perfil;
  try {
    perfil = await requireVinculoAtivo(usuario.id, empresaId);
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      redirect("/selecionar-empresa");
    }
    throw erro;
  }

  const filialId = cookieStore.get(FILIAL_ATIVA_COOKIE)?.value;
  if (!filialId) {
    redirect("/selecionar-filial");
  }

  try {
    const { podeAlterar } = await requireVinculoFilialAtivo(usuario.id, empresaId, filialId);
    return {
      usuarioId: usuario.id,
      nome: usuario.nome,
      empresaId,
      perfil,
      filialId,
      podeAlterarFilial: podeAlterar,
    };
  } catch (erro) {
    if (erro instanceof AcessoFilialNegadoError) {
      redirect("/selecionar-filial");
    }
    throw erro;
  }
}
