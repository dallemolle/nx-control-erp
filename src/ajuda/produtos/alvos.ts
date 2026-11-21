/**
 * Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`).
 * Dois guardam estado da lista: `lista.agr` = "sim" quando a AGR já foi salva, e `lista.acr` = o status da ACR
 * (Ativo ou Inativo). A cena `editar` mostra o produto cujo código está em `editar.produto` (FA ou FC).
 */
export const ALVOS = {
  lista: ["lista.novo", "lista.tabela", "lista.agr", "lista.fa", "lista.fc", "lista.acr", "lista.inativar"],
  novo: [
    "form.codigo",
    "form.descricao",
    "form.categoria",
    "form.fruta",
    "form.conservacao",
    "form.validade",
    "form.preco",
    "form.armazenamento",
    "form.liberacao",
    "form.unidade",
    "form.etiqueta",
    "form.salvar",
  ],
  editar: [
    "editar.produto",
    "form.categoria",
    "form.validade",
    "form.preco",
    "form.liberacao",
    "form.unidade",
    "form.salvar",
  ],
} as const;
