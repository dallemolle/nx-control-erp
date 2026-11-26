import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { BANCO, CAIXA, DIARIAS, SAQUE, SALDO, TARIFA } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_LANCA =
  "Quem pode: perfis Administrador e Tesouraria, com permissão de alteração na filial. Os perfis Financeiro, " +
  "Gestor, Auditor e Consulta só veem a tela, sem os botões.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "lancar-avulso",
    titulo: "Lançar uma entrada ou saída avulsa",
    quandoUsar:
      "Quando entrou ou saiu dinheiro de uma conta sem título por trás: tarifa do banco, rendimento de " +
      "aplicação, uma venda de sucata paga na hora. Se existe uma nota ou um boleto a pagar ou a receber, use " +
      "Contas a pagar ou Contas a receber, não este botão.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "painel",
        alvo: "painel.novoLancamento",
        instrucao: "Clique em “Novo lançamento”",
        explicacao: "O botão fica no alto da tela, à direita, e abre o formulário do lançamento.",
      },
      {
        cena: "lancamento",
        alvo: "lanc.conta",
        instrucao: "Escolha a conta bancária",
        explicacao:
          "É a conta em que o dinheiro entrou ou saiu. No exemplo, a tarifa de manutenção que o Banco do Brasil " +
          "cobrou na conta corrente.",
        dica:
          "Dinheiro em espécie vai na conta Caixa. Ela é uma conta como as outras na lista, cadastrada em " +
          "Cadastros → Contas bancárias.",
        preenche: { "lanc.conta": BANCO },
      },
      {
        cena: "lancamento",
        alvo: "lanc.tipo",
        instrucao: "Escolha o tipo: Entrada ou Saída",
        explicacao: "Entrada quando o dinheiro chegou na conta, Saída quando saiu. Tarifa é Saída.",
        preenche: { "lanc.tipo": "Saída" },
      },
      {
        cena: "lancamento",
        alvo: "lanc.valor",
        instrucao: "Digite o valor",
        explicacao:
          "Sempre positivo, sem R$ e sem ponto de milhar: 45,90. É o Tipo que diz se o dinheiro entrou ou saiu.",
        preenche: { "lanc.valor": TARIFA.valor },
      },
      {
        cena: "lancamento",
        alvo: "lanc.data",
        instrucao: "Informe a data",
        explicacao: "É o dia do movimento no extrato, não o dia em que você está lançando.",
        preenche: { "lanc.data": TARIFA.data },
      },
      {
        cena: "lancamento",
        alvo: "lanc.descricao",
        instrucao: "Escreva uma descrição",
        explicacao:
          "Aparece na lista de lançamentos e na Conciliação. Diga o que foi, de um jeito que outra pessoa entenda " +
          "depois.",
        preenche: { "lanc.descricao": TARIFA.descricao },
      },
      {
        cena: "lancamento",
        alvo: "lanc.classificacao",
        instrucao: "Confira a classificação",
        explicacao:
          "Fiscal (o padrão) quando existe documento oficial, Gerencial quando não tem nota. A tarifa aparece no " +
          "extrato do banco, que é documento: fica Fiscal.",
        preenche: { "lanc.classificacao": TARIFA.classificacao },
      },
      {
        cena: "lancamento",
        alvo: "lanc.comprovante",
        instrucao: "Escolha o comprovante",
        explicacao:
          "A lista muda conforme a classificação: em Gerencial aparecem Recibo, Pedido interno e Sem comprovante. " +
          "O número, logo abaixo, é opcional.",
        preenche: { "lanc.comprovante": TARIFA.comprovante },
      },
      {
        cena: "lancamento",
        alvo: "lanc.categoria",
        instrucao: "Escolha a categoria financeira",
        explicacao:
          "A categoria diz que tipo de receita ou despesa é esta, e é ela que agrupa o lançamento no fluxo de " +
          "caixa e no orçamento. O campo aceita “Nenhuma”, mas aí o lançamento fica sem categoria nesses " +
          "relatórios.",
        preenche: { "lanc.categoria": TARIFA.categoria },
      },
      {
        cena: "lancamento",
        alvo: "lanc.centroCusto",
        instrucao: "Escolha centro de custo, centro de lucro, safra e projeto, se servirem (opcionais)",
        explicacao: "Servem para separar os números nos relatórios. Deixe em “Nenhum” o que não se aplica.",
      },
      {
        cena: "lancamento",
        alvo: "lanc.salvar",
        instrucao: "Clique em Salvar",
        explicacao:
          "O lançamento entra na lista na hora. Se errar, dá para corrigir ou excluir depois pela própria lista " +
          "(roteiro “Corrigir ou excluir um lançamento”).",
      },
    ],
    eDepois: {
      texto:
        "O lançamento aparece na lista com a origem Manual, e o saldo contábil da conta muda na hora. Numa conta " +
        "de banco, ele espera o extrato na Conciliação para contar como realizado no fluxo de caixa. Numa conta " +
        "Caixa, já entra conciliado.",
      proximoRoteiro: "transferir",
    },
  }),

  roteiro({
    id: "transferir",
    titulo: "Transferir dinheiro entre contas",
    quandoUsar:
      "Quando o dinheiro só mudou de conta dentro da filial: um saque do banco para o caixa, uma TED entre duas " +
      "contas da fazenda, uma aplicação. Não é receita nem despesa, então não use dois lançamentos avulsos.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "painel",
        alvo: "painel.transferencia",
        instrucao: "Clique em “Transferência entre contas”",
        explicacao: "O botão fica no alto da tela, ao lado de Novo lançamento.",
      },
      {
        cena: "transferencia",
        alvo: "transf.origem",
        instrucao: "Escolha a conta de origem",
        explicacao: "É a conta de onde o dinheiro saiu. No exemplo, o saque no Banco do Brasil.",
        preenche: { "transf.origem": BANCO },
      },
      {
        cena: "transferencia",
        alvo: "transf.destino",
        instrucao: "Escolha a conta de destino",
        explicacao:
          "É a conta que recebeu o dinheiro: o Caixa, onde fica o dinheiro em espécie. Origem e destino precisam " +
          "ser contas diferentes.",
        preenche: { "transf.destino": CAIXA },
      },
      {
        cena: "transferencia",
        alvo: "transf.data",
        instrucao: "Informe a data e o valor",
        explicacao: "A data do saque no extrato e o valor sacado, sem R$ e sem ponto de milhar: 2000,00.",
        preenche: { "transf.data": SAQUE.data, "transf.valor": SAQUE.valor },
      },
      {
        cena: "transferencia",
        alvo: "transf.descricao",
        instrucao: "Escreva uma descrição",
        explicacao: "Diga para que foi a transferência. A mesma descrição vai nos dois lados.",
        preenche: { "transf.descricao": SAQUE.descricao },
      },
      {
        cena: "transferencia",
        alvo: "transf.salvar",
        instrucao: "Clique em Salvar",
        explicacao:
          "A transferência entra na lista como dois lançamentos. Se errar, Editar ou Excluir em qualquer um dos " +
          "dois lados corrige a transferência inteira.",
      },
    ],
    eDepois: {
      texto:
        "O sistema cria dois lançamentos com a origem Transferência: uma saída na conta de origem e uma entrada " +
        "na de destino, sem classificação Fiscal ou Gerencial. O lado da conta Caixa já entra conciliado; o lado " +
        "do banco espera o extrato na Conciliação.",
      proximoRoteiro: "conferir-saldo",
    },
  }),

  roteiro({
    id: "conferir-saldo",
    titulo: "Conferir o saldo com o extrato",
    quandoUsar:
      "Para saber se o sistema bate com o banco (ou com o dinheiro contado no caixa). Faça isso com frequência, " +
      "por exemplo toda semana: quanto mais cedo uma diferença aparece, mais fácil achar a causa.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "painel",
        alvo: "painel.cardCaixa",
        instrucao: "Veja o quadro de cada conta",
        explicacao:
          "Saldo contábil é o saldo inicial da conta mais todos os lançamentos dela no sistema, de qualquer data, " +
          "conciliados ou não. Quando alguém informou o saldo do banco, o quadro mostra também esse saldo e a " +
          "diferença entre os dois.",
      },
      {
        cena: "painel",
        alvo: "painel.informarSaldo",
        instrucao: "Clique em “Informar saldo bancário”",
        explicacao: "O botão fica no alto da tela, à direita.",
      },
      {
        cena: "saldo",
        alvo: "saldo.conta",
        instrucao: "Escolha a conta",
        explicacao: "A conta do extrato que você tem em mãos. Para o caixa, escolha a conta Caixa e conte o dinheiro.",
        preenche: { "saldo.conta": BANCO },
      },
      {
        cena: "saldo",
        alvo: "saldo.data",
        instrucao: "Informe a data e o saldo do extrato",
        explicacao:
          `O saldo final do dia no extrato: ${SALDO.informadoBanco} em ${SALDO.dataInformadoBanco}. Use o dia ` +
          "mais recente, com tudo até ele já lançado.",
        dica:
          "A diferença compara o saldo informado com o saldo contábil de hoje, que inclui lançamentos de qualquer " +
          "data. Se existir lançamento com data depois do dia informado, ele também entra na conta e a diferença " +
          "não fecha, mesmo com tudo certo.",
        preenche: { "saldo.data": SALDO.dataInformadoBanco, "saldo.valor": SALDO.informadoBanco },
      },
      {
        cena: "saldo",
        alvo: "saldo.salvar",
        instrucao: "Clique em Salvar",
        explicacao: "O saldo informado fica guardado. O quadro da conta mostra sempre o de data mais recente.",
      },
      {
        cena: "painel",
        alvo: "painel.diferencaBanco",
        instrucao: "Leia a diferença",
        explicacao:
          `Diferença é o saldo contábil menos o saldo informado: ${SALDO.contabilBanco} − ` +
          `${SALDO.informadoBancoFormatado} = ${SALDO.diferencaBanco}. Em vermelho, quando não é zero. Positiva: ` +
          "o sistema tem mais dinheiro que o banco, falta lançar alguma saída. Negativa: falta lançar alguma " +
          "entrada.",
        dica:
          "Onde procurar: tarifas e rendimentos ainda não lançados, baixas esperando em Aprovações pendentes, " +
          "repasses de cartão não confirmados ou um valor digitado errado. No exemplo, faltava lançar a tarifa de " +
          "R$ 45,90.",
        preenche: { "painel.cardBanco": "informado" },
      },
    ],
    eDepois: {
      texto:
        "Lance o que faltava (no exemplo, a tarifa, pelo roteiro “Lançar uma entrada ou saída avulsa”) e a " +
        "diferença vai a zero. Para ver linha a linha o que o banco tem e o sistema não, importe o extrato na " +
        "Conciliação.",
      proximoRoteiro: "ver-lancamentos",
    },
  }),

  roteiro({
    id: "ver-lancamentos",
    titulo: "Consultar e exportar os lançamentos",
    quandoUsar: "Para ver tudo o que entrou e saiu das contas da filial ou tirar um relatório para o contador.",
    passos: [
      {
        cena: "painel",
        alvo: "painel.tabela",
        instrucao: "Veja a lista de lançamentos",
        explicacao:
          "Todos os lançamentos das contas da filial, dos mais recentes para os mais antigos, com conta, tipo, " +
          "valor e descrição.",
      },
      {
        cena: "painel",
        alvo: "painel.origem",
        instrucao: "Repare na origem de cada um",
        explicacao:
          "Baixa: veio de um pagamento ou recebimento aprovado de um título (inclui vendas à vista e repasses de " +
          "cartão). Manual: lançado aqui, pelo Novo lançamento ou pela Conciliação. Transferência: um dos dois " +
          "lados de uma transferência entre contas.",
      },
      {
        cena: "painel",
        alvo: "painel.classificacao",
        instrucao: "Filtre por Fiscal ou Gerencial, se precisar",
        explicacao:
          "O seletor ao lado da exportação mostra só os lançamentos Fiscais ou só os Gerenciais. As " +
          "transferências não têm classificação e só aparecem em Todos.",
        preenche: { "painel.classificacao": "Fiscal" },
      },
      {
        cena: "painel",
        alvo: "painel.exportar",
        instrucao: "Exporte, se precisar de um arquivo",
        explicacao:
          "PDF para imprimir ou enviar; CSV e Excel para fazer contas na planilha. O arquivo respeita o filtro de " +
          "classificação escolhido.",
      },
    ],
    eDepois: {
      texto:
        "Lançou errado? Os lançamentos Manuais e as Transferências têm Editar e Excluir na própria linha. Para " +
        "conferir com o banco, use o roteiro “Conferir o saldo com o extrato”.",
      proximoRoteiro: "corrigir-lancamento",
    },
  }),

  roteiro({
    id: "corrigir-lancamento",
    titulo: "Corrigir ou excluir um lançamento",
    quandoUsar:
      "Quando um lançamento manual ou uma transferência foi salvo com conta, valor, data, descrição ou " +
      "classificação errados, ou nem deveria existir. Lançamentos de origem Baixa não aparecem com esses botões: " +
      "eles se corrigem estornando a baixa, em Contas a pagar ou a receber.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "painel",
        alvo: "painel.acoes",
        instrucao: "Na linha do lançamento, clique em Editar",
        explicacao:
          `No exemplo, as diárias da colheita foram lançadas como R$ ${DIARIAS.valorErrado}, mas foram ` +
          `R$ ${DIARIAS.valorCerto}. Numa transferência, Editar em qualquer um dos dois lados abre a ` +
          "transferência inteira.",
      },
      {
        cena: "editar",
        alvo: "editar.valor",
        instrucao: "Corrija o que estiver errado",
        explicacao:
          "Num lançamento ainda não conciliado, todos os campos podem mudar: conta, tipo, valor, data, " +
          "descrição, classificação, categoria, as dimensões e o comprovante. Num conciliado, veja o selo adiante.",
        preenche: { "editar.valor": DIARIAS.valorCerto },
      },
      {
        cena: "editar",
        alvo: "editar.salvar",
        instrucao: "Clique em Salvar",
        explicacao:
          "O saldo, o fluxo de caixa e o orçamento passam a usar o valor novo. A Auditoria guarda o antes e o " +
          "depois, com quem mudou e quando.",
      },
      {
        cena: "painel",
        alvo: "painel.conciliado",
        instrucao: "Repare no selo Conciliado",
        explicacao:
          "Ele aparece no lançamento que já foi ligado a uma linha do extrato. Num lançamento manual assim, só " +
          "mudam descrição, classificação, categoria, dimensões e comprovante. Numa transferência, só a " +
          "descrição. O Excluir fica desabilitado: conta, tipo, valor e data já foram confirmados pelo banco.",
        dica:
          "Se a conciliação estiver errada, desfaça-a na Conciliação (roteiro “Desfazer uma conciliação e " +
          "reprocessar pendentes”). O lançamento volta a ficar solto e pode ser corrigido ou excluído.",
      },
      {
        cena: "excluir",
        alvo: "excluir.motivo",
        instrucao: "Para excluir, clique em Excluir e escreva o motivo",
        explicacao: "O motivo é obrigatório. Numa transferência, os dois lados saem juntos.",
        preenche: { "excluir.motivo": DIARIAS.motivo },
      },
      {
        cena: "excluir",
        alvo: "excluir.confirmar",
        instrucao: "Confirme em Excluir",
        explicacao:
          "O lançamento sai da lista e dos relatórios. A Auditoria guarda o lançamento inteiro, quem excluiu, " +
          "quando e o motivo.",
      },
    ],
    eDepois: {
      texto:
        "Confira o saldo da conta no quadro do alto da tela. Se tinha informado o saldo do banco, a diferença já " +
        "considera a correção.",
      proximoRoteiro: "conferir-saldo",
    },
  }),
];
