import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE =
  "Quem vê: todos os perfis com acesso ao Financeiro (Administrador, Financeiro, Tesouraria, Gestor, Auditor e " +
  "Consulta). A tela só consulta: não lança nada.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "ler-fluxo",
    titulo: "Ler o fluxo de caixa",
    quandoUsar:
      "Para saber quanto dinheiro entrou e saiu de verdade, período a período, e quanto havia nas contas no fim " +
      "de cada um. É o retrato do que já aconteceu. Para o que ainda vai acontecer, use o Fluxo de caixa " +
      "projetado.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.tabela",
        instrucao: "Veja uma linha por período",
        explicacao:
          "A tela abre por mês, com os 12 meses do ano de hoje, somando todas as contas ativas da filial (bancos e " +
          "Caixa).",
        dica:
          "Só entra o que está conciliado. Um pagamento aprovado, mas ainda não conciliado com o extrato na " +
          "Conciliação, não aparece aqui. Na conta Caixa, tudo entra na hora, porque já nasce conciliado.",
      },
      {
        cena: "painel",
        alvo: "col.saldoInicial",
        instrucao: "Saldo inicial: quanto havia no começo do período",
        explicacao:
          "É o saldo inicial cadastrado das contas mais tudo o que foi conciliado antes do período. O saldo " +
          "inicial de um mês é sempre o saldo final do mês anterior.",
      },
      {
        cena: "painel",
        alvo: "col.entradas",
        instrucao: "Entradas e Saídas: o que entrou e saiu no período",
        explicacao:
          "Soma dos lançamentos conciliados com data dentro do período: recebimentos, pagamentos e lançamentos " +
          "avulsos. Transferências entre contas da filial não entram: ficam na coluna Transferências.",
        dica:
          "A coluna Transferências mostra o líquido das transferências do período e quase sempre fica em R$ 0,00 " +
          "(o saque de R$ 2.000 do banco para o Caixa sai de uma conta e entra na outra). Ela só fica diferente " +
          "de zero quando uma das pernas ainda não foi conciliada: o saldo final conta essa diferença até o " +
          "extrato chegar.",
      },
      {
        cena: "painel",
        alvo: "col.geracao",
        instrucao: "Geração líquida: entradas menos saídas",
        explicacao:
          "Positiva quando entrou mais do que saiu; negativa quando saiu mais. Em novembro de 2026, " +
          "R$ 17.400,00 − R$ 18.638,00 = −R$ 1.238,00: o caixa encolheu no mês.",
      },
      {
        cena: "painel",
        alvo: "col.saldoFinal",
        instrucao: "Saldo final: quanto sobrou no fim do período",
        explicacao: "Saldo inicial mais a geração líquida. Os meses que ainda não chegaram repetem o último saldo.",
      },
    ],
    eDepois: {
      texto:
        "O saldo final do mês atual deve bater com a soma dos saldos do extrato de cada conta, se tudo estiver " +
        "conciliado. Não bateu? Confira na Conciliação o que falta conciliar e, na Tesouraria, a diferença de " +
        "cada conta.",
      proximoRoteiro: "mudar-periodo",
    },
  }),

  roteiro({
    id: "mudar-periodo",
    titulo: "Ver por dia, semana ou ano, e exportar",
    quandoUsar: "Para olhar mais de perto (os dias ou as semanas de um mês) ou mais de longe (os últimos anos).",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.granularidade",
        instrucao: "Escolha Dia, Semana, Mês ou Ano",
        explicacao:
          "Dia mostra os dias do mês; Semana, as semanas do mês, de segunda a domingo (a primeira e a última podem " +
          "pegar dias dos meses vizinhos); Mês, os 12 meses do ano; Ano, os últimos 5 anos. No exemplo, as " +
          "semanas de novembro.",
        preenche: { "painel.granularidade": "Semana" },
      },
      {
        cena: "painel",
        alvo: "painel.anterior",
        instrucao: "Use Anterior e Próximo para andar no tempo",
        explicacao:
          "O passo depende da visão: em Dia e Semana, anda um mês; em Mês, um ano; em Ano, cinco anos.",
      },
      {
        cena: "painel",
        alvo: "painel.exportar",
        instrucao: "Exporte o que está na tela",
        explicacao:
          "PDF para imprimir ou enviar; CSV e Excel para a planilha. O arquivo sai com a mesma visão, o mesmo " +
          "período e o mesmo filtro de classificação da tela.",
      },
    ],
    eDepois: {
      texto:
        "A visão e o período ficam no endereço da página: dá para salvar nos favoritos uma visão que você usa " +
        "sempre, como as semanas do mês.",
      proximoRoteiro: "filtrar-classificacao",
    },
  }),

  roteiro({
    id: "filtrar-classificacao",
    titulo: "Ver só o movimento fiscal ou só o gerencial",
    quandoUsar:
      "Para separar o que tem documento oficial (Fiscal) do que é controlado só internamente (Gerencial), por " +
      "exemplo para conversar com o contador.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.classificacao",
        instrucao: "Escolha Fiscal ou Gerencial",
        explicacao: "O seletor fica ao lado de Anterior e Próximo. Todos volta à visão completa.",
        preenche: { "painel.classificacao": "Fiscal" },
      },
      {
        cena: "painel",
        alvo: "painel.aviso",
        instrucao: "Leia o aviso da visão filtrada",
        explicacao:
          "O saldo do banco é um só e não se divide entre fiscal e gerencial. Por isso as colunas de saldo viram " +
          "Acumulado, que começa em zero no início da tela e soma só o movimento da classificação escolhida.",
      },
      {
        cena: "painel",
        alvo: "col.saldoFinal",
        instrucao: "Leia o Acumulado final",
        explicacao:
          "É quanto o movimento fiscal gerou (ou consumiu) desde o primeiro período da tela. As transferências " +
          "entre contas ficam de fora, porque não são receita nem despesa.",
      },
    ],
    eDepois: {
      texto:
        "O mesmo seletor existe no Fluxo de caixa projetado, no estratégico, no Orçamento, no fluxo por dimensão " +
        "e na comparação entre safras.",
    },
  }),
];
