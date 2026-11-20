import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import type { ALVOS } from "./alvos";
import { ANO, CITADOS } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE = "Quem vê: todos os perfis. O relatório mostra só a filial atual.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "ver-ano",
    titulo: "Ver o ano mês a mês",
    quandoUsar:
      "Para acompanhar a safra: quanto fruto entrou, quanto foi processado e vendido em cada mês, e como andaram o " +
      "faturamento e a margem.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "mensal",
        alvo: "mensal.ano",
        instrucao: "Escolha o ano pelas setas",
        explicacao: `Abre no ano atual. As setas vão para o ano anterior e o seguinte. No exemplo, ${ANO}.`,
      },
      {
        cena: "mensal",
        alvo: "mensal.graficoVolumes",
        instrucao: "Recebido × processado × vendido",
        explicacao:
          "Três barras por mês, em kg: o fruto recebido (líquido), o fruto que entrou em OP e o que foi vendido. " +
          "No exemplo, a safra de açaí aparece de setembro a novembro.",
      },
      {
        cena: "mensal",
        alvo: "mensal.graficoFaturamento",
        instrucao: "Faturamento e margem",
        explicacao:
          "O faturamento de cada mês e a margem bruta em %. Na tela, a margem é uma linha com escala própria, à " +
          "direita; passe o mouse para ver os valores.",
      },
      {
        cena: "mensal",
        alvo: "mensal.ano",
        instrucao: "Ano sem movimento",
        explicacao:
          `Sem recepção, OP, venda ou polpa no ano, a tela mostra só “Nada no ano.” No exemplo, ${ANO - 1}.`,
        preenche: { "mensal.ano": String(ANO - 1) },
      },
    ],
    eDepois: {
      texto:
        "As regras são as do Painel: cancelados ficam fora, OP aberta entra no volume e o custo da polpa vem só de " +
        "OPs encerradas.",
      proximoRoteiro: "ler-tabelas",
    },
  }),

  roteiro({
    id: "ler-tabelas",
    titulo: "Ler as tabelas",
    quandoUsar: "Para os números exatos de cada mês, separados por fruta.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "mensal",
        alvo: "tab.Recepção",
        instrucao: "Recepção",
        explicacao:
          "O fruto recebido (peso líquido) de cada fruta, separado em próprio e de terceiros, e o total. Só aparecem " +
          "as frutas que tiveram movimento no ano.",
      },
      {
        cena: "mensal",
        alvo: "tab.novembro",
        instrucao: "Cada linha é um mês",
        explicacao:
          `Novembro bate com o Painel de produção daquele mês: ${CITADOS.novembroRecebido} kg recebidos e ` +
          `${formatarMoeda(CITADOS.novembroFaturamento)} de faturamento. Os dois usam a mesma conta.`,
      },
      {
        cena: "mensal",
        alvo: "tab.total",
        instrucao: "A linha Total é o ano",
        explicacao:
          `Soma o ano inteiro: ${CITADOS.totalRecebido} kg recebidos no exemplo. Percentuais e médias do total são ` +
          "recalculados sobre o ano, não somados mês a mês.",
      },
      {
        cena: "mensal",
        alvo: "tab.Processamento",
        instrucao: "Processamento",
        explicacao:
          "Fruto processado, polpa produzida e rendimento de cada fruta, e o nº de OPs. No exemplo, o açaí rendeu " +
          `${CITADOS.rendimentoAcai} no ano.`,
      },
      {
        cena: "mensal",
        alvo: "tab.Vendas",
        instrucao: "Vendas",
        explicacao:
          "Faturamento de fruto in natura, de polpa de cada fruta e o total, kg vendidos e a margem bruta em R$ e em " +
          `%. No exemplo, ${formatarMoeda(CITADOS.totalFaturamento)} no ano.`,
      },
      {
        cena: "mensal",
        alvo: "tab.Custos",
        instrucao: "Custos",
        explicacao:
          "O custo por kg da polpa de cada fruta (só OPs encerradas) e quanto foi pago a terceiros pelo fruto " +
          `comprado: ${formatarMoeda(CITADOS.pagoTerceiros)} no ano do exemplo.`,
        dica:
          "“Pago a terceiros” é o valor das recepções compradas, não o que já saiu do caixa: os pagamentos ficam em " +
          "Contas a pagar.",
      },
      {
        cena: "mensal",
        alvo: "tab.polpa",
        instrucao: "Polpa produzida por produto",
        explicacao: "Os kg de cada polpa, mês a mês, pela data da OP. Mostra o mix de produtos ao longo da safra.",
      },
    ],
    eDepois: {
      texto: "Para o detalhe de um período (clientes, fornecedores, OPs), use os outros relatórios da Produção.",
      proximoRoteiro: "exportar-mensal",
    },
  }),

  roteiro({
    id: "exportar-mensal",
    titulo: "Exportar o relatório",
    quandoUsar: "Para guardar o fechamento do ano, mandar à contabilidade ou montar análises numa planilha.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "mensal",
        alvo: "mensal.exportar",
        instrucao: "PDF, CSV ou Excel",
        explicacao:
          "O PDF traz as tabelas do ano escolhido. CSV e Excel trazem um indicador por linha, com as colunas Bloco, " +
          "Indicador, Fruta, Mês e Valor: pronto para tabela dinâmica.",
      },
    ],
    eDepois: {
      texto: "O arquivo é sempre do ano que está na tela.",
    },
  }),
];
