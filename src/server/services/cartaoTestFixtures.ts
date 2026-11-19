import { prisma } from "@/server/db/client";
import type { CondicaoCartao } from "@/lib/producao/cartao";
import type { CadastrosDeVenda, CatalogoDeTeste, FixtureProducao } from "./producaoTestFixtures";

export const CONDICOES_PADRAO: CondicaoCartao[] = [
  { modalidade: "DEBITO", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 1.5, prazoDias: 1, antecipado: false },
  { modalidade: "CREDITO_VISTA", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 2.5, prazoDias: 30, antecipado: false },
  { modalidade: "CREDITO_PARCELADO", parcelasDe: 2, parcelasAte: 6, taxaPercentual: 3, prazoDias: 30, antecipado: false },
  { modalidade: "PIX_MAQUININHA", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 0, prazoDias: 0, antecipado: false },
];

let sequencia = 0;

/** Operadora "Stone" na filial A, depositando na conta corrente, taxa na categoria de compra (DESPESA). */
export async function criarOperadoraDeTeste(
  fx: FixtureProducao,
  cat: CatalogoDeTeste,
  cad: CadastrosDeVenda,
  condicoes: CondicaoCartao[] = CONDICOES_PADRAO,
) {
  const sufixo = `${Date.now()}`.slice(-3) + String(++sequencia % 100).padStart(2, "0");
  const cnpj = `98.765.${sufixo.slice(0, 3)}/0001-${sufixo.slice(3, 5)}`;
  const fornecedor = await prisma.fornecedor.create({
    data: { empresaId: fx.empresaId, nome: `Stone ${sufixo}`, cnpjCpf: cnpj },
  });
  const cliente = await prisma.cliente.create({ data: { empresaId: fx.empresaId, nome: `Stone ${sufixo}`, cnpjCpf: cnpj } });
  const operadora = await prisma.operadoraCartao.create({
    data: {
      filialId: fx.filialAId,
      nome: `Stone ${sufixo}`,
      contaBancariaId: cad.contaCorrenteId,
      fornecedorId: fornecedor.id,
      clienteId: cliente.id,
      categoriaTaxaId: cat.categoriaCompraId,
      condicoes: { create: condicoes },
    },
  });
  return {
    id: operadora.id,
    nome: operadora.nome,
    clienteId: cliente.id,
    fornecedorId: fornecedor.id,
    contaId: cad.contaCorrenteId,
    categoriaTaxaId: cat.categoriaCompraId,
  };
}
