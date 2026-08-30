"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  requireUsuarioAutenticado,
  EMPRESA_ATIVA_COOKIE,
  FILIAL_ATIVA_COOKIE,
} from "@/server/auth/sessao";
import { requireVinculoFilialAtivo } from "@/server/services/usuarioEmpresaFilial";

export async function selecionarFilial(formData: FormData): Promise<void> {
  const usuario = await requireUsuarioAutenticado();

  const cookieStore = await cookies();
  const empresaId = cookieStore.get(EMPRESA_ATIVA_COOKIE)?.value;
  if (!empresaId) {
    redirect("/selecionar-empresa");
  }

  const filialId = String(formData.get("filialId") ?? "");

  await requireVinculoFilialAtivo(usuario.id, empresaId, filialId);

  cookieStore.set(FILIAL_ATIVA_COOKIE, filialId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect("/");
}
