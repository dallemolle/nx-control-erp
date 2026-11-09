import type { Perfil } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";

export type FixtureProducao = {
  empresaId: string;
  outraEmpresaId: string;
  filialAId: string;
  filialBId: string;
  usuarioId: string;
  /** Sessão na filial A (ou B) com o perfil pedido; as permissões vêm só do perfil. */
  sessao: (perfil: Perfil, opcoes?: { filial?: "A" | "B"; somenteLeitura?: boolean }) => SessaoAtiva;
  limpar: () => Promise<void>;
};

export async function criarFixtureProducao(sufixo: string): Promise<FixtureProducao> {
  const d = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  const empresa = await prisma.empresa.create({
    data: { razaoSocial: `Prod ${sufixo} Ltda`, nomeFantasia: `Prod ${sufixo}`, cnpjCpf: `44.${d}/0001-01` },
  });
  const outra = await prisma.empresa.create({
    data: { razaoSocial: `Outra ${sufixo} Ltda`, nomeFantasia: `Outra ${sufixo}`, cnpjCpf: `44.${d}/0001-02` },
  });
  const filialA = await prisma.filial.create({
    data: { empresaId: empresa.id, nome: "Filial A", cnpjCpf: `44.${d}/0001-03` },
  });
  const filialB = await prisma.filial.create({
    data: { empresaId: empresa.id, nome: "Filial B", cnpjCpf: `44.${d}/0001-04` },
  });
  const usuario = await prisma.usuario.create({
    data: { nome: `Usuario ${sufixo}`, email: `producao-${sufixo}-${d}@teste.local`, senhaHash: "x" },
  });

  const empresas = [empresa.id, outra.id];
  return {
    empresaId: empresa.id,
    outraEmpresaId: outra.id,
    filialAId: filialA.id,
    filialBId: filialB.id,
    usuarioId: usuario.id,
    sessao: (perfil, opcoes = {}) => ({
      usuarioId: usuario.id,
      nome: usuario.nome,
      empresaId: empresa.id,
      perfil,
      filialId: opcoes.filial === "B" ? filialB.id : filialA.id,
      podeAlterarFilial: !opcoes.somenteLeitura,
    }),
    limpar: async () => {
      await prisma.auditLog.deleteMany({ where: { empresaId: { in: empresas } } });
      // Fruta tem onDelete: Restrict para produto e talhão: apagar estes antes da empresa.
      await prisma.produto.deleteMany({ where: { empresaId: { in: empresas } } });
      await prisma.talhao.deleteMany({ where: { filial: { empresaId: { in: empresas } } } });
      await prisma.empresa.deleteMany({ where: { id: { in: empresas } } });
      await prisma.usuario.delete({ where: { id: usuario.id } });
    },
  };
}
