import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import type { ALVOS } from "./alvos";
import { CITADOS, CLIENTES, CONTA_RECEBIMENTO, MAQUININHA, MOTIVO_127, OPERADORA, PARCELAS_131 } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_LANCA =
  "Quem pode: perfis Administrador, Financeiro e Vendas, com permissão de alteração na filial. O perfil Vendas lança " +
  "sem acessar o financeiro.";

const QUEM_VE = "Quem vê: todos os perfis. A tela mostra só a filial atual.";

const QUEM_CANCELA =
  "Quem pode: perfis Administrador e Financeiro, com permissão de alteração na filial. Para os outros, o botão " +
  "“Cancelar pedido” não aparece.";

const [PARCELA_1, PARCELA_2] = PARCELAS_131;
const repasse = CITADOS.repasse;

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "lancar-a-vista",
    titulo: "Lançar um pedido à vista",
    quandoUsar:
      "Quando o cliente paga na hora, em Pix, transferência ou dinheiro. O pedido baixa o estoque do lote, cria a " +
      "conta a receber já paga e, se for o caso, a entrega.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.novo",
        instrucao: "Clique em “Novo pedido”",
        explicacao: "O botão fica no alto da tela de Pedidos, à direita.",
      },
      {
        cena: "novo",
        alvo: "novo.data",
        instrucao: "Confira a data",
        explicacao:
          "Já vem com o dia de hoje. É a data da venda: decide se um lote está vencido, conta os prazos das parcelas e " +
          "é a data do recebimento à vista.",
        preenche: { "novo.data": "21/11/2026" },
      },
      {
        cena: "novo",
        alvo: "novo.cliente",
        instrucao: "Escolha o cliente",
        explicacao:
          "Ao escolher, o canal, a classificação, o “Retira na propriedade” e o endereço de entrega vêm do cadastro do " +
          "cliente. Tudo isso pode ser mudado só neste pedido.",
        preenche: { "novo.cliente": CLIENTES.acaiDaVila.nome },
      },
      {
        cena: "novo",
        alvo: "novo.canal",
        instrucao: "Confira o canal",
        explicacao: "O tipo de cliente (batedor, varejo, atacado...). É ele que separa as vendas por canal nos relatórios.",
      },
      {
        cena: "novo",
        alvo: "novo.forma",
        instrucao: "Escolha a forma de pagamento",
        explicacao:
          "Dinheiro, Pix, Transferência, Maquininha (cartão ou Pix) ou A prazo. As três primeiras são à vista: o " +
          "pedido já sai pago.",
        preenche: { "novo.forma": "Transferência" },
      },
      {
        cena: "novo",
        alvo: "novo.conta",
        instrucao: "Confira a conta de recebimento",
        explicacao:
          "É a conta onde o dinheiro entrou. A padrão já vem marcada (Administração → Configuração de produção). Em " +
          "dinheiro, o campo vira “Conta Caixa” e mostra só as contas do tipo Caixa.",
        preenche: { "novo.conta": CONTA_RECEBIMENTO },
      },
      {
        cena: "novo",
        alvo: "novo.classificacao",
        instrucao: "Confira a classificação",
        explicacao:
          "Gerencial para venda sem nota; Fiscal para venda com nota, e aí aparece o campo “Nº da nota fiscal”. O " +
          "documento da conta a receber é o nº da nota ou, sem nota, “PV-” e o número do pedido.",
      },
      {
        cena: "novo",
        alvo: "novo.entrega",
        instrucao: "Confira a entrega",
        explicacao:
          "A Açaí da Vila não retira na propriedade, então o pedido mostra a data prevista (a do pedido) e o endereço " +
          "do cadastro. Marque “Retira na propriedade” quando o cliente buscar: aí o pedido não gera entrega.",
      },
      {
        cena: "lotes",
        alvo: "lotes.lista",
        instrucao: "Abra a lista de lotes",
        explicacao:
          "Aparecem só os lotes com saldo, na ordem de saída: vence primeiro, sai primeiro. Cada linha mostra o código, " +
          "o produto, o saldo e a validade.",
      },
      {
        cena: "lotes",
        alvo: "lotes.vencido",
        instrucao: "Lote vencido não sai",
        explicacao:
          "Um lote com validade anterior à data do pedido aparece com “VENCIDO · sem liberação”. Se for escolhido, o " +
          "pedido avisa “Lote vencido: peça a liberação ao gestor na tela de Estoque” e não salva.",
      },
      {
        cena: "lotes",
        alvo: "lotes.liberado",
        instrucao: "A não ser que o gestor tenha liberado",
        explicacao:
          "O FC-261117-01 também venceu, mas o gestor o liberou até 21/11 na tela de Estoque: a lista já mostra " +
          "“VENCIDO · liberado até 21/11/2026”, e ele sai. A liberação vale pela data do pedido: mudando a data, o " +
          "rótulo acompanha. O pedido grava o motivo da liberação no item.",
      },
      {
        cena: "novo",
        alvo: "novo.lote",
        instrucao: "Escolha o lote",
        explicacao:
          "O preço por kg já vem preenchido com o preço de referência do produto (Cadastros → Produtos): aqui, R$ 18,00.",
        preenche: { "novo.lote": "AGC-261120-01" },
      },
      {
        cena: "novo",
        alvo: "novo.quantidade",
        instrucao: "Informe a quantidade",
        explicacao:
          "Em kg. Se o produto tiver unidade comercial (rasa, caixa...), aparece o campo Unidade para lançar nela; o " +
          "pedido converte para kg. A quantidade não pode passar do saldo do lote (aqui, 299 kg).",
        preenche: { "novo.quantidade": "120" },
      },
      {
        cena: "novo",
        alvo: "novo.preco",
        instrucao: "Confira o preço combinado",
        explicacao: "O preço de referência é só uma sugestão. Com a Açaí da Vila, o combinado é R$ 20,00/kg.",
        dica: "Esquecer de trocar o preço sugerido foi o erro do pedido 127. Veja o roteiro “Corrigir um pedido”.",
        preenche: { "novo.preco": "20" },
      },
      {
        cena: "novo",
        alvo: "novo.calculo",
        instrucao: "Veja o valor, o custo e a margem do item",
        explicacao:
          `Valor ${formatarMoeda(CITADOS.valor128)} (120 kg × R$ 20,00). O custo vem do lote: R$ 7,52/kg, o custo da ` +
          `polpa calculado na OP, dá ${formatarMoeda(CITADOS.custo128)}. A margem é a diferença: ` +
          `${formatarMoeda(CITADOS.margem128)}.`,
      },
      {
        cena: "novo",
        alvo: "novo.adicionar",
        instrucao: "Mais de um lote? Adicione um item",
        explicacao:
          "Cada lote é um item, com a própria quantidade e o próprio preço. O mesmo lote não pode aparecer duas vezes " +
          "no pedido.",
      },
      {
        cena: "novo",
        alvo: "novo.totais",
        instrucao: "Confira os totais",
        explicacao: "Total, custo, margem e margem % do pedido. O total é o valor da conta a receber.",
      },
      {
        cena: "novo",
        alvo: "novo.salvar",
        instrucao: "Clique em “Salvar pedido”",
        explicacao:
          "O pedido recebe o próximo número da filial (128), tira os 120 kg do lote, cria a conta a receber PV-128 com " +
          "o recebimento já registrado na conta escolhida e cria a entrega pendente. O sistema abre o pedido.",
      },
      {
        cena: "pedido",
        alvo: "pedido.pagamento",
        instrucao: "Confira o pagamento",
        explicacao:
          "Pago: a parcela única venceu e foi recebida no dia do pedido, e o valor já entra no fluxo de caixa. Em " +
          "dinheiro, entra na conta Caixa e não precisa de conciliação.",
        preenche: { "pedido.cabecalho": "128", "pedido.entrega": "Pendente" },
      },
      {
        cena: "pedido",
        alvo: "pedido.entrega",
        instrucao: "Confira a entrega",
        explicacao: "Pendente, com a data prevista e o endereço. Quem faz a entrega marca o andamento na tela Entregas.",
      },
    ],
    eDepois: {
      texto:
        "O lote AGC-261120-01 ficou com 179 kg, e a venda aparece na Rastreabilidade do lote. A entrega é " +
        "acompanhada em Vendas → Entregas.",
      proximoRoteiro: "lancar-a-prazo",
    },
  }),

  roteiro({
    id: "lancar-a-prazo",
    titulo: "Lançar um pedido a prazo",
    quandoUsar:
      "Quando o cliente vai pagar depois, numa ou em várias parcelas. O pedido cria a conta a receber em aberto, e o " +
      "financeiro registra cada pagamento quando ele chegar.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "novo",
        alvo: "novo.cliente",
        instrucao: "Comece como no pedido à vista",
        explicacao:
          "“Novo pedido”, confira a data e escolha o cliente. A Sorveteria Polar é do canal Varejo / mercado e recebe " +
          "a polpa no endereço do cadastro.",
        preenche: { "novo.data": "22/11/2026", "novo.cliente": CLIENTES.polar.nome },
      },
      {
        cena: "novo",
        alvo: "novo.forma",
        instrucao: "Escolha “A prazo”",
        explicacao: "No lugar da conta de recebimento aparece o campo Prazos: nada é recebido agora.",
        preenche: { "novo.forma": "A prazo" },
      },
      {
        cena: "novo",
        alvo: "novo.lote",
        instrucao: "Escolha o lote",
        explicacao:
          "O AMC-261120-01/1 é a parte da polpa média que foi transferida para a Câmara da loja. O preço sugerido é " +
          "R$ 12,00/kg.",
        preenche: { "novo.lote": "AMC-261120-01/1" },
      },
      {
        cena: "novo",
        alvo: "novo.quantidade",
        instrucao: "Informe a quantidade e o preço",
        explicacao: `50 kg a R$ 14,00/kg, o preço combinado: ${formatarMoeda(CITADOS.valor131)}.`,
        preenche: { "novo.quantidade": "50", "novo.preco": "14" },
      },
      {
        cena: "novo",
        alvo: "novo.prazos",
        instrucao: "Informe os prazos em dias",
        explicacao:
          "Dias desde a data do pedido, separados por barra e crescentes: “14/28” são duas parcelas, em 14 e em 28 " +
          "dias. 0 = no dia. Até 60 parcelas.",
        preenche: { "novo.prazos": "14/28" },
      },
      {
        cena: "novo",
        alvo: "novo.parcelas",
        instrucao: "Confira as parcelas",
        explicacao:
          `O pedido divide o total igualmente: ${PARCELA_1.vencimento} e ${PARCELA_2.vencimento}, ` +
          `${formatarMoeda(PARCELA_1.valor)} cada. Quando a divisão não é exata, os centavos que sobram vão para a ` +
          "última parcela.",
      },
      {
        cena: "novo",
        alvo: "novo.parcela1",
        instrucao: "Ajuste uma parcela, se precisar",
        explicacao:
          "O vencimento e o valor de cada parcela podem ser mudados antes de salvar. Aqui, a 1ª passou para R$ 400,00.",
        dica: "Mudar os prazos, a data ou os itens gera as parcelas de novo e desfaz os ajustes.",
        preenche: { "novo.parcela1": "400.00" },
      },
      {
        cena: "novo",
        alvo: "novo.somaParcelas",
        instrucao: "A soma tem que bater com o total",
        explicacao:
          "Se não bater, a linha fica vermelha com o que falta ou sobra (aqui, sobram R$ 50,00) e o pedido não salva. " +
          "Acerte a outra parcela ou volte ao valor de antes.",
      },
      {
        cena: "novo",
        alvo: "novo.parcela1",
        instrucao: "Volte a 1ª parcela para R$ 350,00",
        explicacao:
          "A soma volta a dar o total e o botão de salvar é liberado. Se você mudar um vencimento, o pedido grava a " +
          "condição pelos dias de cada um (de 28 para 30, fica “14/30”).",
        preenche: { "novo.parcela1": "350.00" },
      },
      {
        cena: "novo",
        alvo: "novo.entrega",
        instrucao: "Confira a entrega",
        explicacao: "A data prevista pode ser mudada para outro dia, mas não para antes da data do pedido.",
      },
      {
        cena: "novo",
        alvo: "novo.salvar",
        instrucao: "Clique em “Salvar pedido”",
        explicacao:
          "O pedido 131 tira os 50 kg do lote, cria a conta a receber PV-131 com as duas parcelas em aberto e a " +
          "entrega pendente.",
      },
      {
        cena: "pedido",
        alvo: "pedido.pagamento",
        instrucao: "Confira o pagamento",
        explicacao:
          "Em aberto, com as duas parcelas. Se uma parcela passar do vencimento sem pagamento, o pedido passa a " +
          "mostrar “Vencido”.",
        preenche: { "pedido.cabecalho": "131", "pedido.entrega": "Pendente" },
      },
    ],
    eDepois: {
      texto:
        "Quando a Sorveteria Polar pagar, o financeiro registra o recebimento em Financeiro → Contas a receber, na " +
        "conta a receber PV-131. O pedido passa a Pago quando todas as parcelas forem pagas.",
      proximoRoteiro: "vender-maquininha",
    },
  }),

  roteiro({
    id: "vender-maquininha",
    titulo: "Vender na maquininha (cartão ou Pix)",
    quandoUsar:
      "Quando o cliente paga no cartão ou no Pix lido pela maquininha. Quem paga a venda passa a ser a operadora, que " +
      "deposita o valor menos a taxa. Neste exemplo o pedido é só simulado: não é salvo.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "novo",
        alvo: "novo.cliente",
        instrucao: "Comece como no pedido à vista",
        explicacao:
          "“Novo pedido”, a data e o cliente. Para quem compra sem cadastro, use um cliente “Clientes diversos”, sem " +
          "CNPJ/CPF.",
        preenche: { "novo.data": MAQUININHA.data, "novo.cliente": MAQUININHA.cliente.nome },
      },
      {
        cena: "novo",
        alvo: "novo.forma",
        instrucao: "Escolha “Maquininha (cartão ou Pix)”",
        explicacao:
          "Aparecem a Operadora e a Modalidade. O Pix lido direto na chave da conta da empresa não passa pela " +
          "maquininha: continua sendo a forma Pix.",
        preenche: { "novo.forma": "Maquininha (cartão ou Pix)" },
      },
      {
        cena: "novo",
        alvo: "novo.operadora",
        instrucao: "Escolha a operadora",
        explicacao:
          "A dona da maquininha, cadastrada em Cadastros → Operadoras de cartão com as taxas e os prazos. Com uma " +
          "única operadora ativa, ela já vem escolhida.",
        preenche: { "novo.operadora": OPERADORA.nome },
      },
      {
        cena: "novo",
        alvo: "novo.modalidade",
        instrucao: "Escolha a modalidade",
        explicacao:
          "Débito, crédito à vista, crédito parcelado ou Pix na maquininha: aparecem só as que a operadora tem " +
          "cadastradas.",
        preenche: { "novo.modalidade": "Crédito parcelado" },
      },
      {
        cena: "novo",
        alvo: "novo.parcelasCartao",
        instrucao: "Escolha o número de parcelas",
        explicacao: "Só no parcelado. A lista vai até onde a operadora tem condição cadastrada (aqui, de 2x a 6x).",
        preenche: { "novo.parcelasCartao": `${MAQUININHA.parcelas}x` },
      },
      {
        cena: "novo",
        alvo: "novo.quantidade",
        instrucao: "Lance os itens como sempre",
        explicacao: `Aqui, 30 kg do AMC-261120-01 a R$ 15,00/kg: ${formatarMoeda(CITADOS.totalMaquininha)}.`,
        preenche: {
          "novo.lote": MAQUININHA.lote,
          "novo.quantidade": String(MAQUININHA.quantidadeKg),
          "novo.preco": String(MAQUININHA.precoKg),
        },
      },
      {
        cena: "novo",
        alvo: "novo.repasses",
        instrucao: "Confira os repasses previstos",
        explicacao:
          `A taxa da operadora no crédito parcelado é de 4%: ${formatarMoeda(repasse.taxa * 2)} sobre ` +
          `${formatarMoeda(CITADOS.totalMaquininha)}. Sem antecipação, há um repasse por parcela: o 1º em ` +
          `${repasse.datas[0]} (a data do pedido mais o prazo de 30 dias) e os seguintes de 30 em 30 dias, cada um com ` +
          `bruto de ${formatarMoeda(repasse.bruto)}, taxa de ${formatarMoeda(repasse.taxa)} e líquido de ` +
          `${formatarMoeda(repasse.liquido)}.`,
        dica: "No débito, no crédito à vista, no Pix e no parcelado antecipado, o repasse é um só.",
      },
      {
        cena: "novo",
        alvo: "novo.salvar",
        instrucao: "O que acontece ao salvar",
        explicacao:
          "A conta a receber sai em nome da operadora, com uma parcela por repasse (o valor bruto), e a taxa vira uma " +
          "conta a pagar “Taxa PV-” e o número do pedido, nas mesmas datas. Nada é recebido na hora: o pedido fica " +
          "“Aguardando repasse”.",
        dica:
          "Se a operadora não tiver condição para a modalidade ou as parcelas escolhidas, o pedido avisa em vermelho e " +
          "não salva.",
      },
    ],
    eDepois: {
      texto:
        "Quando o dinheiro cair na conta, confirme cada repasse em Financeiro → Repasses de cartão (essa tela tem " +
        "ajuda própria). Repasse que passa da data sem confirmação aparece como “Repasse atrasado” no pedido.",
    },
  }),

  roteiro({
    id: "consultar-pedidos",
    titulo: "Consultar e exportar os pedidos",
    quandoUsar: "Para achar um pedido, ver quanto falta receber ou mandar a lista de vendas para alguém.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.filtros",
        instrucao: "Escolha o período",
        explicacao:
          "Abre no mês atual, pela data do pedido. Também dá para filtrar por cliente, status e pagamento. A lista " +
          "muda assim que você troca um filtro; “Limpar filtros” volta ao padrão.",
      },
      {
        cena: "lista",
        alvo: "lista.tabela",
        instrucao: "Leia a lista",
        explicacao:
          "Do pedido mais recente para o mais antigo, com cliente, canal, forma, valor e margem (o valor menos o custo " +
          "dos lotes) e, entre parênteses, a margem %.",
      },
      {
        cena: "lista",
        alvo: "lista.cancelado",
        instrucao: "Pedido cancelado fica na lista, em cinza",
        explicacao:
          "Com a marca “Cancelado”. Pare o mouse sobre ela para ver o motivo. Ele não entra no total nem nos " +
          "relatórios de venda.",
      },
      {
        cena: "lista",
        alvo: "lista.pagamento",
        instrucao: "Veja a situação do pagamento",
        explicacao:
          "Lida da conta a receber: Pago, Em aberto, Vencido (alguma parcela passou do vencimento) ou Cancelado. Na " +
          "maquininha, “Aguardando repasse” ou “Repasse atrasado”.",
      },
      {
        cena: "lista",
        alvo: "lista.entrega",
        instrucao: "Veja a entrega",
        explicacao: "O status da entrega (Pendente, Em rota, Entregue, Cancelada) ou “Retira”, quando o cliente busca.",
      },
      {
        cena: "lista",
        alvo: "lista.rodape",
        instrucao: "Confira o total dos confirmados",
        explicacao:
          `Soma só os pedidos confirmados, sem os cancelados: em novembro, 3 pedidos, ` +
          `${formatarMoeda(CITADOS.totalConfirmados)} de valor e ${formatarMoeda(CITADOS.custoConfirmados)} de custo, ` +
          "o mesmo faturamento do Painel de produção.",
      },
      {
        cena: "lista",
        alvo: "lista.situacao",
        instrucao: "Ache o que falta receber",
        explicacao: "Pagamento → Em aberto deixa só os pedidos com parcelas a receber: no exemplo, o 131.",
        preenche: { "lista.situacao": "Em aberto" },
      },
      {
        cena: "lista",
        alvo: "lista.exportar",
        instrucao: "Exporte a lista",
        explicacao: "CSV, Excel ou PDF com os filtros escolhidos.",
      },
    ],
    eDepois: {
      texto:
        "As vendas por cliente, canal e produto, com o saldo a receber de cada cliente, estão no Relatório de vendas " +
        "(Produção → Relatórios).",
      proximoRoteiro: "abrir-pedido",
    },
  }),

  roteiro({
    id: "abrir-pedido",
    titulo: "Abrir um pedido e imprimir o recibo",
    quandoUsar: "Para ver os detalhes de uma venda, conferir o pagamento e a entrega ou mandar o recibo ao cliente.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.numero",
        instrucao: "Clique no número do pedido",
        explicacao: "Abre o pedido.",
      },
      {
        cena: "pedido",
        alvo: "pedido.cabecalho",
        instrucao: "Confira o pedido",
        explicacao: "Número, data e cliente. “Pedidos”, em cima, volta para a lista.",
        preenche: { "pedido.cabecalho": "128" },
      },
      {
        cena: "pedido",
        alvo: "pedido.dados",
        instrucao: "Veja os dados da venda",
        explicacao:
          "Canal, forma de pagamento, a conta onde entrou o dinheiro (a prazo, a condição em dias), a classificação e " +
          "quem lançou.",
      },
      {
        cena: "pedido",
        alvo: "pedido.itens",
        instrucao: "Veja os itens",
        explicacao: "Cada lote vendido, com kg, preço, valor, custo e margem, e o total com a margem %.",
      },
      {
        cena: "pedido",
        alvo: "pedido.lote",
        instrucao: "Clique no lote para rastrear",
        explicacao:
          "Abre a Rastreabilidade do lote: de que OP e de que fruto ele veio e para quem mais foi vendido.",
      },
      {
        cena: "pedido",
        alvo: "pedido.pagamento",
        instrucao: "Veja o pagamento",
        explicacao: "A situação, o documento da conta a receber e cada parcela, com vencimento, valor e situação.",
      },
      {
        cena: "pedido",
        alvo: "pedido.verReceber",
        instrucao: "Vá para a conta a receber",
        explicacao:
          "Abre Contas a receber filtrada pelo cliente. O link aparece só para quem acessa o financeiro. Na " +
          "maquininha, o link é “Ver em Repasses de cartão”.",
      },
      {
        cena: "pedido",
        alvo: "pedido.entrega",
        instrucao: "Veja a entrega",
        explicacao: "Status, data prevista, data em que foi entregue, endereço, responsável e quem recebeu.",
      },
      {
        cena: "pedido",
        alvo: "pedido.acoesEntrega",
        instrucao: "Atualize a entrega, se precisar",
        explicacao:
          "Os mesmos botões da tela Entregas: Em rota, Entregue (com a data e quem recebeu) e Editar. Entregue, só " +
          "sobra o Editar.",
      },
      {
        cena: "pedido",
        alvo: "pedido.observacao",
        instrucao: "Anote o que precisar",
        explicacao:
          "A observação pode ser editada a qualquer momento, sem mexer no resto do pedido. Clique em “Salvar " +
          "observação”.",
        preenche: { "pedido.observacao": "Entregar pela porta dos fundos, antes das 7h." },
      },
      {
        cena: "pedido",
        alvo: "pedido.recibo",
        instrucao: "Imprima o recibo",
        explicacao:
          "“Recibo (PDF)” abre, numa aba nova, um recibo A4 com a empresa, o pedido, o cliente, os itens, o total e a " +
          "forma e a situação do pagamento. O recibo de pedido cancelado sai com “CANCELADO” em destaque.",
      },
    ],
    eDepois: {
      texto: "Para corrigir os itens, a forma de pagamento ou o cliente, cancele o pedido e lance de novo.",
      proximoRoteiro: "corrigir-pedido",
    },
  }),

  roteiro({
    id: "corrigir-pedido",
    titulo: "Corrigir um pedido (cancelar e lançar de novo)",
    quandoUsar:
      "Quando um pedido saiu errado (preço, quantidade, lote, cliente ou forma de pagamento). Os itens não são " +
      "editados: o pedido errado é cancelado e o certo, lançado de novo.",
    quemPode: QUEM_CANCELA,
    passos: [
      {
        cena: "pedido",
        alvo: "pedido.itens",
        instrucao: "Abra o pedido errado",
        explicacao:
          "No pedido 127, da Açaí da Vila, ficou o preço sugerido de R$ 18,00/kg; o combinado era R$ 20,00/kg.",
        preenche: { "pedido.cabecalho": "127" },
      },
      {
        cena: "pedido",
        alvo: "pedido.cancelar",
        instrucao: "Clique em “Cancelar pedido”",
        explicacao: "O botão fica no alto, ao lado do recibo.",
      },
      {
        cena: "cancelar",
        alvo: "cancelar.aviso",
        instrucao: "Leia o que o cancelamento faz",
        explicacao:
          "Devolve o estoque aos lotes, cancela a conta a receber e a entrega e, na venda à vista, desfaz o " +
          "recebimento que o próprio pedido criou.",
      },
      {
        cena: "cancelar",
        alvo: "cancelar.motivo",
        instrucao: "Informe o motivo",
        explicacao: "Obrigatório (pelo menos 3 letras). Fica gravado no pedido e na auditoria.",
        preenche: { "cancelar.motivo": MOTIVO_127 },
      },
      {
        cena: "cancelar",
        alvo: "cancelar.confirmar",
        instrucao: "Confirme o cancelamento",
        explicacao: "Clique no botão vermelho “Cancelar pedido”.",
      },
      {
        cena: "pedido",
        alvo: "pedido.aviso",
        instrucao: "Confira o pedido cancelado",
        explicacao:
          "O aviso mostra a data e o motivo. Os 120 kg voltaram para o AGC-261120-01, a conta a receber e a entrega " +
          "ficaram canceladas, e o recebimento foi desfeito. O pedido continua na lista, em cinza.",
        preenche: { "pedido.aviso": "cancelado" },
      },
      {
        cena: "pedido",
        alvo: "pedido.cancelar",
        instrucao: "Quando não dá para cancelar",
        explicacao:
          "O botão fica desabilitado e o motivo aparece ao lado. Acontece quando o recebimento à vista já foi " +
          "conciliado com o extrato (desconcilie em Financeiro → Conciliação), quando o financeiro registrou outro " +
          "recebimento no pedido (trate primeiro no financeiro) ou, na maquininha, quando algum repasse já foi " +
          "confirmado (desfaça a confirmação em Financeiro → Repasses de cartão).",
        preenche: { "pedido.cabecalho": "128", "pedido.cancelar": "bloqueado" },
      },
    ],
    eDepois: {
      texto: "Agora lance o pedido certo: no exemplo, o 128, com R$ 20,00/kg.",
      proximoRoteiro: "lancar-a-vista",
    },
  }),
];
