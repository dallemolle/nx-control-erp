import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import type { ALVOS } from "./alvos";
import { CITADOS } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE = "Quem vê: todos os perfis. O relatório mostra só a filial atual.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "periodo-graficos",
    titulo: "Escolher o período e ler os gráficos",
    quandoUsar: "Para ver, num relance, por onde a polpa está saindo e quem são os maiores compradores do período.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "vendas",
        alvo: "vendas.periodo",
        instrucao: "Escolha o período",
        explicacao:
          "Abre no mês atual. Entram os itens dos pedidos confirmados com data no período; pedidos cancelados ficam " +
          "de fora.",
      },
      {
        cena: "vendas",
        alvo: "vendas.atalhos",
        instrucao: "Ou use um atalho",
        explicacao: "Mês atual, Mês anterior ou o Ano, contados a partir de hoje.",
      },
      {
        cena: "vendas",
        alvo: "vendas.graficoCanal",
        instrucao: "Faturamento por canal",
        explicacao:
          "O canal vem do pedido (batedor, atacado, varejo…). No exemplo, os pontos de açaí respondem por " +
          `${CITADOS.batedor} do faturamento.`,
      },
      {
        cena: "vendas",
        alvo: "vendas.graficoClientes",
        instrucao: "Os dez clientes que mais compraram",
        explicacao: "Em ordem de faturamento no período. Cliente sem compra no período não entra no gráfico.",
      },
    ],
    eDepois: {
      texto: "Os gráficos só aparecem quando há venda no período.",
      proximoRoteiro: "ler-tabelas",
    },
  }),

  roteiro({
    id: "ler-tabelas",
    titulo: "Ler as tabelas",
    quandoUsar: "Para os números de cada cliente, produto, canal e forma de pagamento, e para a cobrança.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "vendas",
        alvo: "tab.clientes",
        instrucao: "Vendas por cliente",
        explicacao:
          "Todos os clientes, do que mais faturou para o que menos, com kg, % do total, preço médio e margem. No " +
          `exemplo, o ${CITADOS.primeiro} lidera com ${CITADOS.percentualPrimeiro}.`,
      },
      {
        cena: "vendas",
        alvo: "tab.clientes",
        instrucao: "Canal principal e a receber",
        explicacao:
          "O canal principal é o que mais faturou com aquele cliente no período. O a receber é o saldo de hoje das " +
          "parcelas em aberto dos pedidos dele, de qualquer data: não muda com o período.",
      },
      {
        cena: "vendas",
        alvo: "tab.semCompra",
        instrucao: "Quem não comprou mas deve",
        explicacao:
          "Clientes sem compra no período e com saldo em aberto aparecem no fim da lista, para a cobrança. No " +
          "exemplo, o Mercadinho São João ainda deve R$ 450,00 de um pedido de outubro.",
      },
      {
        cena: "vendas",
        alvo: "tab.produtos",
        instrucao: "Por produto",
        explicacao:
          "Kg, faturamento, preço médio, custo médio (o custo gravado em cada item do pedido) e a margem de cada " +
          "produto.",
      },
      {
        cena: "vendas",
        alvo: "tab.canais",
        instrucao: "Por canal",
        explicacao: "Kg, faturamento e participação de cada canal. Pedidos sem canal aparecem como “Sem canal”.",
      },
      {
        cena: "vendas",
        alvo: "tab.formas",
        instrucao: "Por forma de pagamento",
        explicacao:
          "O faturamento do período e o que falta receber hoje em cada forma. No exemplo, " +
          `${formatarMoeda(CITADOS.aReceber)} a prazo: a Sorveteria Polar e o Mercadinho.`,
      },
    ],
    eDepois: {
      texto:
        "O total do relatório bate com as vendas do Painel de produção no mesmo período; o a receber é o mesmo do " +
        "Painel.",
      proximoRoteiro: "exportar-vendas",
    },
  }),

  roteiro({
    id: "exportar-vendas",
    titulo: "Exportar o relatório",
    quandoUsar: "Para mandar à equipe de vendas ou de cobrança, ou analisar numa planilha.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "vendas",
        alvo: "vendas.exportar",
        instrucao: "PDF, CSV ou Excel",
        explicacao:
          "O PDF traz as tabelas do período. CSV e Excel trazem todas as tabelas numa planilha só, uma linha por " +
          "cliente, produto, canal e forma, com as colunas Seção e Item: filtre pela Seção para separar.",
      },
    ],
    eDepois: {
      texto: "O arquivo usa o período que está na tela, e o a receber da data de hoje.",
    },
  }),
];
