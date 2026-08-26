import { z } from "zod";

export const PERFIS = [
  "ADMINISTRADOR",
  "FINANCEIRO",
  "TESOURARIA",
  "GESTOR",
  "AUDITOR",
  "CONSULTA",
] as const;

export const criarUsuarioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  email: z.string().trim().email("Email inválido"),
  senha: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
  perfil: z.enum(PERFIS),
});

export const atualizarPerfilSchema = z.object({
  usuarioId: z.string().min(1),
  perfil: z.enum(PERFIS),
});
