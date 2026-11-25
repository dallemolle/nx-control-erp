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
        instrucao: "Ache a baixa pelo título",
        explicacao:
          "Documento é o do título (a nota, o boleto, o recibo). Embaixo vêm a contraparte (o fornecedor, quando é " +
          "um pagamento, ou o cliente, quando é um recebimento) e qual parcela está sendo baixada. No exemplo, o " +
          "pagamento da parcela 1 de 3 do adubo da Agro Insumos.",
        dica:
          "O nome da contraparte é um link: abre Contas a pagar ou Contas a receber só com os títulos dela, onde " +
          "estão as parcelas e os anexos (a nota, o boleto).",
      },
      {
        cena: "lista",
        alvo: "lista.l1.baixa",
        instrucao: "Confira a data e a conta",
        explicacao:
          "A data é o dia em que o dinheiro saiu ou entrou, e vira a data do lançamento na conta. Embaixo, a conta " +
          "bancária onde ele vai ser lançado. Compare as duas com o comprovante do banco. No exemplo, 15/10/2026, " +
          "no Banco do Brasil.",
      },
      {
        cena: "lista",
        alvo: "lista.l1.valor",
        instrucao: "Confira o valor",
        explicacao:
          "Valor pago é o total que saiu ou entrou na conta, já com juros e multa. Embaixo vêm o valor da parcela e " +
          "os ajustes: no exemplo, parcela de R$ 1.000,00 mais R$ 12,00 de juros dá R$ 1.012,00.",
        dica:
          "Algo não bate com o comprovante? Rejeite com o motivo em vez de aprovar. Uma baixa aprovada por engano " +
          "pode ser estornada depois, na parcela em Contas a pagar ou a receber, enquanto não estiver conciliada.",
      },
      {
        cena: "lista",
        alvo: "lista.l1.registradoPor",
        instrucao: "Veja quem registrou",
        explicacao:
          "É a pessoa que lançou a baixa, com o dia e a hora do registro. Se a empresa exige aprovação por outra " +
          "pessoa (o padrão), você só aprova baixas registradas por outra pessoa.",
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
        "extrato na Conciliação. Aprovou por engano? A baixa pode ser estornada na parcela, em Contas a pagar ou a " +
        "receber, enquanto o lançamento não estiver conciliado.",
      proximoRoteiro: "entender-avisos",
    },
  }),

  roteiro({
    id: "entender-avisos",
    titulo: "Quando a baixa tem um aviso",
    quandoUsar:
      "Quando aparece um triângulo amarelo com um aviso embaixo do título da baixa. O aviso aponta o que costuma " +
      "ser erro de digitação, no valor ou na data, mas não impede a aprovação: quem decide é você.",
    quemPode: QUEM_APROVA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.l4.avisos",
        instrucao: "Veja o aviso de data",
        explicacao:
          "A Fatura 556 foi registrada em 16/10/2026 com a data 16/01/2026: 273 dias antes. O sistema avisa quando " +
          "a data da baixa fica mais de 30 dias antes do dia do registro, e também quando ela é depois de hoje.",
      },
      {
        cena: "lista",
        alvo: "lista.l4.baixa",
        instrucao: "Compare com o comprovante",
        explicacao:
          "A conta de energia foi paga em 16/10, e a Maria digitou o mês errado. Aprovada assim, a saída entraria " +
          "na conta com data de janeiro, e o Fluxo de caixa e a Conciliação ficariam errados.",
        dica: "Rejeite com o motivo (por exemplo, “Data errada: pago em 16/10”) para a Maria lançar de novo.",
      },
      {
        cena: "lista",
        alvo: "lista.l2.avisos",
        instrucao: "Veja o aviso de valor",
        explicacao:
          "O recibo do José da Silva é de R$ 1.200,00, e a Maria digitou R$ 12.000,00. O sistema compara o valor " +
          "pago com o que falta da parcela, mais juros e multa, menos o desconto: “Acima do saldo em R$ …” quando " +
          "passa, “Pagamento parcial: faltam R$ …” (ou Recebimento parcial) quando fica abaixo.",
        dica:
          "Pagamento parcial pode estar certo, quando foi combinado pagar em partes. “A parcela já está paga” e " +
          "“Há outra baixa pendente nesta parcela” só aparecem em baixas registradas antes de o sistema impedir a " +
          "segunda baixa na mesma parcela: confira se não é o mesmo pagamento lançado duas vezes.",
      },
    ],
    eDepois: {
      texto:
        "Se o aviso aponta um erro, rejeite a baixa com o motivo, como no próximo roteiro. Se está tudo certo (um " +
        "pagamento parcial combinado, por exemplo), aprove normalmente.",
      proximoRoteiro: "rejeitar-baixa",
    },
  }),

  roteiro({
    id: "rejeitar-baixa",
    titulo: "Rejeitar uma baixa",
    quandoUsar:
      "Quando a baixa está errada: o valor ou a data não batem com o comprovante, foi na parcela errada ou o " +
      "pagamento não aconteceu.",
    quemPode: QUEM_APROVA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.l2.motivo",
        instrucao: "Escreva o motivo na linha da baixa",
        explicacao:
          "O campo fica ao lado do botão Rejeitar, na mesma linha. O motivo é obrigatório, com pelo menos 3 " +
          "letras. No exemplo, o Recibo 88 tem o aviso “Acima do saldo”: o recibo é de R$ 1.200,00 e a baixa foi " +
          "lançada com R$ 12.000,00.",
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
        "A linha sai da lista e nenhum lançamento é feito: a parcela continua como estava e volta a aceitar baixa. Se a baixa precisava " +
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
