import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import type { ALVOS } from "./alvos";
import { A_RECEBER, CITADOS } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE = "Quem vê: todos os perfis. O painel mostra só a filial atual.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "recepcao-processamento",
    titulo: "Ler a recepção e o processamento do período",
    quandoUsar:
      "Para acompanhar quanto fruto entrou, de onde, quanto virou polpa e a que custo, no mês ou em outro período.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.periodo",
        instrucao: "Escolha o período",
        explicacao:
          "Abre no mês atual. Recepções, OPs e vendas contam pela data delas dentro do período; pedidos, recepções " +
          "e OPs cancelados ficam de fora.",
      },
      {
        cena: "painel",
        alvo: "painel.atalhos",
        instrucao: "Ou use um atalho",
        explicacao: "Mês atual, Mês anterior ou o Ano inteiro, contados a partir de hoje.",
      },
      {
        cena: "painel",
        alvo: "rec.recebido",
        instrucao: "Fruto recebido",
        explicacao:
          "O peso líquido (bruto menos descarte) de todas as recepções do período, com uma linha por fruta. No " +
          `exemplo, ${CITADOS.recebido} em novembro.`,
      },
      {
        cena: "painel",
        alvo: "rec.terceiros",
        instrucao: "De terceiros",
        explicacao:
          "Quanto do fruto recebido foi comprado (o resto é colheita própria). No exemplo, " +
          `${CITADOS.terceiros}: o José da Silva e a Cooperativa Vale Verde.`,
      },
      {
        cena: "painel",
        alvo: "rec.descarte",
        instrucao: "Descarte na triagem",
        explicacao: `O descarte dividido pelo peso bruto: ${CITADOS.descarte} no exemplo. Subiu? Vale olhar o fornecedor.`,
      },
      {
        cena: "painel",
        alvo: "rec.ops",
        instrucao: "OPs, fruto processado e polpa",
        explicacao:
          `${CITADOS.ops} OPs no mês, ${CITADOS.processado} de fruto e ${CITADOS.polpa} de polpa. OP aberta já ` +
          "entra nesses números.",
      },
      {
        cena: "painel",
        alvo: "rec.rendimento",
        instrucao: "Rendimento",
        explicacao: `Polpa ÷ fruto processado: ${CITADOS.rendimento} no mês, com uma linha por fruta.`,
      },
      {
        cena: "painel",
        alvo: "rec.custo",
        instrucao: "Custo médio da polpa",
        explicacao:
          `Custo das OPs ÷ kg de polpa: ${CITADOS.custoMedio}. Usa só OPs encerradas, que já têm o custo gravado; ` +
          "OP aberta fica fora desta conta.",
      },
    ],
    eDepois: {
      texto: "O detalhe por fornecedor e por talhão está no Relatório de origem; o de cada OP, no de processamento.",
      proximoRoteiro: "vendas-estoque",
    },
  }),

  roteiro({
    id: "vendas-estoque",
    titulo: "Ler as vendas e o estoque",
    quandoUsar: "Para ver o resultado das vendas do período e a posição de hoje do estoque e do que falta receber.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "ven.faturamento",
        instrucao: "Faturamento",
        explicacao:
          "Os itens dos pedidos confirmados do período, separados em fruto in natura e polpa de cada fruta. No " +
          `exemplo, ${formatarMoeda(CITADOS.faturamento)}, todo de polpa de açaí.`,
      },
      {
        cena: "painel",
        alvo: "ven.kg",
        instrucao: "Kg vendidos e preço médio",
        explicacao: `${CITADOS.kgVendidos} vendidos a ${CITADOS.precoMedio} em média (faturamento ÷ kg).`,
      },
      {
        cena: "painel",
        alvo: "ven.pedidos",
        instrucao: "Pedidos e ticket médio",
        explicacao: `Faturamento ÷ nº de pedidos: ${formatarMoeda(CITADOS.ticket)} por pedido no exemplo.`,
      },
      {
        cena: "painel",
        alvo: "ven.margem",
        instrucao: "Margem bruta",
        explicacao:
          "Faturamento menos o custo dos lotes vendidos (o custo gravado em cada item do pedido). No exemplo, " +
          `${formatarMoeda(CITADOS.margem)}, ${CITADOS.margemPercentual} do faturamento.`,
      },
      {
        cena: "painel",
        alvo: "ven.aReceber",
        instrucao: "A receber em aberto: a posição de hoje",
        explicacao:
          "O saldo das parcelas ainda não pagas dos pedidos, de qualquer data: não muda com o período. No exemplo, " +
          `${formatarMoeda(A_RECEBER)}: o pedido 131, da Sorveteria Polar, e o resto de um pedido de outubro do ` +
          "Mercadinho São João.",
      },
      {
        cena: "painel",
        alvo: "est.polpa",
        instrucao: "Estoque de polpa, hoje",
        explicacao: `Todos os lotes de polpa com saldo, vencidos inclusive: ${CITADOS.polpaEstoque} no exemplo.`,
      },
      {
        cena: "painel",
        alvo: "est.fruto",
        instrucao: "Fruto aguardando",
        explicacao:
          "Fruto com saldo e dentro da validade, esperando OP. O vencido não conta: no exemplo, a acerola que " +
          "sobrou venceu, e o cartão mostra 0 kg.",
      },
      {
        cena: "painel",
        alvo: "est.valor",
        instrucao: "Valor do estoque",
        explicacao: `Saldo × custo de cada lote, vencidos inclusive: ${formatarMoeda(CITADOS.valorEstoque)}.`,
      },
      {
        cena: "painel",
        alvo: "tab.vendas",
        instrucao: "As tabelas por produto",
        explicacao:
          "À esquerda, o estoque de hoje por produto, com saldo e valor; à direita, as vendas do período por " +
          "produto, da que mais faturou para a que menos.",
      },
    ],
    eDepois: {
      texto: "O detalhe das vendas por cliente, canal e forma de pagamento está no Relatório de vendas.",
      proximoRoteiro: "alertas-exportar",
    },
  }),

  roteiro({
    id: "alertas-exportar",
    titulo: "Usar os alertas e exportar o painel",
    quandoUsar: "Todo dia, para ver o que precisa de atenção, e no fechamento do mês, para guardar o painel.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "alerta.vencidos",
        instrucao: "Alerta destacado: clique para ver a lista",
        explicacao:
          "Com ocorrência, o cartão fica com a borda laranja e abre a lista já filtrada. Vencendo e vencidos abrem o " +
          `Estoque. No exemplo, ${CITADOS.vencidos} lotes vencidos (${CITADOS.vencidosKg}): o açaí resfriado e a ` +
          "acerola.",
        dica: "Vencido ainda aproveitável: libere no Estoque. Senão, dê baixa em Ajustes de estoque com o motivo Vencido.",
      },
      {
        cena: "painel",
        alvo: "alerta.entregas",
        instrucao: "Entregas",
        explicacao:
          "Pendentes ou em rota, e com atraso: abrem a tela de Entregas. É a posição de hoje. No exemplo, o pedido " +
          "131 está em rota.",
      },
      {
        cena: "painel",
        alvo: "alerta.opsBalanco",
        instrucao: "OPs a verificar",
        explicacao:
          "OPs do período com o balanço ou o branqueamento fora do limite; abrem o Processamento já filtrado. No " +
          "exemplo, a OP de acerola do dia 19.",
        dica:
          "OP recém-aberta, ainda sem fruto, polpa e processo, também conta como balanço a verificar até ser " +
          "preenchida.",
      },
      {
        cena: "painel",
        alvo: "painel.exportar",
        instrucao: "Exporte",
        explicacao:
          "O PDF traz o painel do período escolhido. CSV e Excel trazem uma planilha com um indicador por linha, boa " +
          "para comparar meses.",
      },
    ],
    eDepois: {
      texto: "Cartão sem ocorrência fica neutro e não é clicável.",
    },
  }),
];
