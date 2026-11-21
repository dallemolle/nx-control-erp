import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { CITADOS } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE = "Quem vê: todos os perfis. O relatório mostra só a filial atual.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "resumo-fruta",
    titulo: "Ler o resumo por fruta",
    quandoUsar: "Para comparar o rendimento e o custo da polpa de cada fruta no período.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "processamento",
        alvo: "proc.periodo",
        instrucao: "Escolha o período",
        explicacao: "Abre no mês atual, pela data da OP. OPs canceladas ficam de fora.",
      },
      {
        cena: "processamento",
        alvo: "proc.atalhos",
        instrucao: "Ou use um atalho",
        explicacao: "Mês atual, Mês anterior ou o Ano, contados a partir de hoje.",
      },
      {
        cena: "processamento",
        alvo: "tab.resumo",
        instrucao: "OPs, fruto, polpa e rendimento médio",
        explicacao:
          "Contam OPs abertas e encerradas: são os mesmos números do Painel. No exemplo, " +
          `${CITADOS.fruto} kg de fruto viraram ${CITADOS.polpa} kg de polpa, rendimento de ${CITADOS.rendimento}.`,
      },
      {
        cena: "processamento",
        alvo: "tab.resumo",
        instrucao: "Mínimo, máximo e custo: só OPs encerradas",
        explicacao:
          "Uma OP ainda aberta pode ter o fruto lançado e a polpa não, e o custo dela muda até encerrar: por isso " +
          `fica fora dessas colunas. No açaí, o rendimento variou de ${CITADOS.acaiMin} a ${CITADOS.acaiMax}.`,
        dica: "Rendimento mínimo muito abaixo do médio? Abra a OP e confira os pesos lançados.",
      },
    ],
    eDepois: {
      texto: "Para ver OP por OP, use o link “Ver as OPs do período”.",
      proximoRoteiro: "balanco-custo",
    },
  }),

  roteiro({
    id: "balanco-custo",
    titulo: "Ler o balanço de massa e o custo",
    quandoUsar: "Para conferir se as bateladas fecham (o que entrou contra o que saiu) e quanto custou a polpa.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "processamento",
        alvo: "tab.balanco",
        instrucao: "Balanço de massa por fruta",
        explicacao:
          "Soma as OPs encerradas: fruto + água (1 L = 1 kg) − polpa − caroço − perda. A diferença em % é sobre o que " +
          `entrou (fruto + água). No total, ${CITADOS.totalDiferenca}.`,
      },
      {
        cena: "processamento",
        alvo: "tab.acerola",
        instrucao: "A coluna “A verificar”",
        explicacao:
          "Quantas OPs ficaram com o balanço fora da tolerância da configuração. No exemplo, a OP de acerola: " +
          `diferença de ${CITADOS.aceroladiferenca}, provavelmente caroço ou perda lançados a menos.`,
      },
      {
        cena: "processamento",
        alvo: "tab.custo",
        instrucao: "Custo por fruta",
        explicacao:
          "Custo do fruto, dos insumos e o total das OPs encerradas, com o custo por kg de polpa. No total, " +
          `R$ ${CITADOS.custoKg}/kg, o mesmo custo médio do Painel.`,
      },
    ],
    eDepois: {
      texto:
        "O custo de cada polpa (grossa, média…) sai do rateio pelo preço de referência, feito no encerramento de cada " +
        "OP; aqui aparece o custo médio da fruta.",
      proximoRoteiro: "ops-exportar",
    },
  }),

  roteiro({
    id: "ops-exportar",
    titulo: "Ver as OPs e exportar",
    quandoUsar: "Para ir do resumo ao detalhe de cada OP, ou levar os números para uma planilha.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "processamento",
        alvo: "proc.verOps",
        instrucao: "“Ver as OPs do período”",
        explicacao:
          "Abre a tela Processamento já filtrada pelo mesmo período. Lá, o filtro “A verificar” mostra só as OPs com " +
          "balanço ou branqueamento fora do limite.",
      },
      {
        cena: "processamento",
        alvo: "proc.exportar",
        instrucao: "Exporte",
        explicacao:
          "O PDF traz as três tabelas. CSV e Excel trazem tudo numa planilha só, com a coluna Seção (Resumo, " +
          "Balanço de massa, Custo) para filtrar.",
      },
    ],
    eDepois: {
      texto: "O arquivo usa o período que está na tela.",
    },
  }),
];
