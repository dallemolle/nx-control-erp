import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { CITADOS } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE = "Quem vê: todos os perfis. O relatório mostra só a filial atual.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "por-origem",
    titulo: "Ver de onde veio o fruto",
    quandoUsar:
      "Para saber quanto cada fornecedor e cada talhão entregou no período, quanto foi pago e com que descarte.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "origem",
        alvo: "origem.periodo",
        instrucao: "Escolha o período",
        explicacao:
          "Abre no mês atual. Entram as recepções do período, pelo peso líquido (bruto − descarte); recepções " +
          "excluídas ficam de fora.",
      },
      {
        cena: "origem",
        alvo: "origem.atalhos",
        instrucao: "Ou use um atalho",
        explicacao: "Mês atual, Mês anterior ou o Ano, contados a partir de hoje.",
      },
      {
        cena: "origem",
        alvo: "origem.grafico",
        instrucao: "As dez origens que mais entregaram",
        explicacao: "Fornecedores e talhões juntos, pelo kg líquido do período.",
      },
      {
        cena: "origem",
        alvo: "tab.origem",
        instrucao: "A tabela por origem",
        explicacao:
          "Uma linha por fornecedor e por talhão, do que mais entregou para o que menos, com o kg de cada fruta e " +
          `o total. No exemplo, ${CITADOS.totalKg} kg em novembro: o mesmo “fruto recebido” do Painel.`,
      },
      {
        cena: "origem",
        alvo: "tab.jose",
        instrucao: "Valor pago, preço médio, descarte e cargas",
        explicacao:
          `O José da Silva entregou ${CITADOS.joseKg} kg em ${CITADOS.joseCargas} cargas. O preço médio é o valor ` +
          "pago dividido pelo kg líquido; o descarte, pelo peso bruto. Um descarte alto é assunto para conversar " +
          "com o fornecedor.",
      },
      {
        cena: "origem",
        alvo: "tab.talhao",
        instrucao: "Nos talhões, valor e preço ficam “—”",
        explicacao:
          "O fruto próprio entra no estoque pelo custo-padrão da fruta, não por um pagamento: não há valor pago a " +
          "mostrar.",
      },
    ],
    eDepois: {
      texto: "O que foi pago de fato aos produtores está em Contas a pagar: cada compra gerou a sua conta.",
      proximoRoteiro: "produtividade",
    },
  }),

  roteiro({
    id: "produtividade",
    titulo: "Ver a produtividade dos talhões",
    quandoUsar: "Para comparar os talhões da fazenda: quanto cada um colheu no ano e quantas toneladas por hectare.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "origem",
        alvo: "tab.produtividade",
        instrucao: "Produtividade no ano",
        explicacao:
          "O ano é o da data “Até” do período: com novembro de 2026, o ano é 2026. A tabela mostra a área, o kg " +
          "colhido no período e no ano, as toneladas por hectare no ano e o nº de colheitas.",
      },
      {
        cena: "origem",
        alvo: "tab.produtividade",
        instrucao: "Como sai o t/ha",
        explicacao:
          `Kg líquido do ano ÷ 1.000 ÷ área. O Talhão 3 – Várzea deu ${CITADOS.produtividadeT3} t/ha até agora. O ` +
          "total não tem t/ha porque mistura frutas diferentes.",
      },
      {
        cena: "origem",
        alvo: "tab.semColheita",
        instrucao: "Talhão sem colheita também aparece",
        explicacao:
          "Todo talhão ativo entra, mesmo sem colheita (com 0). Os inativos só aparecem se tiveram colheita no ano.",
      },
    ],
    eDepois: {
      texto: "A área de cada talhão vem do cadastro (Cadastros → Talhões): sem área, não há t/ha.",
      proximoRoteiro: "preco-exportar",
    },
  }),

  roteiro({
    id: "preco-exportar",
    titulo: "Ver o preço pago a terceiros e exportar",
    quandoUsar: "Para acompanhar o preço do fruto comprado ao longo do ano e levar os números para uma planilha.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "origem",
        alvo: "tab.preco",
        instrucao: "Preço médio pago por mês",
        explicacao:
          "Quanto foi pago por kg líquido de cada fruta comprada, mês a mês, e no ano (o ano da data “Até”). Mês " +
          `sem compra fica “—”. No exemplo, o açaí saiu a R$ ${CITADOS.precoAcaiAno}/kg no ano.`,
      },
      {
        cena: "origem",
        alvo: "origem.exportar",
        instrucao: "Exporte",
        explicacao:
          "O PDF traz as três tabelas. CSV e Excel trazem tudo numa planilha só, uma linha por origem, talhão e " +
          "mês, com a coluna Seção (Origem, Produtividade, Preço a terceiros) para filtrar.",
      },
    ],
    eDepois: {
      texto: "O arquivo usa o período que está na tela.",
    },
  }),
];
