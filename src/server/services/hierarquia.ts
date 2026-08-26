export type ItemHierarquico = { id: string; parentId: string | null };

export class CicloHierarquiaError extends Error {
  constructor() {
    super("A hierarquia não pode formar um ciclo (um item não pode ser seu próprio ancestral)");
    this.name = "CicloHierarquiaError";
  }
}

export function assertSemCiclo(
  itens: ItemHierarquico[],
  id: string,
  novoParentId: string | null,
): void {
  if (novoParentId === null) return;

  const parentPorId = new Map(itens.map((item) => [item.id, item.parentId]));

  let atual: string | null = novoParentId;
  while (atual !== null) {
    if (atual === id) {
      throw new CicloHierarquiaError();
    }
    atual = parentPorId.get(atual) ?? null;
  }
}
