"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUsuarioAutenticado } from "@/server/auth/sessao";
import { EMPRESA_ATIVA_COOKIE } from "@/server/auth/sessao";
import { requireVinculoAtivo } from "@/server/services/usuarioEmpresa";

export async function selecionarEmpresa(formData: FormData): Promise<void> {
  const usuario = await requireUsuarioAutenticado();
  const empresaId = String(formData.get("empresaId") ?? "");

  await requireVinculoAtivo(usuario.id, empresaId);

  const cookieStore = await cookies();
  cookieStore.set(EMPRESA_ATIVA_COOKIE, empresaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect("/");
}
