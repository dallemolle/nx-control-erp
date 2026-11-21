/** Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`). */
export const ALVOS = {
  rastreio: [
    "busca.campo",
    "busca.rastrear",
    "busca.lista",
    "lote.cartao",
    "lote.cancelados",
    "lote.etiqueta",
    "lote.exportar",
    "familia.cartao",
    "origem.recepcao",
    "origem.op",
    "origem.frutos",
    "frente.cartao",
    "frente.polpas",
    "destino.cartao",
    "clientes.cartao",
    "clientes.resumo",
    "clientes.cancelado",
  ],
} as const;
