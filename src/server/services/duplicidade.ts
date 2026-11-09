import { Prisma } from "@prisma/client";

export class DuplicidadeError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "DuplicidadeError";
  }
}

/** Troca a violação de unicidade do banco (P2002) por uma mensagem para o usuário. */
export async function comMensagemDeDuplicidade<T>(operacao: () => Promise<T>, mensagem: string): Promise<T> {
  try {
    return await operacao();
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      throw new DuplicidadeError(mensagem);
    }
    throw erro;
  }
}
