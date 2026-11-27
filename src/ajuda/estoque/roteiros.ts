import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { CITADOS, HOJE, LIBERACAO, OUTRO_DIA, TRANSFERENCIA } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE = "Quem vê: todos os perfis. A tela mostra só a filial atual.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "ler-estoque",
    titulo: "Ler o estoque",
    quandoUsar:
      "Para saber o que há em cada lote, onde está, quanto vale e o que precisa sair primeiro. É a mesma lista que " +
      "a OP, os pedidos e os ajustes usam para escolher lotes.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "estoque",
        alvo: "est.cards",
        instrucao: "Comece pelos cartões",
        explicacao:
          "Quantos lotes com saldo e quantos kg estão OK, Vencendo e Vencido. No exemplo, " +
          `${CITADOS.okLotes} lotes OK (${CITADOS.okKg} kg), 1 vencendo e 1 vencido.`,
      },
      {
        cena: "estoque",
        alvo: "est.tabela",
        instrucao: "Leia a lista por lote",
        explicacao:
          "Só lotes com saldo, do que vence primeiro para o último: é a ordem em que devem sair. Cada linha traz o " +
          "produto, o local, a data do lote, a validade, o saldo, o custo/kg e o valor (saldo × custo).",
      },
      {
        cena: "estoque",
        alvo: "est.dias",
        instrucao: "Dias: quanto falta para vencer",
        explicacao:
          "Negativo (em vermelho) é quantos dias já passou. O fruto de acerola FC-261117-01 venceu em 19/11: hoje, " +
          `${HOJE}, mostra -1.`,
      },
      {
        cena: "estoque",
        alvo: "est.statusLote",
        instrucao: "Status: OK, Vencendo, Vencido ou Zerado",
        explicacao:
          "Vencendo é quando faltam poucos dias: até 30 para congelado e até 1 para in natura e resfriado (os dois " +
          "prazos ficam em Administração → Configuração de produção). O açaí resfriado AMR-261118-01 vence hoje: " +
          "Vencendo.",
        dica:
          "Lote vencido não sai em pedido nem em OP, a não ser que seja liberado (veja o roteiro de liberação). Polpa " +
          "de OP aberta aparece com o selo “Em produção”, sem etiqueta, até a OP ser encerrada.",
      },
      {
        cena: "estoque",
        alvo: "est.total",
        instrucao: "O total da lista",
        explicacao: `Soma o saldo e o valor dos lotes mostrados: ${CITADOS.totalKg} kg no exemplo.`,
      },
      {
        cena: "estoque",
        alvo: "est.lote",
        instrucao: "Clique no número do lote para rastrear",
        explicacao:
          "Abre a Rastreabilidade: de onde o lote veio (recepção ou OP) e para onde foi. O botão “Etiqueta” da " +
          "linha reimprime a etiqueta.",
      },
    ],
    eDepois: {
      texto: "Para enxergar por produto em cada local, use a aba “Por produto e local”.",
      proximoRoteiro: "filtrar-referencia",
    },
  }),

  roteiro({
    id: "filtrar-referencia",
    titulo: "Filtrar e ver o estoque em outro dia",
    quandoUsar:
      "Para achar um lote, ver só os vencidos, planejar o que vai estar vencendo no sábado ou tirar o estoque de " +
      "um dia passado (fim do mês, inventário).",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "estoque",
        alvo: "est.filtros",
        instrucao: "Filtre por produto, local ou status",
        explicacao:
          "A lista muda assim que você troca um filtro. Os cartões acompanham o produto e o local escolhidos, mas não " +
          "o status.",
      },
      {
        cena: "estoque",
        alvo: "est.cardVencido",
        instrucao: "Ou clique num cartão",
        explicacao:
          "Mostra só os lotes daquele status, com o cartão marcado. Clique de novo para limpar. No exemplo, " +
          `“Vencido” deixa só o ${LIBERACAO.lote}.`,
        preenche: { "est.status": "Vencido" },
      },
      {
        cena: "estoque",
        alvo: "est.referencia",
        instrucao: "Mude a data de referência",
        explicacao:
          `Os dias e o status passam a ser contados nesta data. Em ${OUTRO_DIA}, o açaí resfriado AMR-261118-01 ` +
          "também aparece como Vencido, e os cartões mudam junto.",
        dica:
          "O saldo também é o daquele dia: a soma das entradas e saídas até ele. Num dia passado, aparecem os lotes que " +
          "tinham saldo, mesmo zerados hoje, e um aviso lembra que custo e local são os de hoje.",
        preenche: { "est.referencia": OUTRO_DIA },
      },
      {
        cena: "estoque",
        alvo: "est.zerados",
        instrucao: "Marque “Mostrar zerados”, se precisar",
        explicacao:
          "Traz de volta os lotes sem saldo. No exemplo, os dois lotes de fruto da Recepção, consumidos inteiros na " +
          "OP-261120-01. Escolher o status Zerado faz o mesmo.",
        preenche: { "est.status": "Zerado", "est.zerados": "sim" },
      },
      {
        cena: "estoque",
        alvo: "est.exportar",
        instrucao: "Exporte o que está na tela",
        explicacao:
          "CSV, Excel ou PDF com os filtros e a data de referência escolhidos. O PDF traz também os cartões e, na aba " +
          "“Por produto e local”, a ocupação dos locais.",
      },
    ],
    eDepois: {
      texto: "“Limpar filtros” volta à lista de hoje, com todos os produtos, locais e status.",
      proximoRoteiro: "transferir",
    },
  }),

  roteiro({
    id: "transferir",
    titulo: "Transferir um lote de local",
    quandoUsar:
      "Quando a polpa (ou o fruto) muda de lugar: da câmara da fábrica para a da loja, de uma câmara cheia para " +
      "outra.",
    quemPode:
      "Quem pode: perfis Administrador e Produção, com permissão de alteração na filial. Os demais perfis não veem o " +
      "botão.",
    passos: [
      {
        cena: "estoque",
        alvo: "est.transferir",
        instrucao: "Clique em “Transferir” no lote",
        explicacao: `No exemplo, a polpa média ${TRANSFERENCIA.lote}, com 700 kg na Câmara fria.`,
      },
      {
        cena: "transferir",
        alvo: "transf.aviso",
        instrucao: "Entenda as duas formas",
        explicacao:
          "Com o saldo inteiro, o lote só muda de local e continua com o mesmo número. Com parte dele, a parte vira " +
          "um lote novo no destino, com o mesmo número e uma barra no fim (/1, /2…), com a mesma validade, custo e " +
          "origem.",
      },
      {
        cena: "transferir",
        alvo: "transf.local",
        instrucao: "Escolha o novo local",
        explicacao: "A lista traz os locais ativos da filial, menos o atual.",
        preenche: { "transf.local": TRANSFERENCIA.destino },
      },
      {
        cena: "transferir",
        alvo: "transf.kg",
        instrucao: "Digite a quantidade",
        explicacao:
          `Já vem com o saldo inteiro. No exemplo, só ${TRANSFERENCIA.kg} kg vão para a loja. Mais que o saldo é ` +
          "recusado.",
        preenche: { "transf.kg": String(TRANSFERENCIA.kg) },
      },
      {
        cena: "transferir",
        alvo: "transf.confirmar",
        instrucao: "Clique em “Transferir”",
        explicacao: "A saída e a entrada ficam registradas no estoque do lote.",
      },
      {
        cena: "estoque",
        alvo: "est.filho",
        instrucao: "Confira o lote novo",
        explicacao:
          `${TRANSFERENCIA.filho} com ${TRANSFERENCIA.kg} kg na ${TRANSFERENCIA.destino}; o original fica com 500 kg. ` +
          "Se a família já tivesse um lote na loja, os kg seriam somados nele; devolver para a Câmara fria junta de " +
          "volta no original.",
        preenche: { "est.filho": "transferido" },
      },
    ],
    eDepois: {
      texto:
        "Polpa de OP ainda aberta só pode mudar de local inteira: dividir o lote fica para depois do encerramento, " +
        "quando o custo está gravado.",
      proximoRoteiro: "liberar-vencido",
    },
  }),

  roteiro({
    id: "liberar-vencido",
    titulo: "Liberar um lote vencido",
    quandoUsar:
      "Quando um lote passou da validade mas ainda pode ser aproveitado, conferido por quem responde pela qualidade. " +
      "Sem a liberação, ele não entra em pedido nem em OP.",
    quemPode:
      "Quem pode: perfis Administrador e Gestor, com permissão de alteração na filial. Depois de liberado, qualquer " +
      "pessoa que lança pedido ou OP pode usar o lote.",
    passos: [
      {
        cena: "estoque",
        alvo: "est.liberar",
        instrucao: "Clique em “Liberar” no lote vencido",
        explicacao:
          "O botão aparece só em lote vencido hoje e com saldo (a data de referência não conta aqui). No exemplo, o " +
          `fruto de acerola ${LIBERACAO.lote}, que venceu em 19/11.`,
      },
      {
        cena: "liberar",
        alvo: "lib.prazo",
        instrucao: "Veja até quando vale",
        explicacao:
          "A validade mais os dias de liberação após vencimento do cadastro do produto (Cadastros → Produtos). No " +
          `exemplo, ${LIBERACAO.dias} dias: até ${LIBERACAO.liberadoAte}.`,
      },
      {
        cena: "liberar",
        alvo: "lib.motivo",
        instrucao: "Escreva o motivo",
        explicacao: "Obrigatório. Vai junto para o item do pedido ou o consumo da OP que usar o lote.",
        preenche: { "lib.motivo": LIBERACAO.motivo },
      },
      {
        cena: "liberar",
        alvo: "lib.confirmar",
        instrucao: "Clique em “Liberar”",
        explicacao: "Se o lote foi dividido por transferência, a liberação vale para todos os lotes da família.",
      },
      {
        cena: "estoque",
        alvo: "est.liberado",
        instrucao: "Confira a marca no lote",
        explicacao:
          `“Movimentação liberada até ${LIBERACAO.liberadoAte}”. Pare o mouse sobre ela para ver quem liberou, ` +
          "quando e o motivo. O status continua Vencido.",
        preenche: { "est.liberado": "sim", "est.status": "Vencido" },
      },
      {
        cena: "estoque",
        alvo: "est.revogar",
        instrucao: "“Revogar” desfaz a liberação",
        explicacao: "O lote volta a ficar bloqueado. Liberar e revogar ficam na auditoria.",
      },
      {
        cena: "liberar",
        alvo: "lib.prazo",
        instrucao: "Quando o produto não tem prazo de liberação",
        explicacao:
          "O diálogo pede para configurar os dias no cadastro do produto. Quem pode editar produtos vê o botão " +
          "“Editar produto”; os demais, um aviso para pedir a quem cadastra.",
        preenche: { "lib.prazo": "sem-prazo" },
      },
      {
        cena: "liberar",
        alvo: "lib.prazo",
        instrucao: "Quando o prazo já acabou",
        explicacao:
          "Passada a validade mais os dias de liberação, o lote não pode mais ser liberado: só sai por ajuste de " +
          "estoque (descarte).",
        preenche: { "lib.prazo": "encerrado" },
      },
    ],
    eDepois: {
      texto:
        "Lote vencido sem liberação, ou com o prazo encerrado, sai pela tela de Ajustes de estoque, com o motivo " +
        "Vencido.",
      proximoRoteiro: "produto-local",
    },
  }),

  roteiro({
    id: "produto-local",
    titulo: "Ver o estoque por produto e local",
    quandoUsar: "Para saber quanto há de cada produto em cada câmara e quanto cada local está ocupado.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "estoque",
        alvo: "est.abas",
        instrucao: "Abra a aba “Por produto e local”",
        explicacao: "Ela mostra a filial inteira: os filtros de produto, local e status não valem aqui.",
        preenche: { "est.abas": "resumo" },
      },
      {
        cena: "estoque",
        alvo: "est.produtoLocal",
        instrucao: "Saldo e valor por produto em cada local",
        explicacao:
          "Soma os lotes com saldo de cada produto em cada local. O valor é a custo: o saldo de cada lote vezes o " +
          "custo/kg dele.",
      },
      {
        cena: "estoque",
        alvo: "est.ocupacao",
        instrucao: "Ocupação dos locais",
        explicacao:
          `Saldo ÷ capacidade cadastrada. A Câmara fria tem ${CITADOS.ocupacaoCamaraFria} ocupados. Acima de 100%, o ` +
          "número fica vermelho; local sem capacidade cadastrada mostra “—”.",
      },
    ],
    eDepois: {
      texto: "A capacidade de cada local é cadastrada em Cadastros → Locais de armazenamento.",
    },
  }),
];
