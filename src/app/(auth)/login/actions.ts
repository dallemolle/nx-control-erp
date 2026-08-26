"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/server/auth/config";

export type LoginState = { erro?: string };

export async function entrar(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email");
  const senha = formData.get("senha");

  try {
    await signIn("credentials", { email, senha, redirect: false });
  } catch (erro) {
    if (erro instanceof AuthError) {
      return { erro: "Email ou senha inválidos" };
    }
    throw erro;
  }

  redirect("/selecionar-empresa");
}
