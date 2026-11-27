import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE = "Quem vê: perfis Administrador, Financeiro, Tesouraria, Gestor, Auditor e Consulta.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "ler-por-dimensao",
    titulo: "Ver quanto entrou e saiu em cada centro de custo",
    quandoUsar:
      "Para responder perguntas como “quanto a Lavoura gastou em novembro?” em vez de “quanto a fazenda inteira " +
      "gastou?”. Serve para centro de custo, centro de lucro, safra ou projeto.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.dimensao",
        instrucao: "Escolha a dimensão",
        explicacao:
          "Centro de custo, Centro de lucro, Safra ou Projeto. A tabela mostra uma linha para cada valor ativo " +
          "dessa dimensão na filial, em ordem alfabética, e uma linha “Não classificado” no fim.",
      },
      {
        cena: "painel",
        alvo: "painel.periodo",
        instrucao: "Escolha o ano e o mês",
        explicacao: "A tela mostra um mês por vez, da filial atual.",
      },
      {
        cena: "painel",
        alvo: "cab.realizadas",
        instrucao: "Entradas e saídas realizadas",
        explicacao:
          "O que já entrou e saiu, conciliado, pela data do lançamento no banco. Cada lançamento vai para a " +
          "dimensão marcada nele; o lançamento de uma baixa leva a dimensão do título que foi pago ou recebido. " +
          "Dinheiro em conta Caixa já entra conciliado.",
        dica: "Pagamento ainda não conciliado não aparece aqui: concilie o extrato antes de analisar o mês.",
      },
      {
        cena: "painel",
        alvo: "cab.projetadas",
        instrucao: "Entradas e saídas projetadas",
        explicacao:
          "O saldo das parcelas em aberto que vencem no mês, na dimensão do título: contas a receber viram " +
          "entradas, contas a pagar viram saídas. Uma parcela vencida em outubro e não paga continua em outubro, " +
          "não passa para novembro.",
      },
      {
        cena: "painel",
        alvo: "cab.saldo",
        instrucao: "Resultado do mês naquela linha",
        explicacao:
          "É entradas menos saídas, somando o realizado e o projetado do mês. Não é o saldo do banco: é quanto " +
          "aquela parte do negócio deixou (ou vai deixar) de dinheiro no mês. Fica vermelho quando é negativo.",
      },
      {
        cena: "painel",
        alvo: "linha.lavoura",
        instrucao: "Leia a linha da Lavoura",
        explicacao:
          "R$ 1.100,00 já pagos (R$ 800,00 do adubo e R$ 300,00 da mão de obra) e R$ 1.000,00 da parcela do " +
          "adubo que vence no mês: resultado de −R$ 2.100,00.",
        dica:
          "Centro de custo com pai (ex.: Escritório dentro de Administração) aparece recuado logo abaixo dele, " +
          "e a linha do pai soma os dois. A seta ao lado do nome recolhe os filhos.",
      },
    ],
    eDepois: {
      texto:
        "A linha Total, no fim da tabela, soma todas as linhas, inclusive a “Não classificado”: no exemplo, " +
        "R$ 24.774,10 de resultado no mês. É o número para conferir com o Fluxo de caixa do mês.",
      proximoRoteiro: "nao-classificado",
    },
  }),

  roteiro({
    id: "nao-classificado",
    titulo: "Entender o “Não classificado” e trocar de dimensão",
    quandoUsar:
      "Quando a linha “Não classificado” está grande, ou quando você quer ver o mesmo mês por outro ângulo " +
      "(por safra em vez de centro de custo).",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "linha.nao-classificado",
        instrucao: "“Não classificado”: o que não tem essa dimensão",
        explicacao:
          "Reúne tudo o que foi lançado sem a dimensão escolhida. No exemplo, as vendas de R$ 23.500,00 não " +
          "têm centro de custo e caem aqui. O saque de R$ 2.000,00 do banco para o Caixa não entra em nenhuma " +
          "linha: transferência entre contas só move saldo.",
        dica:
          "Para essa linha diminuir, preencha centro de custo, centro de lucro, safra ou projeto ao lançar " +
          "títulos (Contas a pagar e a receber) e lançamentos avulsos (Tesouraria e Conciliação). Os campos são " +
          "opcionais, por isso é fácil esquecer.",
      },
      {
        cena: "painel",
        alvo: "painel.dimensao",
        instrucao: "Troque a dimensão para Safra",
        explicacao: "A tabela é refeita com uma linha por safra ativa. É o mesmo dinheiro, cortado de outro jeito.",
        preenche: { "painel.dimensao": "Safra" },
      },
      {
        cena: "painel",
        alvo: "linha.safra-2025",
        instrucao: "Veja a safra 2025/26",
        explicacao:
          "O adubo e as vendas foram marcados com a safra 2025/26: R$ 27.500,00 de entradas contra R$ 1.800,00 " +
          "de saídas, resultado de R$ 25.700,00. A mão de obra foi para a 2026/27.",
        dica:
          "Cada dimensão é independente: o mesmo pagamento aparece na Lavoura (centro de custo) e na 2025/26 " +
          "(safra). Não some as visões entre si.",
      },
    ],
    eDepois: {
      texto:
        "Centro de custo, safra ou projeto desativado depois de usado continua aparecendo no mês em que tem " +
        "valores, com “(inativo)” no nome, para que nenhum valor suma da tela.",
      proximoRoteiro: "filtrar-exportar",
    },
  }),

  roteiro({
    id: "filtrar-exportar",
    titulo: "Filtrar por classificação e exportar",
    quandoUsar: "Para ver só o movimento com documento fiscal (ou só o gerencial), ou para levar a tabela para a planilha.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.classificacao",
        instrucao: "Filtre por Fiscal ou Gerencial, se precisar",
        explicacao: "Realizado e projetado passam a somar só o movimento daquela classificação.",
        preenche: { "painel.classificacao": "Fiscal" },
      },
      {
        cena: "painel",
        alvo: "painel.tabela",
        instrucao: "Veja o que mudou",
        explicacao:
          "Na visão Fiscal do exemplo, a Lavoura perde os R$ 300,00 do recibo da mão de obra (gerencial), e o " +
          "“Não classificado” perde a parte gerencial das vendas. O aviso acima da tabela lembra que a visão está " +
          "filtrada: o Total passa a ser só do movimento fiscal e não bate com o Fluxo de caixa em “Todos”.",
      },
      {
        cena: "painel",
        alvo: "painel.exportar",
        instrucao: "Exporte, se precisar de um arquivo",
        explicacao:
          "PDF, CSV ou Excel, com a mesma dimensão, o mesmo mês e o mesmo filtro da tela. Para outro mês, troque " +
          "o mês na tela e exporte de novo.",
      },
    ],
    eDepois: {
      texto: "Para voltar a ver tudo, escolha “Todos” no filtro.",
    },
  }),
];
