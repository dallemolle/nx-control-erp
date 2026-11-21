/**
 * Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`).
 * Guardam estado: `lista.pague` = "sim" quando a Pague Norte já foi salva; `form.parcelado` = quantas faixas do
 * parcelado ela já tem ("1" ou "2"); `form.taxaDebito` = a taxa do débito da Cartões Rurais; `lista.porto` = o
 * status da Maquininha do Porto (Ativa ou Inativa); `form.condicoes` = "sim" quando as condições da nova já foram
 * preenchidas. A cena `editar` abre a operadora em `editar.operadora` (pague ou rurais).
 */
export const ALVOS = {
  lista: [
    "lista.nova",
    "lista.tabela",
    "lista.pague",
    "lista.condicoesPague",
    "lista.editarPague",
    "lista.condicoesRurais",
    "lista.editarRurais",
    "lista.porto",
    "lista.inativar",
  ],
  nova: ["form.nome", "form.cnpj", "form.conta", "form.categoria", "form.condicoes", "form.adicionar", "form.salvar"],
  editar: ["editar.operadora", "form.adicionar", "form.parcelado", "form.antecipado", "form.taxaDebito", "form.salvar"],
} as const;
