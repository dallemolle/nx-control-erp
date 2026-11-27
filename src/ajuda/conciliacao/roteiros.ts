import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { CANDIDATO_SAQUE, CONTA, TARIFA } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_PODE =
  "Quem pode: perfis Administrador e Tesouraria, com permissão de alteração na filial. Os outros perfis só " +
  "consultam, sem os botões.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "importar-extrato",
    titulo: "Importar o extrato do banco",
    quandoUsar:
      "Sempre que quiser conferir uma conta com o banco: toda semana, ou no fim do mês. Conciliar é marcar que " +
      "cada movimento do extrato tem o seu lançamento no sistema. Só o que está conciliado conta como realizado " +
      "no fluxo de caixa.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.importar",
        instrucao: "Clique em “Importar extrato (OFX)”",
        explicacao: "O botão fica no alto da tela, à direita.",
        dica:
          "O arquivo OFX se baixa no internet banking, na tela do extrato, em “exportar” ou “salvar como”. " +
          "Escolha o formato OFX (às vezes chamado de Money).",
      },
      {
        cena: "importar",
        alvo: "imp.conta",
        instrucao: "Escolha a conta do extrato",
        explicacao:
          "A conta do banco de onde veio o arquivo. A conta Caixa não aparece: dinheiro em espécie não tem " +
          "extrato, e os lançamentos dela já entram conciliados.",
        preenche: { "imp.conta": CONTA },
      },
      {
        cena: "importar",
        alvo: "imp.arquivo",
        instrucao: "Escolha o arquivo OFX",
        explicacao: "Clique no campo e escolha o arquivo baixado do banco. O limite é de 2 MB.",
        preenche: { "imp.arquivo": "extrato-novembro.ofx" },
      },
      {
        cena: "importar",
        alvo: "imp.importar",
        instrucao: "Clique em “Importar e conciliar automaticamente”",
        explicacao:
          "O sistema lê o arquivo e, para cada linha, procura um lançamento da mesma conta, no mesmo sentido " +
          "(entrada ou saída), com o mesmo valor e até 3 dias de diferença na data. Achou exatamente um? Concilia " +
          "sozinho.",
      },
      {
        cena: "importar",
        alvo: "imp.resumo",
        instrucao: "Leia o resumo",
        explicacao:
          "Quantas linhas o arquivo tinha, quantas eram novas e quantas foram conciliadas sozinhas. Linhas já " +
          "importadas antes são ignoradas: pode importar um arquivo que se sobrepõe ao anterior sem duplicar nada.",
        preenche: { "imp.resumo": "mostrar" },
      },
    ],
    eDepois: {
      texto:
        "As linhas aparecem na lista. As que não foram conciliadas sozinhas ficam com outro status e esperam você: " +
        "veja o roteiro “Entender o status de cada linha”.",
      proximoRoteiro: "entender-status",
    },
  }),

  roteiro({
    id: "entender-status",
    titulo: "Entender o status de cada linha",
    quandoUsar: "Depois de importar o extrato, para saber o que fazer com cada linha que não foi conciliada.",
    passos: [
      {
        cena: "lista",
        alvo: "l1.status",
        instrucao: "Conciliado: nada a fazer",
        explicacao:
          "A linha já tem o seu lançamento. Na coluna Ações aparece a descrição dele (no exemplo, a baixa do adubo).",
      },
      {
        cena: "lista",
        alvo: "l4.status",
        instrucao: "Sugestão: escolha o lançamento certo",
        explicacao:
          "Havia mais de um lançamento possível, com o mesmo valor e data próxima, e o sistema não escolheu " +
          "sozinho. Veja o roteiro “Confirmar uma sugestão”.",
      },
      {
        cena: "lista",
        alvo: "l2.status",
        instrucao: "Não conciliado: falta o lançamento ou é um grupo",
        explicacao:
          "Nenhum lançamento bate. Ou o movimento ainda não foi lançado (uma tarifa, uma baixa que ninguém " +
          "registrou), ou ele corresponde a vários lançamentos juntos, como o depósito da operadora de cartão.",
        dica:
          "Outros status: Divergência de valor (há um lançamento com data próxima e valor diferente; se ele foi " +
          "digitado errado, corrija o valor na Tesouraria, e se a diferença é real, use Conciliar em grupo com " +
          "“Lançar a diferença”), Divergência de data (mesmo valor, mas mais de 3 dias de diferença) e Duplicado " +
          "(o lançamento igual já está conciliado com outra linha: confira se a linha não veio repetida no extrato).",
      },
      {
        cena: "lista",
        alvo: "lista.filtroStatus",
        instrucao: "Filtre pelo status para trabalhar por partes",
        explicacao: "O filtro acima da lista mostra só as linhas de um status. A exportação respeita o filtro.",
        preenche: { "lista.filtroStatus": "Não conciliado" },
      },
    ],
    eDepois: {
      texto:
        "Resolva as linhas pendentes com Confirmar (Sugestão e Divergência de data), Conciliar em grupo (um " +
        "movimento com vários lançamentos, ou uma diferença real como uma tarifa) ou Criar lançamento (o que ainda " +
        "não foi lançado).",
      proximoRoteiro: "confirmar-sugestao",
    },
  }),

  roteiro({
    id: "confirmar-sugestao",
    titulo: "Confirmar uma sugestão",
    quandoUsar:
      "Quando a linha está como Sugestão ou Divergência de data e você sabe qual lançamento é o dela. O " +
      "lançamento precisa ter o mesmo valor da linha.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "l4.selecionar",
        instrucao: "Escolha o lançamento na caixa da linha",
        explicacao:
          "A caixa lista os lançamentos da mesma conta, no mesmo sentido, com o mesmo valor da linha e até 30 " +
          "dias de diferença, que ainda não foram conciliados. No exemplo, o saque de R$ 2.000,00 é a " +
          "transferência para o caixa.",
        dica:
          "Se só existe lançamento com valor diferente, a caixa não aparece; quando ele tem data até 3 dias da " +
          "linha, a linha mostra um aviso com o lançamento encontrado. Se ele foi digitado errado, corrija o " +
          "valor na Tesouraria (lançamento de baixa: estorne a baixa e registre de novo) e volte para " +
          "confirmar; se a diferença é real (uma tarifa, juros), use Conciliar em grupo com “Lançar a diferença”.",
        preenche: { "l4.selecionar": CANDIDATO_SAQUE },
      },
      {
        cena: "lista",
        alvo: "l4.confirmar",
        instrucao: "Clique em Confirmar",
        explicacao: "A linha fica Conciliado na hora, sem pergunta de confirmação.",
      },
    ],
    eDepois: {
      texto: "A linha e o lançamento ficam conciliados. Se escolheu o lançamento errado, use Desconciliar na linha.",
      proximoRoteiro: "conciliar-grupo",
    },
  }),

  roteiro({
    id: "conciliar-grupo",
    titulo: "Conciliar um depósito com vários lançamentos",
    quandoUsar:
      "Quando um movimento do extrato corresponde a vários lançamentos (o depósito da operadora de cartão, um PIX " +
      "que pagou duas parcelas) ou vários movimentos correspondem a um lançamento.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "l2.grupo",
        instrucao: "Clique em “Conciliar em grupo” na linha",
        explicacao:
          "No exemplo, o crédito de R$ 1.462,50 da Cartões Rurais, que paga dois repasses já descontada a taxa.",
      },
      {
        cena: "grupo",
        alvo: "grupo.linhas",
        instrucao: "Marque outras linhas do extrato, se fizerem parte",
        explicacao:
          "A linha em que você clicou já vem marcada. Marque outras só quando vários movimentos do banco formam um " +
          "pagamento só. No exemplo, não precisa.",
      },
      {
        cena: "grupo",
        alvo: "grupo.lancamentos",
        instrucao: "Marque os lançamentos que formam o movimento",
        explicacao:
          "A lista traz os lançamentos ainda não conciliados da conta, até 30 dias antes ou depois. Entradas " +
          "aparecem com +, saídas com −. Para o depósito do cartão: as duas entradas do bruto (R$ 500,00 e " +
          "R$ 1.000,00) e as duas saídas da taxa (R$ 7,50 e R$ 30,00).",
        dica:
          "A descrição de cada lançamento de baixa diz o documento, o cliente ou fornecedor e a parcela: o bruto " +
          "traz o pedido (PV-41) e a taxa, “Taxa PV-41” com a operadora.",
        preenche: { "grupo.lancamentos": "marcados" },
      },
      {
        cena: "grupo",
        alvo: "grupo.totais",
        instrucao: "Confira a diferença",
        explicacao:
          "A caixa soma os dois lados: 500 + 1.000 − 7,50 − 30 = 1.462,50, igual à linha. Só dá para conciliar " +
          "com diferença zero, centavo a centavo.",
        dica:
          "Sobrou uma diferença pequena, como uma tarifa que o banco descontou? Marque “Lançar a diferença” e " +
          "preencha descrição e categoria: o sistema cria o lançamento que falta e concilia tudo junto.",
      },
      {
        cena: "grupo",
        alvo: "grupo.conciliar",
        instrucao: "Clique em Conciliar",
        explicacao: "O botão só fica ativo quando a diferença é zero ou quando “Lançar a diferença” está marcado.",
      },
    ],
    eDepois: {
      texto:
        "A linha fica Conciliado, e a coluna Ações mostra o grupo: quantas linhas e quais lançamentos. Os quatro " +
        "lançamentos passam a contar como realizados no fluxo de caixa.",
      proximoRoteiro: "criar-lancamento",
    },
  }),

  roteiro({
    id: "criar-lancamento",
    titulo: "Criar o lançamento que falta",
    quandoUsar:
      "Quando o extrato tem um movimento que ninguém lançou e que não vem de título: tarifa, rendimento, IOF. " +
      "Se for o pagamento ou o recebimento de um título, não crie aqui: registre a baixa em Contas a pagar ou a " +
      "receber, aprove e volte para conciliar. Senão a parcela continua em aberto.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "l3.criar",
        instrucao: "Clique em “Criar lançamento” na linha",
        explicacao:
          "No exemplo, a tarifa de R$ 45,90 que o banco cobrou. Data, valor, conta e sentido vêm da própria " +
          "linha: você só completa o resto.",
      },
      {
        cena: "criar",
        alvo: "criar.descricao",
        instrucao: "Escreva a descrição",
        explicacao: "Diga o que foi, de um jeito que outra pessoa entenda depois.",
        preenche: { "criar.descricao": TARIFA.descricao },
      },
      {
        cena: "criar",
        alvo: "criar.classificacao",
        instrucao: "Escolha a classificação e o comprovante",
        explicacao:
          "Fiscal (o padrão) quando existe documento oficial. Tarifa aparece no extrato, então fica Fiscal, com o " +
          "comprovante Tarifa bancária.",
        preenche: { "criar.classificacao": TARIFA.classificacao, "criar.comprovante": TARIFA.comprovante },
      },
      {
        cena: "criar",
        alvo: "criar.categoria",
        instrucao: "Escolha a categoria e, se servirem, centro, safra e projeto",
        explicacao: "A categoria agrupa o lançamento no fluxo de caixa e no orçamento.",
        preenche: { "criar.categoria": TARIFA.categoria },
      },
      {
        cena: "criar",
        alvo: "criar.salvar",
        instrucao: "Clique em Salvar",
        explicacao: "O lançamento é criado já conciliado com a linha.",
      },
    ],
    eDepois: {
      texto:
        "O lançamento aparece na Tesouraria com a origem Manual e o selo Conciliado, e a linha fica Conciliado. " +
        "Descrição, classificação, categoria, dimensões e comprovante podem ser corrigidos depois na " +
        "Tesouraria; para mudar conta, tipo, valor ou data, ou excluir, desfaça a conciliação antes.",
      proximoRoteiro: "desconciliar",
    },
  }),

  roteiro({
    id: "desconciliar",
    titulo: "Desfazer uma conciliação e reprocessar pendentes",
    quandoUsar:
      "Quando uma linha foi conciliada com o lançamento errado, ou quando você lançou depois da importação algo " +
      "que faltava e quer que o sistema tente conciliar de novo.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "l1.desconciliar",
        instrucao: "Clique em Desconciliar na linha",
        explicacao:
          "A linha volta para Não conciliado e o lançamento fica livre de novo. Se a linha faz parte de um grupo, " +
          "o sistema avisa e desfaz o grupo inteiro.",
        dica:
          "O lançamento não é apagado, nem o criado pela linha ou pela diferença do grupo. Para conciliar de " +
          "novo, escolha esse mesmo lançamento: não crie outro.",
      },
      {
        cena: "lista",
        alvo: "lista.reconciliar",
        instrucao: "Clique em “Reconciliar pendentes”",
        explicacao:
          "O sistema tenta de novo a conciliação automática em todas as linhas ainda não conciliadas das contas " +
          "da filial (Não conciliado, Sugestão, Divergência e Duplicado), e avisa quantas conseguiu e quantas " +
          "mudaram de situação. Use depois de aprovar uma baixa, confirmar um repasse ou corrigir um lançamento.",
        dica:
          "Só concilia sozinho quando há um único lançamento com o mesmo valor a até 3 dias. Se houver dois ou " +
          "mais, a linha fica como Sugestão e você escolhe o lançamento na própria linha.",
      },
    ],
    eDepois: {
      texto: "Repita até não sobrar linha pendente. Uma conta com tudo conciliado tem o realizado igual ao extrato.",
    },
  }),
];
