/**
 * Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`).
 * Três guardam estado da lista: `lista.sicredi` e `lista.escritorio` = "sim" quando a conta já foi salva, e
 * `lista.santander` = o status da conta do Santander (Ativo ou Inativo).
 */
export const ALVOS = {
  lista: [
    "lista.nova",
    "lista.tabela",
    "lista.sicredi",
    "lista.escritorio",
    "lista.editar",
    "lista.santander",
    "lista.inativar",
  ],
  nova: ["form.tipo", "form.banco", "form.agencia", "form.conta", "form.moeda", "form.saldo", "form.salvar"],
  editar: ["form.tipo", "form.saldo", "form.erro", "form.salvar"],
} as const;
