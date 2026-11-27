import { prisma } from "@/server/db/client";
import type { ClientePrisma } from "@/server/audit/registrar";

export type ReferenciasDoLancamento = {
  categoriaFinanceiraId: string | null;
  centroCustoId: string | null;
  centroLucroId: string | null;
  safraId: string | null;
  projetoId: string | null;
};

/**
 * Garante que a categoria e as dimensões de um título ou lançamento pertencem à
 * filial ativa e estão ativas. A FK só prova que a linha existe em *alguma*
 * filial — sem esta checagem um id colado à mão (formulário ou API) classificaria
 * o lançamento com o cadastro de outro tenant. Inativo não entra em lançamento
 * novo; na edição, o que o registro já tem (`atual`) pode ficar. Usada pelo
 * título, pelo lançamento manual e pelos lançamentos criados na conciliação.
 */
export async function validarReferenciasDoLancamento(
  filialId: string,
  referencias: ReferenciasDoLancamento,
  opcoes: { db?: ClientePrisma; atual?: Partial<ReferenciasDoLancamento> } = {},
): Promise<void> {
  const db = opcoes.db ?? prisma;
  const atual = opcoes.atual ?? {};
  const select = { ativo: true } as const;
  const buscas: [keyof ReferenciasDoLancamento, string, string, (id: string) => Promise<{ ativo: boolean } | null>][] = [
    ["categoriaFinanceiraId", "Categoria financeira", "inativa", (id) =>
      db.categoriaFinanceira.findFirst({ where: { id, filialId }, select }),
    ],
    ["centroCustoId", "Centro de custo", "inativo", (id) => db.centroCusto.findFirst({ where: { id, filialId }, select })],
    ["centroLucroId", "Centro de lucro", "inativo", (id) => db.centroLucro.findFirst({ where: { id, filialId }, select })],
    ["safraId", "Safra", "inativa", (id) => db.safra.findFirst({ where: { id, filialId }, select })],
    ["projetoId", "Projeto", "inativo", (id) => db.projeto.findFirst({ where: { id, filialId }, select })],
  ];

  for (const [campo, rotulo, inativo, buscar] of buscas) {
    const valor = referencias[campo];
    if (valor === null) continue;
    const registro = await buscar(valor);
    if (!registro) {
      throw new Error(`${rotulo} não pertence à filial ativa`);
    }
    if (!registro.ativo && valor !== atual[campo]) {
      throw new Error(`${rotulo} ${inativo}: escolha outra ou reative o cadastro`);
    }
  }
}
