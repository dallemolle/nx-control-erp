"use server";

import { revalidatePath } from "next/cache";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { rejeicaoBaixaSchema } from "@/lib/schemas/baixa";
import * as baixaService from "@/server/services/baixa";

export async function aprovarBaixaAction(formData: FormData): Promise<void> {
  const sessao = await requireSessaoAtiva();
  const baixaId = String(formData.get("baixaId") ?? "");

  await baixaService.aprovarBaixa(sessao, baixaId);
  revalidatePath("/financeiro/aprovacoes");
}

export type FormState = { erro?: string; sucesso?: boolean };

export async function rejeitarBaixaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessao = await requireSessaoAtiva();
  const baixaId = String(formData.get("baixaId") ?? "");
  const parsed = rejeicaoBaixaSchema.safeParse({ motivo: formData.get("motivo") });
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Informe o motivo" };
  }

  await baixaService.rejeitarBaixa(sessao, baixaId, parsed.data.motivo);
  revalidatePath("/financeiro/aprovacoes");
  return { sucesso: true };
}
