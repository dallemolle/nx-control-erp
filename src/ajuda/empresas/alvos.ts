/**
 * Alvos que cada cena desenha. Os roteiros só podem apontar para estes (ver `construtorDeRoteiros`).
 * Estado: `lista.boa-vista` = "sim" depois de salva; `lista.rio-para` = status da Polpas Rio Pará (Ativa ou Inativa);
 * `form.aprovacao` = "nao" quando desmarcada; `tema.primaria` = a cor primária em edição; `tema.salvar` = "sim" depois
 * de salvar.
 */
export const ALVOS = {
  lista: [
    "lista.nova",
    "lista.tabela",
    "lista.boa-vista",
    "lista.editar-boa-vista",
    "lista.demonstracao",
    "lista.rio-para",
    "lista.inativar-rio-para",
    "lista.tema-demonstracao",
  ],
  nova: ["form.razao", "form.fantasia", "form.cnpj", "form.moeda", "form.aprovacao", "form.salvar"],
  editar: ["form.razao", "form.aprovacao", "form.salvar"],
  tema: [
    "tema.nome",
    "tema.modo",
    "tema.essenciais",
    "tema.primaria",
    "tema.selo",
    "tema.opcional",
    "tema.fontes",
    "tema.previa",
    "tema.resumo",
    "tema.salvar",
    "tema.importar",
    "tema.exportar",
  ],
  marca: ["marca.logo", "marca.logo-escuro", "marca.favicon", "marca.salvar"],
} as const;
