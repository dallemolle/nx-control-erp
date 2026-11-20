import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { BUSCA_PARCIAL, FILHO, FRUTO, POLPA, VENDA_AGC, VENDA_AMC } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE = "Quem vê: todos os perfis. A consulta é só da filial atual.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "recall-fruto",
    titulo: "Recall: de um lote de fruto até os clientes",
    quandoUsar:
      "Quando um lote de fruto tem problema (contaminação, agrotóxico, origem duvidosa) e é preciso saber em que " +
      "polpas ele virou e quem comprou. É a lista de quem avisar.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "rastreio",
        alvo: "busca.campo",
        instrucao: "Digite o código do lote",
        explicacao:
          "Está na etiqueta e em todas as telas da produção. Maiúsculas ou minúsculas tanto faz. No exemplo, o " +
          `açaí do José da Silva: ${FRUTO.codigo}.`,
        preenche: { "busca.campo": FRUTO.codigo },
      },
      {
        cena: "rastreio",
        alvo: "busca.rastrear",
        instrucao: "Clique em “Rastrear”",
        explicacao: "Com o código completo, a tela abre o rastreio do lote.",
      },
      {
        cena: "rastreio",
        alvo: "lote.cartao",
        instrucao: "Confira o lote",
        explicacao:
          "Tipo (Fruto ou Polpa), produto, status, data da recepção, validade, local, quantidade inicial e saldo. " +
          `Este foi todo consumido: ${FRUTO.inicialKg} kg de entrada, saldo 0, Zerado.`,
      },
      {
        cena: "rastreio",
        alvo: "origem.recepcao",
        instrucao: "Origem: de onde o fruto veio",
        explicacao:
          "A recepção, com a origem (produtor ou talhão), a qualidade, o peso bruto, o descarte e o romaneio. No " +
          "exemplo, comprado do José da Silva, qualidade A, romaneio 152.",
      },
      {
        cena: "rastreio",
        alvo: "frente.polpas",
        instrucao: "Para frente: em que polpa ele virou",
        explicacao:
          `A OP-261120-01 usou os ${FRUTO.inicialKg} kg deste lote e gerou a polpa grossa e a média. Clique no ` +
          "código de uma polpa para rastreá-la.",
      },
      {
        cena: "rastreio",
        alvo: "destino.cartao",
        instrucao: "Destino: para onde foi cada kg",
        explicacao:
          "Entrada, vendido, consumido em OP, ajustes (por motivo) e o saldo, pelos movimentos do estoque. A conta " +
          "fecha no saldo; se não fechar, a tela avisa em vermelho.",
      },
      {
        cena: "rastreio",
        alvo: "clientes.cartao",
        instrucao: "Clientes: quem avisar",
        explicacao:
          "Todos os pedidos que levaram este fruto ou qualquer polpa das OPs que o usaram, com contato, endereço e " +
          `entrega. No exemplo, a ${VENDA_AGC.cliente} (polpa grossa) e a ${VENDA_AMC.cliente} (polpa média, que ` +
          "tinha ido para a câmara da loja).",
        dica:
          "A lista é cautelosa: se a OP misturou este fruto com outros, todos os clientes da polpa dela aparecem, " +
          "porque não há como separar.",
      },
      {
        cena: "rastreio",
        alvo: "clientes.resumo",
        instrucao: "O total no alto do cartão",
        explicacao: "Quantos clientes diferentes e quantos kg, sem contar pedidos cancelados.",
      },
    ],
    eDepois: {
      texto: "Para mandar a lista a quem vai ligar para os clientes, use “Exportar CSV” ou “Exportar Excel”.",
      proximoRoteiro: "origem-polpa",
    },
  }),

  roteiro({
    id: "origem-polpa",
    titulo: "De um lote de polpa até o fruto e o produtor",
    quandoUsar:
      "Quando a reclamação ou a fiscalização chega pela polpa: de qual OP ela saiu, com que fruto, de qual " +
      "produtor ou talhão, e para quem mais foi vendida.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "rastreio",
        alvo: "busca.campo",
        instrucao: "Digite o código da polpa e rastreie",
        explicacao: `No exemplo, a polpa grossa ${POLPA.codigo}.`,
        preenche: { "busca.campo": POLPA.codigo },
      },
      {
        cena: "rastreio",
        alvo: "origem.op",
        instrucao: "A OP que fez a polpa",
        explicacao:
          "Número, status, data, responsável, branqueamento (temperatura e tempo) e rendimento e balanço, com o " +
          "selo OK ou Verificar. Clique no número para abrir a OP.",
      },
      {
        cena: "rastreio",
        alvo: "origem.frutos",
        instrucao: "Os lotes de fruto usados",
        explicacao:
          "Cada lote que entrou na OP, com os kg, a data da recepção, a origem e a qualidade. No exemplo, o açaí do " +
          "José da Silva e o do Talhão 3.",
      },
      {
        cena: "rastreio",
        alvo: "destino.cartao",
        instrucao: "O destino da polpa",
        explicacao:
          `${POLPA.inicialKg} kg produzidos, 120 kg vendidos, 1 kg de amostra para o laboratório: sobram ` +
          `${POLPA.saldoKg} kg.`,
      },
      {
        cena: "rastreio",
        alvo: "clientes.cartao",
        instrucao: "Quem comprou esta polpa",
        explicacao: `Só os pedidos deste lote: no exemplo, o pedido ${VENDA_AGC.pedido}, da ${VENDA_AGC.cliente}.`,
      },
    ],
    eDepois: {
      texto:
        "Para chegar aos outros clientes que receberam polpa do mesmo fruto, clique no código de um lote de fruto " +
        "na Origem e veja o cartão de clientes dele.",
      proximoRoteiro: "familia",
    },
  }),

  roteiro({
    id: "familia",
    titulo: "Rastrear um lote dividido por transferência",
    quandoUsar: "Quando o lote foi dividido entre locais (/1, /2…) e é preciso ver o conjunto.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "rastreio",
        alvo: "busca.campo",
        instrucao: "Digite o código original ou qualquer /N",
        explicacao: `Os dois mostram a família inteira. No exemplo, a parte da polpa média que foi para a loja: ${FILHO.codigo}.`,
        preenche: { "busca.campo": FILHO.codigo },
      },
      {
        cena: "rastreio",
        alvo: "familia.cartao",
        instrucao: "Lotes da família",
        explicacao:
          "Cada lote da família com o local e o saldo; o consultado vem marcado. Clique em outro código para trocar.",
      },
      {
        cena: "rastreio",
        alvo: "destino.cartao",
        instrucao: "O destino soma a família",
        explicacao:
          "700 kg produzidos, 50 kg vendidos na loja, 650 kg de saldo somando os dois lotes. A transferência entre " +
          "eles não aparece: só mudou o lugar.",
      },
      {
        cena: "rastreio",
        alvo: "clientes.cartao",
        instrucao: "Os clientes também somam",
        explicacao:
          `Vendas de qualquer lote da família. No exemplo, o pedido ${VENDA_AMC.pedido}, da ${VENDA_AMC.cliente}, ` +
          "ainda em rota.",
      },
    ],
    eDepois: {
      texto: "A origem (a OP e o fruto) vem sempre do lote original, que é de onde todos saíram.",
      proximoRoteiro: "buscar-exportar",
    },
  }),

  roteiro({
    id: "buscar-exportar",
    titulo: "Achar um lote, ver cancelados e exportar",
    quandoUsar: "Quando não se tem o código inteiro, ou para levar o rastreio a quem pediu (fiscalização, cliente).",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "rastreio",
        alvo: "busca.campo",
        instrucao: "Digite só parte do código",
        explicacao:
          `Por exemplo, ${BUSCA_PARCIAL}: o fruto de açaí de novembro de 2026. Também dá para chegar aqui clicando ` +
          "no código do lote no Estoque, na Recepção, na OP ou no pedido.",
        preenche: { "busca.campo": BUSCA_PARCIAL },
      },
      {
        cena: "rastreio",
        alvo: "busca.lista",
        instrucao: "Escolha na lista",
        explicacao:
          "Os lotes que têm o trecho no código, do mais recente para o mais antigo, até 20. Se passar disso, digite " +
          "mais do código.",
      },
      {
        cena: "rastreio",
        alvo: "lote.cancelados",
        instrucao: "“Mostrar cancelados”, quando precisar",
        explicacao:
          "Inclui pedidos cancelados, OPs canceladas e linhas removidas de OP, em cinza. Serve para auditoria; para " +
          "o recall, o padrão (sem cancelados) é o que vale.",
        preenche: { "busca.campo": POLPA.codigo, "lote.cancelados": "sim" },
      },
      {
        cena: "rastreio",
        alvo: "clientes.cancelado",
        instrucao: "O pedido cancelado aparece marcado",
        explicacao:
          "No exemplo, o pedido 127, que foi refeito como 128. Ele não entra no total de clientes nem de kg.",
      },
      {
        cena: "rastreio",
        alvo: "lote.etiqueta",
        instrucao: "Reimprima a etiqueta, se precisar",
        explicacao: "Abre a etiqueta do lote numa aba nova.",
      },
      {
        cena: "rastreio",
        alvo: "lote.exportar",
        instrucao: "Exporte",
        explicacao:
          "O PDF traz o rastreio completo (lote, origem, OPs, destino e clientes), bom para a fiscalização. CSV e " +
          "Excel trazem só a lista de clientes, uma linha por item vendido, para o recall.",
      },
    ],
    eDepois: {
      texto: "O arquivo respeita o “Mostrar cancelados” que estiver ligado na hora.",
    },
  }),
];
