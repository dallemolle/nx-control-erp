import type { Perfil } from "@prisma/client";
import { prisma } from "@/server/db/client";

export class AcessoNegadoError extends Error {
  constructor() {
    super("Usuário não possui vínculo ativo com esta empresa");
    this.name = "AcessoNegadoError";
  }
}

export async function requireVinculoAtivo(usuarioId: string, empresaId: string): Promise<Perfil> {
  const vinculo = await prisma.usuarioEmpresa.findFirst({
    // Empresa inativa não abre sessão nem atende a API, mesmo para quem já estava dentro.
    where: { usuarioId, empresaId, ativo: true, empresa: { ativo: true } },
  });

  if (!vinculo) {
    throw new AcessoNegadoError();
  }

  return vinculo.perfil;
}
