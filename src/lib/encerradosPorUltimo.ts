/**
 * Safra ou projeto Encerrado continua aceito em título e lançamento (nota e venda chegam depois da colheita), mas
 * aparece marcado e depois dos abertos, para não ser escolhido por engano. A ordem de entrada vale dentro de cada
 * grupo.
 */
export function encerradosPorUltimo<T extends { nome: string; status: string }>(
  lista: readonly T[],
  marca: "encerrada" | "encerrado",
): T[] {
  const encerrado = (item: T) => item.status === "ENCERRADO";
  return [
    ...lista.filter((item) => !encerrado(item)),
    ...lista.filter(encerrado).map((item) => ({ ...item, nome: `${item.nome} (${marca})` })),
  ];
}
