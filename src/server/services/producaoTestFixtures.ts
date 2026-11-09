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
      const filiais = { filial: { empresaId: { in: empresas } } };
      await prisma.auditLog.deleteMany({ where: { empresaId: { in: empresas } } });
      // Estoque e recepções antes de lote/produto/local (relações Restrict).
      await prisma.movimentoEstoque.deleteMany({ where: filiais });
      await prisma.ajusteEstoque.deleteMany({ where: filiais });
      await prisma.recepcaoFruto.deleteMany({ where: filiais });
      await prisma.titulo.deleteMany({ where: filiais });
      await prisma.lote.deleteMany({ where: filiais });
      await prisma.configuracaoProducao.deleteMany({ where: filiais });
      // Fruta tem onDelete: Restrict para produto e talhão: apagar estes antes da empresa.
      await prisma.produto.deleteMany({ where: { empresaId: { in: empresas } } });
      await prisma.talhao.deleteMany({ where: { filial: { empresaId: { in: empresas } } } });
      await prisma.empresa.deleteMany({ where: { id: { in: empresas } } });
      await prisma.usuario.delete({ where: { id: usuario.id } });
    },
  };
}

export type CatalogoDeTeste = {
  frutaId: string;
  /** Código "FA", validade 1 dia, rasa = 14 kg. */
  produtoFrutoId: string;
  produtoPolpaId: string;
  talhaoId: string;
  localRecepcaoId: string;
  localCamaraId: string;
  fornecedorId: string;
  /** Categoria DESPESA da filial A, para a compra de fruto. */
  categoriaCompraId: string;
};

/** Catálogo mínimo da produção na filial A da fixture. */
export async function criarCatalogoDeTeste(fx: FixtureProducao): Promise<CatalogoDeTeste> {
  const fruta = await prisma.fruta.create({
    data: { empresaId: fx.empresaId, nome: "Açaí", custoPadraoKg: 1.5, exigeBranqueamento: true },
  });
  const produtoFruto = await prisma.produto.create({
    data: {
      empresaId: fx.empresaId,
      codigo: "FA",
      descricao: "Fruto de açaí",
      categoria: "FRUTO",
      frutaId: fruta.id,
      conservacao: "IN_NATURA",
      validadeDias: 1,
      unidadeComercial: "rasa",
      fatorUnidadeKg: 14,
    },
  });
  const produtoPolpa = await prisma.produto.create({
    data: {
      empresaId: fx.empresaId,
      codigo: "AGC",
      descricao: "Polpa de açaí grosso",
      categoria: "POLPA",
      frutaId: fruta.id,
      conservacao: "CONGELADO",
      validadeDias: 365,
    },
  });
  const talhao = await prisma.talhao.create({
    data: { filialId: fx.filialAId, nome: "Talhão 1", frutaId: fruta.id, areaHa: 2 },
  });
  const localRecepcao = await prisma.localArmazenamento.create({
    data: { filialId: fx.filialAId, nome: "Recepção", tipo: "RECEPCAO" },
  });
  const localCamara = await prisma.localArmazenamento.create({
    data: { filialId: fx.filialAId, nome: "Câmara fria 01", tipo: "CAMARA_FRIA", capacidadeKg: 1000 },
  });
  const sufixo = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  const fornecedor = await prisma.fornecedor.create({
    data: { empresaId: fx.empresaId, nome: "Produtor exemplo", cnpjCpf: `555.${sufixo.slice(0, 3)}.${sufixo.slice(3, 6)}-${sufixo.slice(6, 8)}` },
  });
  const categoria = await prisma.categoriaFinanceira.create({
    data: { filialId: fx.filialAId, nome: "Compra de fruto", tipo: "DESPESA" },
  });
  return {
    frutaId: fruta.id,
    produtoFrutoId: produtoFruto.id,
    produtoPolpaId: produtoPolpa.id,
    talhaoId: talhao.id,
    localRecepcaoId: localRecepcao.id,
    localCamaraId: localCamara.id,
    fornecedorId: fornecedor.id,
    categoriaCompraId: categoria.id,
  };
}
