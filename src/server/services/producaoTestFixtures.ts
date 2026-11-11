import type { Perfil } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { SessaoAtiva } from "@/server/auth/sessao";
import { registrarMovimento } from "./estoque";
import { obterBancoCaixa } from "./banco";

export type FixtureProducao = {
  empresaId: string;
  outraEmpresaId: string;
  filialAId: string;
  filialBId: string;
  usuarioId: string;
  /** Prefixo do código dos bancos criados pelo teste; `limpar()` apaga os que começam com ele. */
  prefixoBanco: string;
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
  const prefixoBanco = `T${d}`;
  return {
    empresaId: empresa.id,
    outraEmpresaId: outra.id,
    filialAId: filialA.id,
    filialBId: filialB.id,
    usuarioId: usuario.id,
    prefixoBanco,
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
      // Extratos e lançamentos antes das contas; pedidos antes de título, cliente e lote.
      await prisma.linhaExtrato.deleteMany({ where: { contaBancaria: filiais } });
      await prisma.extratoImportado.deleteMany({ where: filiais });
      await prisma.lancamentoBancario.deleteMany({ where: filiais });
      // Estoque e recepções antes de lote/produto/local (relações Restrict).
      await prisma.movimentoEstoque.deleteMany({ where: filiais });
      // OP antes de lote, fruta, produto, local e insumo (linhas em cascata).
      await prisma.ordemProducao.deleteMany({ where: filiais });
      await prisma.pedidoVenda.deleteMany({ where: filiais });
      await prisma.ajusteEstoque.deleteMany({ where: filiais });
      await prisma.recepcaoFruto.deleteMany({ where: filiais });
      await prisma.titulo.deleteMany({ where: filiais });
      await prisma.lote.deleteMany({ where: filiais });
      await prisma.configuracaoProducao.deleteMany({ where: filiais });
      // Fruta tem onDelete: Restrict para produto e talhão: apagar estes antes da empresa.
      await prisma.produto.deleteMany({ where: { empresaId: { in: empresas } } });
      await prisma.talhao.deleteMany({ where: { filial: { empresaId: { in: empresas } } } });
      await prisma.empresa.deleteMany({ where: { id: { in: empresas } } });
      await prisma.banco.deleteMany({ where: { codigo: { startsWith: prefixoBanco } } });
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
  /** "AFN", polpa de açaí fino (mesma fruta). */
  produtoPolpaFinoId: string;
  /** Cupuaçu: não exige branqueamento. */
  outraFrutaId: string;
  /** "FC", fruto de cupuaçu. */
  produtoFrutoOutraId: string;
  /** "CPC", polpa de cupuaçu. */
  produtoPolpaOutraId: string;
  /** "Embalagem 1 kg", un, R$ 0,50. */
  insumoId: string;
  insumoInativoId: string;
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
  const polpaFino = await prisma.produto.create({
    data: {
      empresaId: fx.empresaId,
      codigo: "AFN",
      descricao: "Polpa de açaí fino",
      categoria: "POLPA",
      frutaId: fruta.id,
      conservacao: "CONGELADO",
      validadeDias: 365,
    },
  });
  const outraFruta = await prisma.fruta.create({
    data: { empresaId: fx.empresaId, nome: "Cupuaçu", custoPadraoKg: 2, exigeBranqueamento: false },
  });
  const frutoOutra = await prisma.produto.create({
    data: {
      empresaId: fx.empresaId,
      codigo: "FC",
      descricao: "Fruto de cupuaçu",
      categoria: "FRUTO",
      frutaId: outraFruta.id,
      conservacao: "IN_NATURA",
      validadeDias: 1,
    },
  });
  const polpaOutra = await prisma.produto.create({
    data: {
      empresaId: fx.empresaId,
      codigo: "CPC",
      descricao: "Polpa de cupuaçu",
      categoria: "POLPA",
      frutaId: outraFruta.id,
      conservacao: "CONGELADO",
      validadeDias: 365,
    },
  });
  const insumo = await prisma.insumo.create({
    data: { empresaId: fx.empresaId, nome: "Embalagem 1 kg", unidade: "un", custoUnitario: 0.5 },
  });
  const insumoInativo = await prisma.insumo.create({
    data: { empresaId: fx.empresaId, nome: "Insumo inativo", unidade: "un", custoUnitario: 1, ativo: false },
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
    produtoPolpaFinoId: polpaFino.id,
    outraFrutaId: outraFruta.id,
    produtoFrutoOutraId: frutoOutra.id,
    produtoPolpaOutraId: polpaOutra.id,
    insumoId: insumo.id,
    insumoInativoId: insumoInativo.id,
  };
}

export type CadastrosDeVenda = {
  /** Sem classificação padrão; canal ATACADO, endereço "Rua A, 10", não retira. */
  clienteId: string;
  /** Classificação padrão FISCAL. */
  clienteFiscalId: string;
  /** Categoria RECEITA da filial A. */
  categoriaVendaId: string;
  contaCaixaId: string;
  contaCorrenteId: string;
};

/** Cliente, categoria de receita e contas (Caixa e corrente) da filial A, para a venda. */
export async function criarCadastrosDeVenda(fx: FixtureProducao): Promise<CadastrosDeVenda> {
  const cliente = await prisma.cliente.create({
    data: {
      empresaId: fx.empresaId,
      nome: "Cliente exemplo",
      canalVenda: "ATACADO",
      enderecoEntrega: "Rua A, 10",
      retiraNaPropriedade: false,
    },
  });
  const clienteFiscal = await prisma.cliente.create({
    data: { empresaId: fx.empresaId, nome: "Cliente fiscal", classificacaoFiscalPadrao: "FISCAL" },
  });
  const categoria = await prisma.categoriaFinanceira.create({
    data: { filialId: fx.filialAId, nome: "Venda de produtos", tipo: "RECEITA" },
  });
  const bancoCaixa = await obterBancoCaixa();
  const caixa = await prisma.contaBancaria.create({
    data: { filialId: fx.filialAId, bancoId: bancoCaixa.id, agencia: "-", conta: "Caixa teste", tipo: "CAIXA" },
  });
  const banco = await prisma.banco.create({ data: { codigo: `${fx.prefixoBanco}1`, nome: "Banco teste" } });
  const corrente = await prisma.contaBancaria.create({
    data: { filialId: fx.filialAId, bancoId: banco.id, agencia: "1", conta: "123-4" },
  });
  return {
    clienteId: cliente.id,
    clienteFiscalId: clienteFiscal.id,
    categoriaVendaId: categoria.id,
    contaCaixaId: caixa.id,
    contaCorrenteId: corrente.id,
  };
}

/** Configuração de vendas da filial A apontando para os cadastros de teste. */
export async function configurarVendas(fx: FixtureProducao, cad: CadastrosDeVenda) {
  const dados = {
    categoriaVendaId: cad.categoriaVendaId,
    contaRecebimentoPadraoId: cad.contaCorrenteId,
    contaCaixaPadraoId: cad.contaCaixaId,
  };
  await prisma.configuracaoProducao.upsert({
    where: { filialId: fx.filialAId },
    create: { filialId: fx.filialAId, ...dados },
    update: dados,
  });
}

/** Lote com entrada registrada pelo caminho real do estoque (kg 0 cria lote zerado, sem movimento). */
export async function criarLoteDeTeste(
  fx: FixtureProducao,
  opcoes: {
    produtoId: string;
    localId: string;
    kg: number;
    custoKg?: number;
    data?: Date;
    validade?: Date;
    codigo?: string;
    /** Padrão: filial A. */
    filialId?: string;
  },
) {
  const data = opcoes.data ?? new Date("2026-11-09");
  const filialId = opcoes.filialId ?? fx.filialAId;
  return prisma.$transaction(async (tx) => {
    const lote = await tx.lote.create({
      data: {
        filialId,
        codigo: opcoes.codigo ?? `T-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
        produtoId: opcoes.produtoId,
        origem: "RECEPCAO",
        data,
        validade: opcoes.validade ?? new Date(data.getTime() + 86_400_000),
        localId: opcoes.localId,
        quantidadeInicialKg: opcoes.kg,
        saldoKg: 0,
        custoKg: opcoes.custoKg ?? 0,
      },
    });
    if (opcoes.kg > 0) {
      await registrarMovimento(tx, {
        filialId,
        loteId: lote.id,
        data,
        tipo: "ENTRADA",
        quantidadeKg: opcoes.kg,
        usuarioId: fx.usuarioId,
      });
    }
    return tx.lote.findUniqueOrThrow({ where: { id: lote.id } });
  });
}
