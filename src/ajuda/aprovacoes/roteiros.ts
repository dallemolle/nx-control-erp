import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { MOTIVO_REJEICAO, VOCE } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_APROVA =
  "Quem pode: perfis Administrador e Tesouraria, com permissão de alteração na filial. O perfil Financeiro " +
  "registra baixas, mas não aprova.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "aprovar-baixa",
    titulo: "Aprovar uma baixa",
    quandoUsar:
      "Quando alguém registrou um pagamento ou um recebimento em Contas a pagar ou Contas a receber. Até a baixa " +
      "ser aprovada, a parcela continua em aberto e nada sai nem entra na conta bancária do sistema.",
    quemPode: QUEM_APROVA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.tabela",
        instrucao: "Veja as baixas que esperam aprovação",
        explicacao:
          "Cada linha é uma baixa de uma parcela, das mais antigas para as mais novas. A lista mostra só as baixas " +
          "da filial ativa. Quando não há nada para aprovar, aparece “Nenhuma baixa pendente”.",
      },
      {
        cena: "lista",
        alvo: "lista.l1.documento",
        instrucao: "Ache a baixa pelo documento e pela contraparte",
        explicacao:
          "Documento é o do título (a nota, o boleto, o recibo). Contraparte é o fornecedor, quando é um " +
          "pagamento, ou o cliente, quando é um recebimento. No exemplo, o pagamento da parcela 1 do adubo da " +
          "Agro Insumos.",
      },
      {
        cena: "lista",
        alvo: "lista.l1.valor",
        instrucao: "Confira o valor com o comprovante",
        explicacao:
          "Valor pago é o total que saiu ou entrou na conta, já com juros e multa. No exemplo, R$ 1.000,00 da " +
          "parcela mais R$ 12,00 de juros. Compare com o comprovante do banco.",
        dica:
          "A tela não mostra a data nem a conta bancária da baixa. Na dúvida, pergunte a quem registrou antes de " +
          "aprovar: depois de aprovada, a baixa não pode ser desfeita.",
      },
      {
        cena: "lista",
        alvo: "lista.l1.registradoPor",
        instrucao: "Veja quem registrou",
        explicacao:
          "É a pessoa que lançou a baixa. Se a empresa exige aprovação por outra pessoa (o padrão), você só aprova " +
          "baixas registradas por outra pessoa.",
      },
      {
        cena: "lista",
        alvo: "lista.l1.aprovar",
        instrucao: "Clique em Aprovar",
        explicacao: "Atenção: o sistema não pergunta se você tem certeza. O clique já aprova a baixa.",
      },
    ],
    eDepois: {
      texto:
        "A linha sai da lista. O sistema lança a saída (pagamento) ou a entrada (recebimento) na conta bancária " +
        "escolhida na baixa, com a data da baixa, e a parcela fica PAGO, ou PARCIALMENTE_PAGO se o valor foi menor " +
        "que o da parcela. Numa conta Caixa, o lançamento já entra conciliado. Numa conta de banco, ele espera o " +
        "extrato na Conciliação. A aprovação não pode ser desfeita.",
      proximoRoteiro: "rejeitar-baixa",
    },
  }),

  roteiro({
    id: "rejeitar-baixa",
    titulo: "Rejeitar uma baixa",
    quandoUsar:
      "Quando a baixa está errada: foi lançada em dobro, o valor não bate com o comprovante, foi na parcela " +
      "errada ou o pagamento não aconteceu. A parcela continua com o botão Baixar enquanto a baixa espera " +
      "aprovação, então baixa em dobro acontece.",
    quemPode: QUEM_APROVA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.l2.motivo",
        instrucao: "Escreva o motivo na linha da baixa",
        explicacao:
          "O campo fica ao lado do botão Rejeitar, na mesma linha. O motivo é obrigatório, com pelo menos 3 " +
          "letras. No exemplo, o Recibo 88 já tinha sido pago e aprovado: a baixa nova é repetida.",
        preenche: { "lista.l2.motivo": MOTIVO_REJEICAO },
      },
      {
        cena: "lista",
        alvo: "lista.l2.rejeitar",
        instrucao: "Clique em Rejeitar",
        explicacao: "O clique já rejeita a baixa, sem pergunta de confirmação.",
        dica:
          "Quem registrou não recebe aviso, e o motivo fica só na Auditoria, que o perfil Financeiro não vê. " +
          "Avise a pessoa, para ela lançar de novo do jeito certo.",
      },
    ],
    eDepois: {
      texto:
        "A linha sai da lista e nenhum lançamento é feito: a parcela continua como estava. Se a baixa precisava " +
        "só de correção, quem registrou lança outra pelo botão Baixar da parcela, em Contas a pagar ou Contas a " +
        "receber, e ela volta para esta lista.",
      proximoRoteiro: "aprovar-bloqueado",
    },
  }),

  roteiro({
    id: "aprovar-bloqueado",
    titulo: "Quando o Aprovar fica desabilitado",
    quandoUsar:
      "Quando o botão Aprovar aparece apagado e não deixa clicar. Acontece com a baixa que você mesmo registrou, " +
      "se a empresa exige aprovação por outra pessoa.",
    passos: [
      {
        cena: "lista",
        alvo: "lista.l3.registradoPor",
        instrucao: "Veja o aviso embaixo do nome",
        explicacao:
          `No exemplo, quem está aprovando é o ${VOCE}, e esta baixa foi registrada por ele. Por isso aparece ` +
          "“Registrada por você: outra pessoa precisa aprovar”. A regra vale também para o Administrador: é a " +
          "garantia de que cada pagamento passa por duas pessoas.",
      },
      {
        cena: "lista",
        alvo: "lista.l3.aprovar",
        instrucao: "Peça a outra pessoa para aprovar",
        explicacao:
          "Qualquer outra pessoa com perfil Administrador ou Tesouraria na filial pode aprovar. Você ainda pode " +
          "rejeitar a sua própria baixa, se registrou errado.",
        dica:
          "A empresa tem uma pessoa só no financeiro? O Administrador pode desligar a regra em Administração → " +
          "Empresas, no cadastro da empresa: “Exigir que a baixa seja aprovada por outra pessoa”. A mudança fica " +
          "na Auditoria.",
      },
    ],
    eDepois: {
      texto:
        "Quando a outra pessoa aprovar, a baixa sai da lista e o lançamento é feito na conta, como em qualquer " +
        "aprovação.",
    },
  }),
];
