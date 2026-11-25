import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "@/ajuda/_titulos/alvos";
import { EXEMPLO } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_LANCA = "Quem pode: perfis Administrador e Financeiro, com permissão de alteração na filial.";
const QUEM_BAIXA = "Quem pode: perfis Administrador, Financeiro e Tesouraria, com permissão de alteração na filial.";

const QUEM_ESTORNA =
  "Quem pode: perfis Administrador e Tesouraria, com permissão de alteração na filial. Se a empresa exige " +
  "aprovação por outra pessoa (o padrão), quem registrou a baixa não pode estorná-la.";

const ABRIR_TITULO = {
  cena: "lista",
  alvo: "lista.linhaExemplo",
  instrucao: "Encontre o título e clique na linha dele",
  explicacao:
    "Clicar na linha abre, logo abaixo, os detalhes do título e as parcelas, cada uma com os seus botões. " +
    "Se a lista for grande, use os filtros de cima para achar o título mais rápido.",
  preenche: { "lista.linhaExemplo": "expandida" },
} as const;

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "cadastrar-titulo",
    titulo: "Cadastrar um título a pagar",
    quandoUsar:
      "Sempre que surgir uma conta a pagar: chegou uma nota de compra, um boleto, uma fatura ou um acordo com " +
      "fornecedor. O título registra a dívida e quando vence cada parte dela.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.novo",
        instrucao: "Clique em “Novo título a pagar”",
        explicacao: "O botão fica no alto da tela, à direita. Ele abre uma janela com o formulário do título.",
        preenche: { "lista.tabela": "sem-exemplo" },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.fornecedor",
        instrucao: "Escolha o fornecedor",
        explicacao:
          `Clique na caixa e escolha na lista quem vai receber o dinheiro. No exemplo, a ${EXEMPLO.contraparte}, ` +
          "que vendeu o adubo.",
        dica:
          "O fornecedor não aparece na lista? Então ele ainda não foi cadastrado. Cadastre primeiro em " +
          "Cadastros → Fornecedores e depois volte aqui.",
        preenche: { "novo.fornecedor": EXEMPLO.contraparte },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.documento",
        instrucao: "Digite o documento",
        explicacao:
          "É o nome que identifica o título na lista. Use algo fácil de reconhecer depois, como o número da nota " +
          "ou do boleto.",
        preenche: { "novo.documento": EXEMPLO.documento },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.emissao",
        instrucao: "Informe a data de emissão",
        explicacao: "É a data em que o documento foi emitido. Ela está impressa na nota ou no boleto.",
        preenche: { "novo.emissao": EXEMPLO.emissao },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.competencia",
        instrucao: "Informe a competência",
        explicacao:
          "Competência é o mês a que a despesa pertence, mesmo que ela seja paga depois. O adubo foi comprado em " +
          "setembro, então a competência é setembro, ainda que as parcelas vençam de outubro a dezembro.",
        dica: "Na dúvida, use a mesma data da emissão.",
        preenche: { "novo.competencia": EXEMPLO.competencia },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.categoria",
        instrucao: "Escolha a categoria financeira",
        explicacao:
          "A categoria diz que tipo de gasto é este. É ela que agrupa as despesas no fluxo de caixa, no orçamento " +
          "e nos relatórios. Escolha a que melhor descreve a compra.",
        dica:
          "Não achou uma categoria que sirva? Peça para quem cuida dos cadastros criar uma em Cadastros → " +
          "Categorias financeiras. Usar uma parecida bagunça os relatórios.",
        preenche: { "novo.categoria": EXEMPLO.categoria },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.centroCusto",
        instrucao: "Escolha o centro de custo (opcional)",
        explicacao:
          "O centro de custo diz qual área da fazenda gastou. Centro de lucro, safra e projeto funcionam do mesmo " +
          "jeito: são opcionais e servem para separar os números nos relatórios. Deixe em “Nenhum” o que não se " +
          "aplica.",
        preenche: { "novo.centroCusto": EXEMPLO.centroCusto },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.safra",
        instrucao: "Escolha a safra (opcional)",
        explicacao:
          "Marque a safra quando o gasto for de uma safra, como insumos para a lavoura. Assim a comparação entre " +
          "safras mostra quanto cada uma custou.",
        preenche: { "novo.safra": EXEMPLO.safra },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.conta",
        instrucao: "Escolha a conta bancária prevista (opcional)",
        explicacao:
          "É só uma anotação de onde você pretende pagar. Na hora da baixa, você escolhe a conta de onde o " +
          "dinheiro saiu de fato.",
        preenche: { "novo.conta": EXEMPLO.conta },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.formaPagamento",
        instrucao: "Informe a forma de pagamento (opcional)",
        explicacao: "Escreva como vai pagar: boleto, PIX, transferência. É só uma anotação.",
        preenche: { "novo.formaPagamento": EXEMPLO.formaPagamento },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.classificacao",
        instrucao: "Confira a classificação",
        explicacao:
          "Fiscal quando existe documento oficial (nota fiscal, guia, contrato). Gerencial quando a compra foi " +
          "sem nota e é controlada só internamente. O sistema já sugere a classificação do cadastro do fornecedor. " +
          "A compra do adubo tem nota, então fica Fiscal.",
        preenche: { "novo.classificacao": EXEMPLO.classificacao },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.tipoComprovante",
        instrucao: "Escolha o tipo de comprovante",
        explicacao:
          "Diga qual documento você tem em mãos. Para nota fiscal de produto, escolha NF-e. Depois de escolher, " +
          "aparecem os campos da nota.",
        preenche: { "novo.tipoComprovante": EXEMPLO.tipoComprovante },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.numeroNota",
        instrucao: "Preencha número, série e data de emissão da nota",
        explicacao: "Os três estão no alto da nota fiscal impressa (o DANFE).",
        dica:
          "A nota ainda não chegou? Pode salvar sem o número e completar depois, pelo botão Editar do título. " +
          "Enquanto faltar o número ou o anexo, o título aparece na lista com um triângulo amarelo de pendência.",
        preenche: {
          "novo.numeroNota": EXEMPLO.numeroNota,
          "novo.serie": EXEMPLO.serie,
          "novo.emissaoNota": EXEMPLO.emissao,
        },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.chave",
        instrucao: "Cole a chave de acesso",
        explicacao:
          "É o número de 44 dígitos impresso no DANFE, perto do código de barras. Pode colar com os espaços. " +
          "Embaixo do campo, o sistema avisa se a chave está certa.",
        preenche: { "novo.chave": EXEMPLO.chave },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.parcela1",
        instrucao: "Preencha a primeira parcela",
        explicacao:
          "Em Parcelas, informe o vencimento e o valor da primeira parcela. No valor, digite só o número, sem R$ " +
          "e sem ponto de milhar: 1000,00.",
        dica: "Compra à vista? Deixe uma parcela só, com o valor total.",
        preenche: { "novo.parcela1": "preenchida" },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.adicionarParcela",
        instrucao: "Clique em “Adicionar parcela” para cada parcela a mais",
        explicacao:
          "A compra foi em 3 vezes, então clique duas vezes. Cada clique cria uma linha nova. Criou uma linha a " +
          "mais? Use o botão “Remover” dela.",
        preenche: { "novo.parcela2": "vazia", "novo.parcela3": "vazia" },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.parcelas",
        instrucao: "Preencha as outras parcelas",
        explicacao:
          "Uma linha por parcela, cada uma com o seu vencimento e o seu valor. Confira se a soma dá o total da " +
          "nota: 1.000 + 1.000 + 1.000 = 3.000.",
        preenche: { "novo.parcela2": "preenchida", "novo.parcela3": "preenchida" },
      },
      {
        cena: "novoTitulo",
        alvo: "novo.salvar",
        instrucao: "Clique em Salvar",
        explicacao:
          "Se faltar algum campo obrigatório, o navegador ou uma mensagem em vermelho acima do botão avisa o que " +
          "corrigir.",
      },
    ],
    eDepois: {
      texto:
        "A janela fecha e o título aparece na lista de Contas a pagar. Clique na linha dele para ver os detalhes " +
        "e as três parcelas. O sistema marca sozinho as parcelas perto de vencer (A_VENCER, até 7 dias antes) e as " +
        "vencidas (VENCIDO). Anexe o PDF ou o XML da nota em Anexos, na linha aberta do título: sem anexo, o título " +
        "fica com o triângulo amarelo de pendência fiscal. Quando o dinheiro sair da conta, registre o pagamento " +
        "com o botão Baixar.",
      proximoRoteiro: "pagar-parcela",
    },
  }),

  roteiro({
    id: "pagar-parcela",
    titulo: "Pagar uma parcela (baixa)",
    quandoUsar:
      "Depois que o dinheiro saiu da conta: o boleto foi pago, o PIX foi feito. A baixa registra o pagamento de " +
      "uma parcela.",
    quemPode: QUEM_BAIXA,
    passos: [
      ABRIR_TITULO,
      {
        cena: "lista",
        alvo: "lista.p1.baixar",
        instrucao: "Clique em “Baixar” na parcela que foi paga",
        explicacao:
          "No exemplo, a parcela 1, que venceu em 10/10/2026. O botão só aparece em parcela que ainda não foi " +
          "paga, cancelada ou renegociada.",
      },
      {
        cena: "baixa",
        alvo: "baixa.data",
        instrucao: "Informe a data do pagamento",
        explicacao:
          "É o dia em que o dinheiro saiu da conta, como aparece no comprovante ou no extrato. Não é a data do " +
          "vencimento.",
        preenche: { "baixa.data": "15/10/2026" },
      },
      {
        cena: "baixa",
        alvo: "baixa.valorPago",
        instrucao: "Informe o valor pago",
        explicacao:
          "É o total que saiu da conta, igual ao comprovante: valor da parcela + juros + multa. A " +
          "parcela foi paga 5 dias atrasada, com R$ 12,00 de juros: 1.000,00 + 12,00 = 1012,00.",
        dica:
          "Pagou menos que o valor da parcela, ou teve desconto? Hoje o sistema compara só o valor pago com o " +
          "valor da parcela: a parcela fica como PARCIALMENTE_PAGO e a diferença continua em aberto. Se foi " +
          "desconto, combine com o responsável pelo financeiro como registrar antes de lançar a baixa.",
        preenche: { "baixa.valorPago": "1012,00" },
      },
      {
        cena: "baixa",
        alvo: "baixa.juros",
        instrucao: "Informe juros, multa e desconto, se houver",
        explicacao:
          "Esses campos só detalham de onde veio a diferença no valor pago. No exemplo, R$ 12,00 vão em Juros. " +
          "Multa e Desconto ficam em 0 quando não existem.",
        preenche: { "baixa.juros": "12,00" },
      },
      {
        cena: "baixa",
        alvo: "baixa.conta",
        instrucao: "Escolha a conta de onde saiu o dinheiro",
        explicacao:
          "Use a conta que aparece no comprovante. É nela que o sistema lança a saída, depois da aprovação.",
        preenche: { "baixa.conta": EXEMPLO.conta },
      },
      {
        cena: "baixa",
        alvo: "baixa.registrar",
        instrucao: "Clique em “Registrar baixa”",
        explicacao:
          "O próprio botão avisa: a baixa fica pendente de aprovação. Por enquanto a parcela ainda não aparece " +
          "como paga.",
      },
      {
        cena: "lista",
        alvo: "lista.p1.aguardando",
        instrucao: "Veja a parcela aguardando aprovação",
        explicacao:
          "A janela fecha e a baixa aparece embaixo da parcela com o selo “Aguardando aprovação”. No lugar do " +
          "botão Baixar fica “Baixa aguardando aprovação”: a parcela não aceita outra baixa até esta ser aprovada " +
          "ou rejeitada. Assim o mesmo pagamento não é lançado duas vezes.",
        dica: "Pagou em partes? Registre a segunda parte depois que a primeira for aprovada.",
        preenche: { "lista.p1.baixa": "pendente" },
      },
    ],
    eDepois: {
      texto:
        "A baixa vai para Financeiro → Aprovações pendentes. Quem tem permissão de aprovar confere e clica em " +
        "Aprovar. Se a empresa exige aprovação por outra pessoa (o padrão), quem registrou a baixa não pode " +
        "aprová-la. Depois de aprovada, o sistema lança a saída na conta escolhida e a parcela fica PAGO. Se for " +
        "rejeitada, a parcela continua em aberto, nenhum lançamento é feito e a rejeição aparece embaixo da parcela, " +
        "com o motivo, e no aviso do alto da tela." +
        " Baixa aprovada com erro (conta, valor ou data) é estornada na própria parcela.",
      proximoRoteiro: "estornar-baixa",
    },
  }),

  roteiro({
    id: "estornar-baixa",
    titulo: "Estornar uma baixa aprovada",
    quandoUsar:
      "Quando uma baixa já aprovada está errada: foi lançada na conta errada, com o valor ou a data errados, ou o " +
      "pagamento nem aconteceu. O estorno tira o lançamento da conta e devolve a parcela para em aberto; a baixa " +
      "fica no histórico como estornada.",
    quemPode: QUEM_ESTORNA,
    passos: [
      { ...ABRIR_TITULO, preenche: { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "aprovada" } },
      {
        cena: "lista",
        alvo: "lista.p1.baixa",
        instrucao: "Confira a baixa que vai estornar",
        explicacao:
          "Embaixo da parcela aparecem as baixas aprovadas, com data, conta, valor e quem registrou e aprovou. No " +
          `exemplo, a parcela 1 foi paga em ${EXEMPLO.baixa.data}, mas a baixa foi lançada em ` +
          `${EXEMPLO.baixa.conta}, e o dinheiro saiu de ${EXEMPLO.conta}.`,
      },
      {
        cena: "lista",
        alvo: "lista.p1.estornar",
        instrucao: "Clique em “Estornar”",
        explicacao: "O botão só aparece para quem pode estornar e só em baixa aprovada.",
        dica:
          "No lugar do botão aparece “Conciliada: desconcilie antes de estornar” quando o lançamento já foi " +
          "conciliado com o extrato: desfaça a conciliação na tela Conciliação e volte aqui. Em título de venda " +
          "na maquininha aparece “Repasse de cartão: desfaça em Repasses de cartão”.",
      },
      {
        cena: "estornar",
        alvo: "estorno.resumo",
        instrucao: "Confira o resumo",
        explicacao:
          "A janela repete a data, a conta e o valor da baixa e avisa o que vai acontecer: o lançamento sai da " +
          "conta e a parcela volta a ficar em aberto.",
      },
      {
        cena: "estornar",
        alvo: "estorno.motivo",
        instrucao: "Informe o motivo",
        explicacao:
          "O motivo é obrigatório e fica registrado na baixa e na Auditoria. Diga o que estava errado, para quem " +
          "ler depois entender.",
        preenche: { "estorno.motivo": EXEMPLO.baixa.motivoEstorno },
      },
      {
        cena: "estornar",
        alvo: "estorno.confirmar",
        instrucao: "Clique em “Estornar baixa”",
        explicacao:
          "Se a empresa exige aprovação por outra pessoa (o padrão) e foi você quem registrou a baixa, o sistema " +
          "recusa: peça a outra pessoa da Tesouraria ou ao Administrador.",
      },
      {
        cena: "lista",
        alvo: "lista.p1.baixa",
        instrucao: "Veja a baixa estornada",
        explicacao:
          "A baixa continua embaixo da parcela, apagada, com quem estornou, quando e o motivo. A parcela 1 voltou " +
          "a VENCIDO, com o botão Baixar.",
        preenche: { "lista.p1.baixa": "estornada" },
      },
    ],
    eDepois: {
      texto:
        "O lançamento saiu da conta (confira na Tesouraria) e a parcela voltou a ficar em aberto. Agora registre a " +
        "baixa de novo, com a conta, o valor e a data certos: ela passa outra vez pela aprovação.",
      proximoRoteiro: "tratar-rejeitada",
    },
  }),

  roteiro({
    id: "tratar-rejeitada",
    titulo: "Quando uma baixa é rejeitada",
    quandoUsar:
      "Quando aparece no alto da tela o aviso de baixa rejeitada: quem aprova recusou uma baixa e escreveu o " +
      "motivo. É preciso lançar de novo do jeito certo ou, se o pagamento não aconteceu, dispensar o aviso.",
    quemPode: QUEM_BAIXA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.avisoRejeitadas",
        instrucao: "Clique em “Ver” no aviso",
        explicacao:
          "O aviso conta as baixas rejeitadas da filial que ninguém lançou de novo nem dispensou, de todas as " +
          "pessoas. O Ver deixa na lista só os títulos com rejeição; Limpar filtros mostra todos de novo.",
        preenche: { "lista.p1.baixa": "rejeitada" },
      },
      {
        ...ABRIR_TITULO,
        // O filtro do "Ver" continua aplicado nos passos seguintes (valoresAte acumula).
        preenche: {
          "lista.linhaExemplo": "expandida",
          "lista.p1.baixa": "rejeitada",
          "lista.filtro.rejeitadas": "1",
        },
      },
      {
        cena: "lista",
        alvo: "lista.p1.baixa",
        instrucao: "Leia o motivo da rejeição",
        explicacao:
          "A baixa rejeitada aparece embaixo da parcela com o selo “Rejeitada”, quem rejeitou, quando e o motivo. " +
          `No exemplo: “${EXEMPLO.baixa.motivoRejeicao}”.`,
        dica:
          "O pagamento aconteceu e só o registro estava errado? Clique em Baixar na parcela e lance de novo com o " +
          "valor, a data e a conta certos. A rejeição sai do aviso assim que a baixa nova é registrada.",
      },
      {
        cena: "lista",
        alvo: "lista.p1.dispensar",
        instrucao: "Se não há o que relançar, clique em “Dispensar”",
        explicacao:
          "Use quando a rejeição está certa e nada deve ser registrado: o pagamento não aconteceu, ou foi lançado " +
          "em outra parcela.",
      },
      {
        cena: "dispensar",
        alvo: "dispensa.motivo",
        instrucao: "Diga por que não vai lançar de novo",
        explicacao: "O motivo é obrigatório, com pelo menos 3 letras, e fica na baixa e na Auditoria.",
        preenche: { "dispensa.motivo": EXEMPLO.baixa.motivoDispensa },
      },
      {
        cena: "dispensar",
        alvo: "dispensa.confirmar",
        instrucao: "Clique em “Dispensar”",
        explicacao: "A parcela não muda: continua em aberto, com o botão Baixar.",
      },
      {
        cena: "lista",
        alvo: "lista.p1.baixa",
        instrucao: "Veja a rejeição dispensada",
        explicacao:
          "A baixa rejeitada continua embaixo da parcela, apagada e numa linha só, com quem dispensou e o motivo. " +
          "O aviso do alto da tela some.",
        preenche: { "lista.linhaExemplo": "expandida", "lista.p1.baixa": "dispensada" },
      },
    ],
    eDepois: {
      texto:
        "Rejeições resolvidas (lançadas de novo, dispensadas, ou de parcela paga, cancelada ou renegociada) ficam só " +
        "no histórico da parcela, numa linha apagada, e não contam no aviso.",
      proximoRoteiro: "mudar-vencimento",
    },
  }),

  roteiro({
    id: "mudar-vencimento",
    titulo: "Mudar o vencimento",
    quandoUsar: "Quando o fornecedor aceitou mudar a data de uma parcela, sem mudar o valor.",
    quemPode: QUEM_LANCA,
    passos: [
      ABRIR_TITULO,
      {
        cena: "lista",
        alvo: "lista.p3.vencimento",
        instrucao: "Troque a data no campo da parcela",
        explicacao:
          "Cada parcela em aberto tem um campo de data ao lado dos botões, já com o vencimento atual. Na parcela " +
          "3, troque 10/12/2026 por 20/12/2026.",
        preenche: { "lista.p3.vencimento": "20/12/2026" },
      },
      {
        cena: "lista",
        alvo: "lista.p3.alterar",
        instrucao: "Clique em “Alterar vencimento”",
        explicacao: "A nova data é gravada na hora.",
      },
    ],
    eDepois: {
      texto:
        "A parcela passa a vencer na nova data, e a projeção do fluxo de caixa já usa a data nova. O valor não " +
        "muda. Se o valor também mudou, ou se a parcela vai virar várias, use Renegociar.",
      proximoRoteiro: "renegociar",
    },
  }),

  roteiro({
    id: "renegociar",
    titulo: "Renegociar uma parcela vencida",
    quandoUsar:
      "Quando uma parcela venceu e foi combinado pagar de outro jeito: em mais vezes, com outro valor ou em outras " +
      "datas. O botão Renegociar só aparece em parcela vencida.",
    quemPode: QUEM_LANCA,
    passos: [
      ABRIR_TITULO,
      {
        cena: "lista",
        alvo: "lista.p2.renegociar",
        instrucao: "Clique em “Renegociar” na parcela vencida",
        explicacao:
          "No exemplo, a parcela 2, de R$ 1.000,00, venceu em 10/11/2026. Foi combinado pagar em duas vezes de " +
          "R$ 500,00.",
      },
      {
        cena: "renegociar",
        alvo: "reneg.parcela1",
        instrucao: "Preencha a primeira parcela nova",
        explicacao: "Vencimento e valor da primeira parte do acordo: 25/11/2026 e 500,00.",
        preenche: { "reneg.parcela1": "preenchida" },
      },
      {
        cena: "renegociar",
        alvo: "reneg.adicionar",
        instrucao: "Clique em “Adicionar nova parcela”",
        explicacao: "Cada clique cria mais uma linha. Uma linha para cada parcela nova do acordo.",
        preenche: { "reneg.parcela2": "vazia" },
      },
      {
        cena: "renegociar",
        alvo: "reneg.parcela2",
        instrucao: "Preencha a segunda parcela nova",
        explicacao:
          "25/12/2026 e 500,00. Se o acordo incluiu juros, as parcelas novas podem somar mais que a parcela " +
          "original.",
        preenche: { "reneg.parcela2": "preenchida" },
      },
      {
        cena: "renegociar",
        alvo: "reneg.confirmar",
        instrucao: "Clique em “Confirmar renegociação”",
        explicacao: "Antes de clicar, confira as datas e os valores: a renegociação não pode ser desfeita.",
      },
    ],
    eDepois: {
      texto:
        "A parcela original fica como RENEGOCIADO e não aceita mais baixa nem outra renegociação. As parcelas " +
        "novas entram no mesmo título, com os próximos números (no exemplo, 4 e 5), e são pagas normalmente pelo " +
        "botão Baixar.",
      proximoRoteiro: "cancelar-parcela",
    },
  }),

  roteiro({
    id: "cancelar-parcela",
    titulo: "Cancelar uma parcela",
    quandoUsar:
      "Quando uma parcela não vai mais ser paga: a compra foi desfeita, o fornecedor perdoou a dívida ou o título " +
      "foi lançado em dobro.",
    quemPode: QUEM_LANCA,
    passos: [
      ABRIR_TITULO,
      {
        cena: "lista",
        alvo: "lista.p3.cancelar",
        instrucao: "Clique em “Cancelar” na parcela",
        explicacao: "Atenção: o sistema não pergunta se você tem certeza. O clique já cancela a parcela.",
        dica:
          "Mudou só a data? Não cancele: use Alterar vencimento. Combinou pagar de outro jeito? Use Renegociar.",
      },
    ],
    eDepois: {
      texto:
        "A parcela fica como CANCELADO, sai da projeção do fluxo de caixa e não aceita mais baixa. O " +
        "cancelamento não pode ser desfeito: se foi por engano, cadastre um título novo com o valor da parcela.",
      proximoRoteiro: "encontrar-exportar",
    },
  }),

  roteiro({
    id: "encontrar-exportar",
    titulo: "Encontrar e exportar títulos",
    quandoUsar:
      "Para achar títulos numa lista grande ou tirar um relatório: o que vence este mês, o que está atrasado com " +
      "um fornecedor, tudo de uma categoria.",
    passos: [
      {
        cena: "lista",
        alvo: "lista.filtro.fornecedor",
        instrucao: "Escolha o fornecedor no filtro",
        explicacao:
          "A barra de filtros fica acima da lista. Cada filtro escolhido já atualiza a lista na hora: não há botão " +
          "de buscar.",
        preenche: { "lista.filtro.fornecedor": EXEMPLO.contraparte },
      },
      {
        cena: "lista",
        alvo: "lista.filtro.status",
        instrucao: "Escolha o status",
        explicacao:
          "VENCIDO mostra só os títulos que têm alguma parcela vencida. Os filtros se somam: agora a lista mostra " +
          "títulos da Agro Insumos com parcela vencida.",
        preenche: { "lista.filtro.status": "VENCIDO" },
      },
      {
        cena: "lista",
        alvo: "lista.filtro.vencimentoDe",
        instrucao: "Use o período de vencimento quando precisar",
        explicacao:
          "Vencimento de e Vencimento até limitam a lista a um intervalo de datas, como o mês que vem. Deixe em " +
          "branco para não limitar.",
      },
      {
        cena: "lista",
        alvo: "lista.tabela",
        instrucao: "Confira o resultado",
        explicacao:
          "A lista mostra só o que passou por todos os filtros. Se nada passar, aparece a mensagem “Nenhum título " +
          "encontrado para os filtros selecionados”.",
      },
      {
        cena: "lista",
        alvo: "lista.exportar",
        instrucao: "Exporte, se precisar de um arquivo",
        explicacao:
          "Exportar PDF gera um relatório pronto para imprimir ou enviar. CSV e Excel servem para fazer contas na " +
          "planilha. O arquivo tem uma linha por parcela e respeita os filtros escolhidos.",
      },
      {
        cena: "lista",
        alvo: "lista.filtro.limpar",
        instrucao: "Clique em “Limpar filtros” para voltar à lista completa",
        explicacao: "Todos os filtros voltam para “Todos” de uma vez.",
        preenche: { "lista.filtro.fornecedor": "", "lista.filtro.status": "" },
      },
    ],
    eDepois: {
      texto:
        "Os filtros ficam guardados no endereço da página. Dá para salvar nos favoritos do navegador uma busca que " +
        "você usa sempre, como “vencidas da Agro Insumos”.",
    },
  }),
];
