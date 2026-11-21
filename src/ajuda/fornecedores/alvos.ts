/**
 * Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`).
 * Três guardam estado da lista: `lista.embalagens` e `lista.raimundo` = "sim" quando o fornecedor já foi salvo, e
 * `lista.sitio` = o status do Sítio Boa Esperança (Ativo ou Inativo).
 */
export const ALVOS = {
  lista: [
    "lista.novo",
    "lista.tabela",
    "lista.embalagens",
    "lista.raimundo",
    "lista.editar",
    "lista.sitio",
    "lista.inativar",
  ],
  novo: [
    "form.nome",
    "form.cnpj",
    "form.contato",
    "form.telefone",
    "form.municipio",
    "form.classificacao",
    "form.tipo",
    "form.tipoChave",
    "form.chave",
    "form.banco",
    "form.agencia",
    "form.conta",
    "form.tipoConta",
    "form.titular",
    "form.salvar",
  ],
} as const;
