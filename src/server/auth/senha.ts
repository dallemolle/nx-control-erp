import bcrypt from "bcryptjs";

const CUSTO_HASH = 12;

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_HASH);
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}
