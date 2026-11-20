import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { DATA_DO_DEPOSITO, OPERADORA } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_PODE =
  "Quem pode: perfis Administrador, Financeiro e Tesouraria, com permissão de alteração na filial. Sem essa " +
  "permissão, a lista aparece sem as caixas de marcar e sem os botões.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "confirmar-repasse",
    titulo: "Confirmar um repasse que caiu na conta",
    quandoUsar:
      "Quando a operadora da maquininha depositou o dinheiro de vendas no cartão. A venda na maquininha não " +
      "entra no caixa na hora: a operadora deposita depois, já descontada a taxa. Até você confirmar aqui, o " +
      "sistema considera que esse dinheiro ainda não chegou.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "tabela",
        instrucao: "Veja os repasses que faltam receber",
        explicacao:
          "Cada linha é um repasse de um pedido de venda: Bruto é o valor da venda, Taxa é o que a operadora " +
          "desconta, e Líquido é o que cai na conta. Venda parcelada no crédito tem um repasse por parcela (como " +
          "o PV-43 · 2/3). Atrasado quer dizer só que a data prevista passou e ninguém confirmou ainda.",
      },
      {
        cena: "lista",
        alvo: "filtro.operadora",
        instrucao: "Escolha a operadora do depósito",
        explicacao:
          "O extrato mostra de qual operadora veio o depósito. Filtrar deixa na lista só os repasses dela. Cada " +
          "filtro já atualiza a lista na hora.",
        preenche: { "filtro.operadora": OPERADORA },
      },
      {
        cena: "lista",
        alvo: "l1.marcar",
        instrucao: "Marque os repasses que o depósito cobre",
        explicacao:
          "A operadora costuma juntar vários repasses num depósito só. No exemplo, o depósito de R$ 1.462,50 de " +
          `${DATA_DO_DEPOSITO} cobre os repasses do PV-41 e do PV-42. Marque a caixa do primeiro.`,
        preenche: { "l1.marcar": "marcado" },
      },
      {
        cena: "lista",
        alvo: "l2.marcar",
        instrucao: "Marque os demais repasses do depósito",
        explicacao: "Agora a caixa do PV-42. A barra de cima soma os marcados.",
        preenche: { "l2.marcar": "marcado" },
      },
      {
        cena: "lista",
        alvo: "barra.liquido",
        instrucao: "Confira o líquido com o extrato",
        explicacao:
          "A barra mostra quantos repasses estão marcados e a soma do líquido deles: R$ 492,50 + R$ 970,00 = " +
          "R$ 1.462,50, o mesmo valor do depósito no extrato.",
        dica:
          "Não bateu? Confira se marcou um repasse a mais ou a menos. Se a diferença for de centavos, porque a " +
          "taxa real veio um pouco diferente, confirme assim mesmo e acerte na Conciliação, com “Lançar a " +
          "diferença”.",
      },
      {
        cena: "lista",
        alvo: "barra.data",
        instrucao: "Informe a data em que o dinheiro entrou",
        explicacao:
          "Vem preenchida com a data prevista do primeiro repasse marcado, se ela já passou, ou com hoje. Troque " +
          `pela data do depósito no extrato: ${DATA_DO_DEPOSITO}. A data não pode ser futura.`,
        preenche: { "barra.data": DATA_DO_DEPOSITO },
      },
      {
        cena: "lista",
        alvo: "barra.confirmar",
        instrucao: "Clique em “Confirmar recebimento”",
        explicacao:
          "O recebimento já vale na hora: não passa pelas Aprovações pendentes. Se errar, dá para desfazer " +
          "enquanto o depósito não for conciliado.",
      },
    ],
    eDepois: {
      texto:
        "Os repasses ficam Recebido e saem da lista padrão (filtre a Situação por Recebidos para vê-los). As " +
        "contas a receber deles ficam PAGO, e o pedido de venda deixa de mostrar “Aguardando repasse”. O sistema " +
        "lança na conta de depósito da operadora (definida em Cadastros → Operadoras de cartão) a entrada do bruto " +
        "e a saída da taxa. Falta só a Conciliação: concilie em grupo a linha do depósito com essas entradas e " +
        "saídas, que somam o líquido.",
      proximoRoteiro: "desfazer-repasse",
    },
  }),

  roteiro({
    id: "desfazer-repasse",
    titulo: "Desfazer um repasse confirmado por engano",
    quandoUsar:
      "Quando um repasse foi confirmado mas o dinheiro não caiu, ou foi confirmado com a data errada. Desfazer " +
      "volta o repasse para a lista do que falta receber.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "filtro.situacao",
        instrucao: "Escolha a situação “Recebidos”",
        explicacao:
          "A lista padrão mostra só o que falta receber. Os repasses já confirmados aparecem com a situação " +
          "Recebidos, com a data em que foram confirmados.",
        preenche: { "filtro.situacao": "Recebidos" },
      },
      {
        cena: "lista",
        alvo: "rec.desfazer",
        instrucao: "Clique em Desfazer na linha do repasse",
        explicacao: "Atenção: o sistema não pergunta se você tem certeza. O clique já desfaz.",
        dica:
          "Apareceu “O repasse já foi conciliado. Desconcilie na Conciliação antes”? Desfaça a conciliação do " +
          "depósito em Financeiro → Conciliação e volte aqui.",
      },
    ],
    eDepois: {
      texto:
        "As baixas e os lançamentos que a confirmação criou são apagados, e o repasse volta para A receber ou " +
        "Atrasado. Se ele caiu em outra data, confirme de novo com a data certa.",
      proximoRoteiro: "acompanhar-repasses",
    },
  }),

  roteiro({
    id: "acompanhar-repasses",
    titulo: "Acompanhar o que a operadora ainda deve",
    quandoUsar:
      "Para conferir se a operadora está pagando em dia ou saber quanto ainda vai entrar: repasses atrasados para " +
      "cobrar, o que cai na semana que vem.",
    passos: [
      {
        cena: "lista",
        alvo: "filtro.situacao",
        instrucao: "Escolha a situação “Atrasados”",
        explicacao:
          "Ficam só os repasses com data prevista vencida e sem confirmação. Antes de cobrar a operadora, confira " +
          "no extrato se o dinheiro já não caiu e só falta confirmar aqui.",
        preenche: { "filtro.situacao": "Atrasados" },
      },
      {
        cena: "lista",
        alvo: "filtro.inicio",
        instrucao: "Limite o período, se precisar",
        explicacao:
          "Previsto de e Até mostram só os repasses com data prevista nesse intervalo, como a semana que vem. " +
          "Deixe em branco para não limitar.",
      },
      {
        cena: "lista",
        alvo: "l1.pedido",
        instrucao: "Clique no número do pedido para ver a venda",
        explicacao:
          "O link abre o pedido de venda, com o cliente, os itens e o pagamento. Útil para conferir uma taxa ou " +
          "um valor que parece errado.",
      },
      {
        cena: "lista",
        alvo: "filtro.limpar",
        instrucao: "Clique em “Limpar filtros” para voltar à lista padrão",
        explicacao: "A lista volta a mostrar todas as operadoras, com o que está a receber e atrasado.",
        preenche: { "filtro.situacao": "", "filtro.operadora": "" },
      },
    ],
    eDepois: {
      texto:
        "O fluxo de caixa projetado já conta com esses repasses nas datas previstas. Quando cada depósito cair, " +
        "confirme aqui e concilie o depósito na Conciliação: só então ele conta como entrada realizada.",
    },
  }),
];
