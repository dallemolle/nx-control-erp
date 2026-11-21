/**
 * Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`).
 * Três guardam estado da lista: `lista.polar` e `lista.diversos` = "sim" quando o cliente já foi salvo, e
 * `lista.tucuma` = o status da Lanchonete Tucumã (Ativo ou Inativo).
 */
export const ALVOS = {
  lista: [
    "lista.novo",
    "lista.tabela",
    "lista.polar",
    "lista.diversos",
    "lista.editar",
    "lista.tucuma",
    "lista.inativar",
  ],
  novo: [
    "form.nome",
    "form.cnpj",
    "form.contato",
    "form.telefone",
    "form.classificacao",
    "form.canal",
    "form.municipio",
    "form.endereco",
    "form.retira",
    "form.tipo",
    "form.salvar",
  ],
  editar: ["form.tipo", "form.tipoChave", "form.chave", "form.salvar"],
} as const;
