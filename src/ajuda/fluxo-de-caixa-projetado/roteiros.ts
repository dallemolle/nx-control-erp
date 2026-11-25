import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE =
  "Quem vê: os perfis com acesso aos títulos (Administrador, Financeiro, Tesouraria, Gestor, Auditor e " +
  "Consulta). A tela só consulta: não lança nada.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "ler-projecao",
    titulo: "Ler a projeção dos próximos meses",
    quandoUsar:
      "Para saber se vai faltar ou sobrar dinheiro nos próximos meses, a partir do que já está combinado: as " +
      "contas a pagar e a receber em aberto. Para o que já aconteceu, use o Fluxo de caixa.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.tabela",
        instrucao: "Veja os 12 meses a partir deste",
        explicacao:
          "A tela abre no modo Móvel: o mês atual e os 11 seguintes. Cada linha soma as parcelas que vencem " +
          "naquele mês e encadeia o saldo de um mês para o outro.",
      },
      {
        cena: "painel",
        alvo: "col.saldoInicial",
        instrucao: "O ponto de partida é o saldo conciliado de hoje",
        explicacao:
          "O saldo inicial da primeira linha é o saldo em caixa de hoje que o extrato já confirmou, somando todas " +
          "as contas ativas da filial (o mesmo do Fluxo de caixa).",
      },
      {
        cena: "painel",
        alvo: "linha.aguardando",
        instrucao: "Aguardando conciliação: o que já foi lançado e o extrato ainda não confirmou",
        explicacao:
          "Baixas aprovadas, lançamentos manuais e transferências que ainda não foram conciliados. No exemplo, a " +
          "parcela 2 do adubo, R$ 1.012,00, paga e aprovada em 19/11. O saldo final desta linha é o saldo " +
          "contábil da Tesouraria (R$ 47.850,00), e é dele que as outras linhas partem.",
        dica: "Conciliar não muda a projeção: o valor só sai desta linha e entra no saldo conciliado.",
      },
      {
        cena: "painel",
        alvo: "linha.atraso",
        instrucao: "Em atraso: o que já venceu e não foi pago ou recebido",
        explicacao:
          "Parcelas em aberto que venceram antes do primeiro mês da tela. Elas aparecem numa linha própria, no " +
          "topo, porque esse dinheiro ainda vai entrar ou sair. Entradas em atraso são clientes a cobrar; saídas " +
          "em atraso são contas a pagar.",
      },
      {
        cena: "painel",
        alvo: "col.entradas",
        instrucao: "Entradas e saídas projetadas: as parcelas em aberto",
        explicacao:
          "Entradas são as parcelas a receber e saídas, as parcelas a pagar, pelo que falta de cada uma (uma " +
          "parcela paga pela metade entra com a outra metade). Contam também as vendas a prazo, os repasses de " +
          "cartão e as taxas da operadora, que viram títulos sozinhos.",
        dica:
          "Uma baixa só sai da projeção depois de aprovada. A partir daí, o pagamento aparece na linha Aguardando " +
          "conciliação até o extrato confirmar.",
      },
      {
        cena: "painel",
        alvo: "linha.negativo",
        instrucao: "Saldo negativo: o mês em que falta dinheiro",
        explicacao:
          "A linha fica vermelha quando o saldo final do mês fica abaixo de zero. No exemplo, fevereiro de 2027, " +
          "com a compra de insumos da safra: R$ 52.000,00 de saídas contra R$ 4.500,00 de entradas.",
        dica:
          "Dá tempo de agir: cobrar o que está em atraso, renegociar o vencimento de uma conta a pagar ou " +
          "planejar um financiamento. Contratos recorrentes, financiamentos e o orçamento não entram nesta " +
          "projeção.",
      },
    ],
    eDepois: {
      texto:
        "A projeção muda sozinha conforme os títulos mudam: um título novo, um vencimento alterado ou uma baixa " +
        "aprovada aparecem aqui na hora. Para ver o caminho de vários anos, use o Fluxo de caixa estratégico.",
      proximoRoteiro: "navegar",
    },
  }),

  roteiro({
    id: "navegar",
    titulo: "Andar no tempo e trocar o modo",
    quandoUsar:
      "Para olhar mais à frente (a partir do mês que vem, de uma safra) ou ver o ano civil inteiro, de janeiro a " +
      "dezembro.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.proximo",
        instrucao: "Clique em Próximo para começar um mês depois",
        explicacao:
          "No modo Móvel, Anterior e Próximo andam um mês. No exemplo, a tela passa a começar em dezembro de 2026.",
        preenche: { "painel.proximo": "clicado" },
      },
      {
        cena: "painel",
        alvo: "linha.aVencer",
        instrucao: "A vencer até: o que vence entre hoje e o primeiro mês",
        explicacao:
          "Quando a tela começa depois de hoje, o que vence de hoje até a véspera do primeiro mês ganha esta " +
          "linha, para não sumir da conta. No exemplo, o resto de novembro.",
      },
      {
        cena: "painel",
        alvo: "linha.atraso",
        instrucao: "Repare que o atraso agora vai até ontem",
        explicacao:
          "Numa tela que começa no futuro, Em atraso soma tudo o que venceu até ontem e não foi quitado. O saldo " +
          "dos meses parte da última dessas duas linhas, e termina igual à visão anterior: é o mesmo dinheiro, " +
          "agrupado de outro jeito.",
      },
      {
        cena: "painel",
        alvo: "painel.modo",
        instrucao: "Troque para Ano civil, se quiser janeiro a dezembro",
        explicacao:
          "No Ano civil, a tela mostra os 12 meses do ano e Anterior e Próximo andam um ano. Num ano que já " +
          "começou, os meses que passaram mostram só o que deles continua em aberto, como se fosse pago ou " +
          "recebido no próprio mês.",
        preenche: { "painel.modo": "Ano civil" },
      },
      {
        cena: "painel",
        alvo: "painel.exportar",
        instrucao: "Exporte o que está na tela",
        explicacao:
          "PDF, CSV ou Excel, com o mesmo modo, o mesmo período e o mesmo filtro de classificação da tela.",
      },
    ],
    eDepois: {
      texto: "O modo e o período ficam no endereço da página: dá para salvar nos favoritos uma visão que você usa sempre.",
      proximoRoteiro: "filtrar-classificacao",
    },
  }),

  roteiro({
    id: "filtrar-classificacao",
    titulo: "Projetar só o fiscal ou só o gerencial",
    quandoUsar:
      "Para ver quanto do que vai entrar e sair tem documento oficial (Fiscal) e quanto é controlado só " +
      "internamente (Gerencial).",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.classificacao",
        instrucao: "Escolha Fiscal ou Gerencial",
        explicacao: "A projeção passa a usar só os títulos daquela classificação.",
        preenche: { "painel.classificacao": "Fiscal" },
      },
      {
        cena: "painel",
        alvo: "painel.aviso",
        instrucao: "Leia o aviso da visão filtrada",
        explicacao:
          "O saldo do banco é um só e não se divide. Por isso a projeção filtrada começa em zero e as colunas de " +
          "saldo viram Acumulado: o quanto os títulos daquela classificação somam ou tiram.",
      },
      {
        cena: "painel",
        alvo: "col.saldoFinal",
        instrucao: "Leia o Acumulado final",
        explicacao:
          "Negativo quer dizer que, naquela classificação, sai mais do que entra. Na visão filtrada não há alerta " +
          "de saldo negativo, porque não é o saldo da conta.",
      },
    ],
    eDepois: {
      texto: "Volte para Todos para ver o saldo de verdade e os meses em que falta dinheiro.",
    },
  }),
];
