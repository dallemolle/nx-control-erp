import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { AGR, LOTE_VENCIDO, PRIMEIRO_LOTE_AGR, RASAS, VALIDADE_AGR } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_CADASTRA =
  "Quem pode: perfis Administrador e Produção, com permissão de alteração na filial. Os demais perfis veem a lista, " +
  "sem os botões.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "cadastrar-polpa",
    titulo: "Cadastrar uma polpa",
    quandoUsar:
      "Antes de produzir um item novo numa OP. Sem o produto cadastrado, ele não aparece na produção da OP nem no " +
      "estoque.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.novo",
        instrucao: "Clique em “Novo produto”",
        explicacao:
          "O produto é da empresa: vale para todas as filiais. No exemplo, a fazenda vai vender açaí grosso resfriado, " +
          "além do congelado.",
      },
      {
        cena: "novo",
        alvo: "form.codigo",
        instrucao: "Informe o código",
        explicacao:
          `De 1 a 6 letras ou números, sem espaços nem traços; vira maiúsculo. É o início do número de lote: o ` +
          `primeiro lote de hoje será ${PRIMEIRO_LOTE_AGR}.`,
        dica: "Não pode repetir: se outro produto já usar o código, aparece “Já existe um produto com este código”.",
        preenche: { "form.codigo": AGR.codigo },
      },
      {
        cena: "novo",
        alvo: "form.descricao",
        instrucao: "Informe a descrição",
        explicacao: "O nome que aparece no estoque, na OP, no pedido, no recibo e na etiqueta.",
        preenche: { "form.descricao": AGR.descricao },
      },
      {
        cena: "novo",
        alvo: "form.categoria",
        instrucao: "Escolha a categoria “Polpa”",
        explicacao:
          "Fruto é o que entra pela Recepção de fruto; Polpa é o que sai da OP. Cada tela só oferece os produtos da " +
          "sua categoria.",
        preenche: { "form.categoria": AGR.categoria },
      },
      {
        cena: "novo",
        alvo: "form.fruta",
        instrucao: "Escolha a fruta",
        explicacao: "A OP de açaí só produz polpas de açaí. A lista traz as frutas ativas de Cadastros → Frutas.",
        preenche: { "form.fruta": AGR.fruta },
      },
      {
        cena: "novo",
        alvo: "form.conservacao",
        instrucao: "Escolha a conservação",
        explicacao:
          "In natura, resfriado ou congelado. O Estoque usa a conservação para avisar dos lotes perto do vencimento.",
        preenche: { "form.conservacao": AGR.conservacao },
      },
      {
        cena: "novo",
        alvo: "form.validade",
        instrucao: "Informe a validade em dias",
        explicacao:
          `A validade do lote é a data da OP mais estes dias. ${PRIMEIRO_LOTE_AGR}, produzido hoje, vence em ` +
          `${VALIDADE_AGR}.`,
        preenche: { "form.validade": String(AGR.validadeDias) },
      },
      {
        cena: "novo",
        alvo: "form.preco",
        instrucao: "Informe o preço de referência",
        explicacao:
          "Vem sugerido no pedido e divide o custo da OP entre as polpas: a que vale mais por kg fica com mais custo.",
        dica: "Obrigatório para encerrar uma OP que produz mais de um produto.",
        preenche: { "form.preco": String(AGR.precoReferenciaKg) },
      },
      {
        cena: "novo",
        alvo: "form.armazenamento",
        instrucao: "Informe o armazenamento",
        explicacao: "Sai na etiqueta do lote, como “Conservação: 0 a 5 °C”. Opcional.",
        preenche: { "form.armazenamento": AGR.armazenamento },
      },
      {
        cena: "novo",
        alvo: "form.liberacao",
        instrucao: "Dias de liberação: deixe vazio",
        explicacao:
          "Vazio, um lote vencido deste produto não pode ser liberado. Resfriado de 2 dias não deve sair vencido.",
      },
      {
        cena: "novo",
        alvo: "form.etiqueta",
        instrucao: "Escreva o texto da etiqueta",
        explicacao: "Ingredientes e outros dizeres obrigatórios, até 600 caracteres. Sai em letra pequena na etiqueta.",
        preenche: { "form.etiqueta": AGR.textoEtiqueta },
      },
      {
        cena: "novo",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "Se faltar algo, a mensagem aparece acima do botão e a janela continua aberta.",
      },
      {
        cena: "lista",
        alvo: "lista.agr",
        instrucao: "Confira na lista",
        explicacao: "A lista segue a ordem do código: a AGR entra entre a ACR e a AGC.",
        preenche: { "lista.agr": "sim" },
      },
    ],
    eDepois: {
      texto:
        "Na OP de açaí, a AGR passa a aparecer entre os produtos da produção. Com mais de uma polpa na mesma OP, o " +
        "custo é dividido pelo preço de referência de cada uma.",
      proximoRoteiro: "fruto-rasa",
    },
  }),

  roteiro({
    id: "fruto-rasa",
    titulo: "O produto de fruto e a rasa",
    quandoUsar:
      "Para entender o produto que entra pela Recepção de fruto, e para o fruto que se compra por rasa, lata ou caixa.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.fa",
        instrucao: "Veja o FA, fruto de açaí",
        explicacao:
          "É o produto da Recepção de fruto. Na lista: in natura, 1 dia de validade e a unidade comercial rasa = 14 kg.",
        preenche: { "editar.produto": "FA" },
      },
      {
        cena: "editar",
        alvo: "editar.produto",
        instrucao: "Abra o “Editar” do FA",
        explicacao: "O mesmo formulário do novo produto, preenchido. Neste roteiro, só para olhar: nada é salvo.",
      },
      {
        cena: "editar",
        alvo: "form.categoria",
        instrucao: "Categoria Fruto",
        explicacao:
          "Só os produtos de fruto aparecem na Recepção de fruto. O custo do fruto colhido nos talhões vem do " +
          "custo-padrão da fruta (Cadastros → Frutas), não daqui.",
      },
      {
        cena: "editar",
        alvo: "form.validade",
        instrucao: "Validade de 1 dia",
        explicacao: "O açaí colhido precisa ir para a OP no mesmo dia ou no seguinte: o lote recebido hoje vence amanhã.",
      },
      {
        cena: "editar",
        alvo: "form.unidade",
        instrucao: "A unidade comercial: rasa = 14 kg",
        explicacao:
          `Com a unidade, a Recepção aceita a quantidade e o preço por rasa: ${RASAS} rasas viram ` +
          `${RASAS * 14} kg. O estoque fica sempre em kg.`,
        dica: "Informe a unidade e os kg juntos, ou deixe os dois em branco: só um dos dois é recusado.",
      },
      {
        cena: "editar",
        alvo: "form.preco",
        instrucao: "Preço de referência: opcional no fruto",
        explicacao:
          "Só é sugerido se o fruto for vendido in natura num pedido. No exemplo, o FA não tem: o fruto vai todo para a OP.",
      },
    ],
    eDepois: {
      texto:
        "Na Recepção de fruto, escolha o FA e a unidade rasa: o sistema calcula os kg e o preço por kg. O lote nasce " +
        "com o código FA e a data da recepção.",
      proximoRoteiro: "liberar-inativar",
    },
  }),

  roteiro({
    id: "liberar-inativar",
    titulo: "Liberação de vencido, mudanças e inativar",
    quandoUsar:
      "Para permitir que o gestor libere um lote vencido do produto, para mudar um produto e para tirar de linha um " +
      "produto que não é mais feito.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.fc",
        instrucao: "Veja o FC, fruto de acerola",
        explicacao: "A acerola aguenta um pouco depois da validade, por isso o FC tem dias de liberação.",
        preenche: { "editar.produto": "FC" },
      },
      {
        cena: "editar",
        alvo: "form.liberacao",
        instrucao: "Dias de liberação após vencimento",
        explicacao:
          `O gestor pode liberar um lote vencido do FC por até 2 dias depois da validade, no Estoque. O ` +
          `${LOTE_VENCIDO.codigo} venceu em ${LOTE_VENCIDO.validade} e pode sair até ${LOTE_VENCIDO.liberadoAte}.`,
        dica: "Vazio, o lote vencido do produto não pode ser liberado. O máximo é 365 dias.",
      },
      {
        cena: "editar",
        alvo: "form.validade",
        instrucao: "Mudanças valem para os próximos lotes",
        explicacao:
          "Mudar a validade ou o código vale para os lotes novos: os já feitos mantêm o número e a validade. O preço de " +
          "referência novo já vem sugerido no próximo pedido. A Auditoria registra o antes e o depois.",
      },
      {
        cena: "lista",
        alvo: "lista.acr",
        instrucao: "Ache o produto que saiu de linha",
        explicacao: "No exemplo, a fazenda deixou de fazer a ACR, polpa de acerola resfriada.",
      },
      {
        cena: "lista",
        alvo: "lista.inativar",
        instrucao: "Clique em “Inativar”",
        explicacao: "Não pede confirmação: o status muda na hora.",
      },
      {
        cena: "lista",
        alvo: "lista.acr",
        instrucao: "Confira o status",
        explicacao:
          "Inativo. A ACR some da produção da OP (e um fruto inativo, da Recepção de fruto). Os lotes que já existem " +
          "continuam no estoque e podem ser vendidos.",
        preenche: { "lista.acr": "Inativo" },
      },
      {
        cena: "lista",
        alvo: "lista.inativar",
        instrucao: "Voltou a fazer? Clique em “Reativar”",
        explicacao: "O produto volta para a OP com o cadastro como estava.",
      },
    ],
    eDepois: {
      texto:
        "Para liberar o lote vencido, o gestor clica em “Liberar” na linha do lote, no Estoque. Produto não é " +
        "excluído: inative o que não é mais feito.",
    },
  }),
];
