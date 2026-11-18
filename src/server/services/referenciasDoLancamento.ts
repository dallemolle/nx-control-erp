import { prisma } from "@/server/db/client";

export type ReferenciasDoLancamento = {
  categoriaFinanceiraId: string | null;
  centroCustoId: string | null;
  centroLucroId: string | null;
  safraId: string | null;
  projetoId: string | null;
};

/**
 * Garante que a categoria e as dimensões de um lançamento avulso pertencem à
 * filial ativa. A FK só prova que a linha existe em *alguma* filial — sem esta
 * checagem um id colado à mão (formulário ou API) classificaria o lançamento
 * com o cadastro de outro tenant. Usada pelo lançamento manual e pelos
 * lançamentos criados na conciliação (da linha e da diferença do grupo).
 */
export async function validarReferenciasDoLancamento(
  filialId: string,
  referencias: ReferenciasDoLancamento,
): Promise<void> {
  const buscas: [string, string | null, (id: string) => Promise<unknown>][] = [
    ["Categoria financeira", referencias.categoriaFinanceiraId, (id) =>
      prisma.categoriaFinanceira.findFirst({ where: { id, filialId } }),
    ],
    ["Centro de custo", referencias.centroCustoId, (id) =>
      prisma.centroCusto.findFirst({ where: { id, filialId } }),
    ],
    ["Centro de lucro", referencias.centroLucroId, (id) =>
      prisma.centroLucro.findFirst({ where: { id, filialId } }),
    ],
    ["Safra", referencias.safraId, (id) => prisma.safra.findFirst({ where: { id, filialId } })],
    ["Projeto", referencias.projetoId, (id) => prisma.projeto.findFirst({ where: { id, filialId } })],
  ];

  for (const [rotulo, valor, buscar] of buscas) {
    if (valor === null) continue;
    if (!(await buscar(valor))) {
      throw new Error(`${rotulo} não pertence à filial ativa`);
    }
  }
}
