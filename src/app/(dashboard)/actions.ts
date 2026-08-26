"use server";

import { cookies } from "next/headers";
import { signOut } from "@/server/auth/config";
import { EMPRESA_ATIVA_COOKIE } from "@/server/auth/sessao";

export async function sair(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(EMPRESA_ATIVA_COOKIE);
  await signOut({ redirectTo: "/login" });
}
