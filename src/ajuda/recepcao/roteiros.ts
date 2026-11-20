import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import type { ALVOS } from "./alvos";
import { ORIGEM_PROPRIA } from "./cenas";
import { COLHEITA, COMPRA, LOCAL, PRAZO_PRODUTOR_DIAS, PRODUTO, RASA_KG, SAFRA } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_LANCA =
  "Quem pode: perfis Administrador e Produção, com permissão de alteração na filial. Os demais perfis só veem a " +
  "lista, sem os botões de lançar, editar e excluir.";

const QUEM_VE = "Quem vê: todos os perfis. A tela mostra só a filial atual.";

/** Os passos do formulário que valem para compra e colheita (produto, unidade e peso). */
const ABRIR_E_PRODUTO = [
  {
    cena: "lista",
    alvo: "lista.nova",
    instrucao: "Clique em “Nova recepção”",
    explicacao: "O botão fica no alto da tela, à direita, e abre o formulário da carga.",
  },
  {
    cena: "nova",
    alvo: "nova.data",
    instrucao: "Confira a data",
    explicacao:
      "Já vem com o dia de hoje. Mude só se estiver lançando uma carga de outro dia: a data entra no número do " +
      "lote e na validade.",
  },
  {
    cena: "nova",
    alvo: "nova.produto",
    instrucao: "Escolha o produto",
    explicacao:
      "A lista traz só os produtos da categoria fruto (cadastrados em Cadastros → Produtos). No exemplo, o fruto " +
      "de açaí, código FA.",
    preenche: { "nova.produto": PRODUTO },
  },
] as const;

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "registrar-compra",
    titulo: "Registrar fruto comprado de um produtor",
    quandoUsar:
      "Quando chega uma carga de fruto comprada de terceiro. A recepção cria o lote, dá entrada no estoque e já " +
      "lança a conta a pagar ao fornecedor: não lance a mesma compra de novo em Contas a pagar.",
    quemPode: QUEM_LANCA,
    passos: [
      ...ABRIR_E_PRODUTO,
      {
        cena: "nova",
        alvo: "nova.origem",
        instrucao: "Deixe marcado “Comprado de terceiro”",
        explicacao: "É o padrão. Com ele, o formulário pede o fornecedor, o preço e os dados da conta a pagar.",
      },
      {
        cena: "nova",
        alvo: "nova.fornecedor",
        instrucao: "Escolha o fornecedor",
        explicacao:
          "Quem vendeu o fruto, cadastrado em Cadastros → Fornecedores. No exemplo, o José da Silva, que vende sem " +
          "nota.",
        preenche: { "nova.fornecedor": COMPRA.fornecedor },
      },
      {
        cena: "nova",
        alvo: "nova.local",
        instrucao: "Confira o local",
        explicacao:
          `Onde o fruto fica guardado. Já vem o local do tipo recepção da filial (no exemplo, ${LOCAL}); troque se ` +
          "a carga foi para outro lugar.",
      },
      {
        cena: "nova",
        alvo: "nova.unidade",
        instrucao: "Escolha em que unidade vai digitar",
        explicacao:
          `O padrão é kg. Para o açaí, marque “rasa (${RASA_KG} kg)” e digite em rasas, como o produtor conta: o ` +
          "sistema converte para kg. A opção só aparece para produto com unidade comercial no cadastro.",
        preenche: { "nova.unidade": "rasa" },
      },
      {
        cena: "nova",
        alvo: "nova.bruto",
        instrucao: "Digite o peso bruto",
        explicacao: `Tudo o que chegou, antes da triagem. No exemplo, ${COMPRA.brutoRasas} rasas.`,
        preenche: { "nova.bruto": String(COMPRA.brutoRasas) },
      },
      {
        cena: "nova",
        alvo: "nova.descarte",
        instrucao: "Digite o descarte da triagem",
        explicacao:
          "O que foi separado e não serve, na mesma unidade do bruto. Pode ficar vazio. O descarte não pode passar " +
          `do bruto. No exemplo, ${COMPRA.descarteRasas} rasas.`,
        preenche: { "nova.descarte": String(COMPRA.descarteRasas) },
      },
      {
        cena: "nova",
        alvo: "nova.preco",
        instrucao: "Digite o preço combinado",
        explicacao:
          "Por unidade digitada: com rasa, é o preço da rasa. Paga-se só o líquido (bruto menos descarte). No " +
          `exemplo, ${formatarMoeda(COMPRA.precoRasa)} por rasa.`,
        preenche: { "nova.preco": String(COMPRA.precoRasa), "nova.resumo": "calculado" },
      },
      {
        cena: "nova",
        alvo: "nova.resumo",
        instrucao: "Confira o resumo",
        explicacao:
          `Calculado na hora: ${COMPRA.brutoRasas - COMPRA.descarteRasas} rasas líquidas são ${COMPRA.liquidoKg}, ` +
          `com ${COMPRA.percentualDescarte} de descarte, ${formatarMoeda(COMPRA.precoKg)} por kg e ` +
          `${formatarMoeda(COMPRA.valor)} a pagar. A validade é a data mais os dias de validade do produto (1 dia ` +
          "para o fruto de açaí).",
      },
      {
        cena: "nova",
        alvo: "nova.vencimento",
        instrucao: "Confira o vencimento da conta a pagar",
        explicacao:
          "Vem com a data da carga mais o prazo de pagamento ao produtor, definido em Administração → Configuração " +
          `de produção (no exemplo, ${PRAZO_PRODUTOR_DIAS} dias). Pode ser mudado só para esta carga.`,
      },
      {
        cena: "nova",
        alvo: "nova.classificacao",
        instrucao: "Escolha a classificação",
        explicacao:
          "Vem com a classificação padrão do fornecedor (ou Gerencial, se ele não tiver). Sem nota, deixe " +
          "Gerencial: a conta sai com recibo. Se o produtor emitiu nota, escolha Fiscal e informe o “Nº da nota do " +
          "produtor”, que aparece logo ao lado.",
      },
      {
        cena: "nova",
        alvo: "nova.complementos",
        instrucao: "Complete, se quiser",
        explicacao:
          "Qualidade (A, B ou C), romaneio ou NF, safra e observação são opcionais. O romaneio vira o documento da " +
          "conta a pagar (sem ele, o documento fica RF- e o número do lote) e a safra vai junto para a conta.",
        preenche: { "nova.qualidade": COMPRA.qualidade, "nova.documento": COMPRA.documento, "nova.safra": SAFRA },
      },
      {
        cena: "nova",
        alvo: "nova.salvar",
        instrucao: "Clique em “Salvar recepção”",
        explicacao:
          "O sistema grava o lote, a entrada no estoque e a conta a pagar de uma vez: se algo falhar, nada fica " +
          "gravado. Se a categoria de compra de fruto não estiver configurada, o sistema recusa a compra e diz onde " +
          "configurar.",
      },
      {
        cena: "lista",
        alvo: "lista.criado",
        instrucao: "Anote o número do lote e imprima a etiqueta",
        explicacao:
          `O número é gerado ao salvar e nunca muda: ${COMPRA.lote} é o código do produto (FA), a data em ` +
          "ano-mês-dia (261120 = 20/11/2026) e a sequência do produto no dia (01). “Imprimir etiqueta” abre a " +
          "etiqueta do lote para colar nas caixas.",
        preenche: { "lista.criado": COMPRA.lote },
      },
    ],
    eDepois: {
      texto:
        "A conta a pagar aparece em Contas a pagar, e o pagamento ao produtor é registrado lá, como qualquer outro. " +
        "O fruto fica no Estoque até ser processado, vendido ou ajustado.",
      proximoRoteiro: "registrar-colheita",
    },
  }),

  roteiro({
    id: "registrar-colheita",
    titulo: "Registrar fruto colhido nos talhões próprios",
    quandoUsar: "Quando entra fruto da própria fazenda. Não há compra: o lote entra pelo custo-padrão da fruta.",
    quemPode: QUEM_LANCA,
    passos: [
      ...ABRIR_E_PRODUTO,
      {
        cena: "nova",
        alvo: "nova.origem",
        instrucao: "Marque “Colhido nos talhões próprios”",
        explicacao: "Somem o fornecedor, o preço e a conta a pagar; aparece o talhão.",
        preenche: { "nova.origem": ORIGEM_PROPRIA },
      },
      {
        cena: "nova",
        alvo: "nova.talhao",
        instrucao: "Escolha o talhão",
        explicacao:
          "A lista mostra só os talhões ativos da filial plantados com a fruta do produto escolhido. Se trocar o " +
          "produto, escolha o talhão de novo.",
        preenche: { "nova.talhao": COLHEITA.talhao },
      },
      {
        cena: "nova",
        alvo: "nova.unidade",
        instrucao: "Escolha a unidade e digite os pesos",
        explicacao: `No exemplo, em rasas: ${COLHEITA.brutoRasas} de bruto e ${COLHEITA.descarteRasas} de descarte.`,
        preenche: {
          "nova.unidade": "rasa",
          "nova.bruto": String(COLHEITA.brutoRasas),
          "nova.descarte": String(COLHEITA.descarteRasas),
          "nova.resumo": "calculado",
        },
      },
      {
        cena: "nova",
        alvo: "nova.resumo",
        instrucao: "Confira o resumo",
        explicacao:
          `${COLHEITA.liquidoKg} líquidos, a ${formatarMoeda(COLHEITA.custoPadraoKg)} por kg (o custo-padrão do ` +
          `cadastro da fruta): ${formatarMoeda(COLHEITA.valor)}. É o custo do lote no estoque, não uma conta a ` +
          "pagar.",
        dica: "O custo-padrão fica em Cadastros → Frutas. Mudar lá não altera lotes já recebidos.",
      },
      {
        cena: "nova",
        alvo: "nova.salvar",
        instrucao: "Complete e salve",
        explicacao:
          "Qualidade, romaneio, safra e observação são opcionais, como na compra. Ao salvar, o lote ganha o próximo " +
          `número do dia: no exemplo, ${COLHEITA.lote}, porque a compra do José já usou o 01.`,
      },
    ],
    eDepois: {
      texto: "O lote entra no Estoque como o comprado, e a etiqueta sai pelo botão “Etiqueta” da lista.",
      proximoRoteiro: "corrigir-excluir",
    },
  }),

  roteiro({
    id: "corrigir-excluir",
    titulo: "Corrigir ou excluir uma recepção",
    quandoUsar:
      "Quando um dado da carga foi lançado errado. Qualidade, romaneio e observação se corrigem a qualquer momento; " +
      "peso, preço, produto, origem e fornecedor só excluindo e lançando de novo.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.editar",
        instrucao: "Para qualidade, romaneio ou observação, clique em “Editar”",
        explicacao: "Fica na coluna Ações, na linha da recepção.",
      },
      {
        cena: "editar",
        alvo: "editar.campos",
        instrucao: "Corrija e salve",
        explicacao:
          "Só estes três campos mudam aqui. Eles não alteram o estoque nem o valor. O romaneio corrigido fica só na " +
          "recepção: o documento da conta a pagar continua o de antes (se precisar, edite o título em Contas a " +
          "pagar).",
        preenche: { "editar.qualidade": "B" },
      },
      {
        cena: "lista",
        alvo: "lista.excluir",
        instrucao: "Para peso, preço ou origem, clique em “Excluir”",
        explicacao:
          `No exemplo, o preço combinado com o José era ${formatarMoeda(75)} por rasa, não ` +
          `${formatarMoeda(COMPRA.precoRasa)}: exclua e lance a carga de novo.`,
      },
      {
        cena: "excluir",
        alvo: "excluir.aviso",
        instrucao: "Leia o que acontece",
        explicacao:
          "O lote fica zerado, mas continua existindo, para o número nunca ser reaproveitado. A conta a pagar da " +
          "carga é cancelada junto.",
      },
      {
        cena: "excluir",
        alvo: "excluir.motivo",
        instrucao: "Escreva o motivo",
        explicacao: "Obrigatório, com pelo menos 3 letras. Fica guardado na recepção e na auditoria.",
        preenche: { "excluir.motivo": "Preço errado: era R$ 75,00 a rasa" },
      },
      {
        cena: "excluir",
        alvo: "excluir.confirmar",
        instrucao: "Clique em “Excluir recepção” e lance de novo",
        explicacao:
          "A recepção continua na lista, em cinza, com o selo “Excluída”. Lance a carga certa por “Nova recepção”: " +
          "ela ganha um número novo (no exemplo, FA-261120-03).",
      },
      {
        cena: "lista",
        alvo: "lista.bloqueado",
        instrucao: "Quando o “Excluir” fica desabilitado",
        explicacao:
          "Quando o lote já teve saída (processamento, venda, ajuste ou transferência) ou a conta a pagar já tem " +
          "pagamento registrado. Pare o mouse sobre o botão para ver o motivo. No exemplo, o lote FA-261118-01 já " +
          "foi para o processamento.",
        dica:
          "Nesses casos, o erro se corrige no que veio depois: um ajuste de estoque para o peso, ou o título em " +
          "Contas a pagar para o valor.",
      },
    ],
    eDepois: {
      texto: "Recepção excluída não tem mais Editar nem Excluir; só a etiqueta continua disponível.",
      proximoRoteiro: "consultar-exportar",
    },
  }),

  roteiro({
    id: "consultar-exportar",
    titulo: "Consultar, rastrear e exportar as recepções",
    quandoUsar: "Para conferir as cargas de um período, reimprimir uma etiqueta ou mandar a lista para alguém.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.filtros",
        instrucao: "Escolha o período e, se quiser, a fruta e a origem",
        explicacao:
          "Abre no mês atual. A lista muda assim que você troca um filtro; “Limpar filtros” volta ao mês atual com " +
          "todas as frutas e origens.",
      },
      {
        cena: "lista",
        alvo: "lista.origem",
        instrucao: "Filtre por origem",
        explicacao: "“Terceiro” mostra só as compras; “Própria”, só as colheitas.",
        preenche: { "lista.origem": "Terceiro" },
      },
      {
        cena: "lista",
        alvo: "lista.tabela",
        instrucao: "Leia a lista",
        explicacao:
          "Da carga mais recente para a mais antiga, com pesos em kg mesmo quando lançados em rasas. As excluídas " +
          "continuam aparecendo, em cinza.",
      },
      {
        cena: "lista",
        alvo: "lista.lote",
        instrucao: "Clique no número do lote para rastrear",
        explicacao: "Abre a Rastreabilidade com o caminho do lote: de onde veio e para onde foi (OP, venda, ajuste).",
      },
      {
        cena: "lista",
        alvo: "lista.etiqueta",
        instrucao: "Reimprima a etiqueta, se precisar",
        explicacao: "“Etiqueta” abre a etiqueta do lote numa aba nova, pronta para imprimir.",
      },
      {
        cena: "lista",
        alvo: "lista.exportar",
        instrucao: "Exporte a lista",
        explicacao:
          "CSV, Excel ou PDF com os filtros escolhidos. O arquivo traz também a fruta, o descarte em kg, o " +
          "documento e o status (Ativa ou Excluída).",
      },
    ],
    eDepois: {
      texto: "Os totais do período (fruto recebido, % de terceiros, descarte) estão no Painel de produção.",
    },
  }),
];
