import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { CATEGORIA_TAXA, CONTA_SICREDI, PAGUE, TAXA_DEBITO_NOVA, VENDA_10X, VENDA_3X } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_CADASTRA =
  "Quem pode: perfis Administrador, Financeiro e Tesouraria, com permissão de alteração na filial. Os demais perfis " +
  "veem a lista, sem os botões.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "cadastrar-operadora",
    titulo: "Cadastrar uma operadora",
    quandoUsar:
      "Antes da primeira venda numa maquininha nova. Sem a operadora, o pedido não tem a forma de pagamento Cartão " +
      "com ela.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.nova",
        instrucao: "Clique em “Nova operadora”",
        explicacao:
          "A operadora é da filial. No exemplo, a loja ganhou uma segunda maquininha, da Pague Norte, além da Cartões " +
          "Rurais.",
      },
      {
        cena: "nova",
        alvo: "form.nome",
        instrucao: "Informe o nome",
        explicacao: "Como a operadora aparece no pedido e nos repasses. Não pode repetir na filial.",
        preenche: { "form.nome": PAGUE.nome },
      },
      {
        cena: "nova",
        alvo: "form.cnpj",
        instrucao: "Informe o CNPJ da operadora",
        explicacao:
          "Com ou sem pontuação. Ao salvar, o sistema procura o fornecedor e o cliente com esse CNPJ e cria os que " +
          "faltam: a taxa sai como conta a pagar ao fornecedor, e os repasses como contas a receber do cliente.",
        dica: "Se o fornecedor ou o cliente com esse CNPJ estiver inativo, a operadora é recusada: reative o cadastro antes.",
        preenche: { "form.cnpj": PAGUE.cnpjDigitado },
      },
      {
        cena: "nova",
        alvo: "form.conta",
        instrucao: "Escolha a conta de depósito",
        explicacao:
          "Onde a operadora deposita os repasses. Só aparecem as contas ativas da filial que não são Caixa: dinheiro de " +
          "cartão sempre cai no banco.",
        preenche: { "form.conta": CONTA_SICREDI },
      },
      {
        cena: "nova",
        alvo: "form.categoria",
        instrucao: "Escolha a categoria da taxa",
        explicacao: `Uma categoria de despesa da filial, como “${CATEGORIA_TAXA}”. É a categoria da conta a pagar da taxa.`,
        preenche: { "form.categoria": CATEGORIA_TAXA },
      },
      {
        cena: "nova",
        alvo: "form.condicoes",
        instrucao: "Informe as condições",
        explicacao:
          "Uma linha por modalidade: a taxa (% sobre o valor da venda) e o prazo do repasse, em dias corridos. No " +
          "exemplo: débito 1,2% em 1 dia, crédito à vista 2,9% em 30 dias e Pix na maquininha 0,8% em 0 dias (no mesmo " +
          "dia).",
        dica: "Débito, crédito à vista e Pix aparecem uma vez cada. Só a modalidade que estiver aqui aparece no pedido.",
        preenche: { "form.condicoes": "sim" },
      },
      {
        cena: "nova",
        alvo: "form.adicionar",
        instrucao: "“Adicionar condição” abre outra linha",
        explicacao: "E “Remover” tira uma linha. O crédito parcelado fica para o próximo roteiro.",
      },
      {
        cena: "nova",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "Se faltar algo ou uma condição estiver errada, a mensagem aparece acima do botão.",
      },
      {
        cena: "lista",
        alvo: "lista.condicoesPague",
        instrucao: "Confira na lista",
        explicacao: "A coluna Condições mostra cada modalidade com a taxa e o prazo.",
        preenche: { "lista.pague": "sim" },
      },
    ],
    eDepois: {
      texto:
        "No Novo pedido, a forma Cartão passa a oferecer a Pague Norte. A venda gera os repasses a receber no Sicredi " +
        "e a conta a pagar da taxa; o depósito é confirmado em Repasses de cartão.",
      proximoRoteiro: "parcelado",
    },
  }),

  roteiro({
    id: "parcelado",
    titulo: "Condições do crédito parcelado",
    quandoUsar:
      "Para vender parcelado na maquininha. Cada faixa de parcelas tem a sua taxa, e a operadora pode pagar tudo de " +
      "uma vez (antecipado) ou uma parcela por mês.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.editarPague",
        instrucao: "Clique em “Editar” na Pague Norte",
        explicacao: "As condições ficam no mesmo formulário.",
        preenche: { "lista.pague": "sim", "editar.operadora": "pague" },
      },
      {
        cena: "editar",
        alvo: "form.adicionar",
        instrucao: "Clique em “Adicionar condição”",
        explicacao: "Escolha “Crédito parcelado” na linha nova: aparecem os campos da faixa de parcelas.",
      },
      {
        cena: "editar",
        alvo: "form.parcelado",
        instrucao: "Faixa de 2 a 6x, sem antecipação",
        explicacao:
          `3,9% em 30 dias. Sem antecipação, vem um repasse por parcela, de 30 em 30 dias: uma venda de R$ ` +
          `${VENDA_3X.valor} em ${VENDA_3X.parcelas}x gera ${VENDA_3X.parcelas} repasses de ` +
          `${VENDA_3X.liquidoPorRepasse} líquidos, em ${VENDA_3X.datas.join(", ")}.`,
        preenche: { "form.parcelado": "1" },
      },
      {
        cena: "editar",
        alvo: "form.antecipado",
        instrucao: "Faixa de 7 a 12x, antecipada",
        explicacao:
          `5,5% em 30 dias, com “Antecipado” marcado: a operadora paga tudo de uma vez, no prazo. Uma venda de R$ ` +
          `${VENDA_10X.valor.toLocaleString("pt-BR")} em ${VENDA_10X.parcelas}x gera um repasse só, de ` +
          `${VENDA_10X.liquido}, em ${VENDA_10X.data}.`,
        dica:
          "As faixas vão de 2 a 12 parcelas e não podem se cruzar: 2–6x e 6–12x dá “As faixas do parcelado se " +
          "sobrepõem”. Parcelas fora de qualquer faixa não aparecem no pedido.",
        preenche: { "form.parcelado": "2" },
      },
      {
        cena: "editar",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "As condições novas valem para as vendas daqui em diante.",
      },
      {
        cena: "lista",
        alvo: "lista.condicoesPague",
        instrucao: "Confira na lista",
        explicacao: "O parcelado aparece com a faixa; o antecipado, com “antecipado em 30 dias”.",
      },
    ],
    eDepois: {
      texto:
        "No pedido, ao escolher Crédito parcelado e o número de parcelas, o sistema acha a faixa e mostra os repasses " +
        "com as datas, o bruto, a taxa e o líquido.",
      proximoRoteiro: "mudar-inativar",
    },
  }),

  roteiro({
    id: "mudar-inativar",
    titulo: "Mudar a taxa e inativar uma operadora",
    quandoUsar: "Quando a operadora muda a taxa ou o prazo, ou quando a maquininha deixa de ser usada.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.editarRurais",
        instrucao: "Clique em “Editar” na Cartões Rurais",
        explicacao: "No exemplo, a Cartões Rurais baixou a taxa do débito.",
        preenche: { "lista.pague": "sim", "form.parcelado": "2", "editar.operadora": "rurais" },
      },
      {
        cena: "editar",
        alvo: "form.taxaDebito",
        instrucao: "Mude a taxa",
        explicacao:
          "De 1,5% para 1,4%. Vale para as vendas novas: cada pedido guarda a taxa da hora da venda, e os repasses já " +
          "lançados não mudam.",
        preenche: { "form.taxaDebito": String(TAXA_DEBITO_NOVA) },
      },
      {
        cena: "editar",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "A Auditoria registra as condições de antes e as de depois.",
      },
      {
        cena: "lista",
        alvo: "lista.condicoesRurais",
        instrucao: "Confira a taxa nova",
        explicacao: "Débito · 1,4% · 1 dia.",
      },
      {
        cena: "lista",
        alvo: "lista.porto",
        instrucao: "Ache a maquininha que saiu de uso",
        explicacao: "No exemplo, a Maquininha do Porto foi devolvida.",
      },
      {
        cena: "lista",
        alvo: "lista.inativar",
        instrucao: "Clique em “Inativar”",
        explicacao: "Não pede confirmação: o status muda na hora.",
      },
      {
        cena: "lista",
        alvo: "lista.porto",
        instrucao: "Confira o status",
        explicacao:
          "Inativa. Ela some do Novo pedido; os repasses que ainda faltam receber continuam em Repasses de cartão.",
        dica:
          "Não inative em Cadastros o fornecedor nem o cliente de uma operadora em uso: ao salvar a operadora de novo, " +
          "ela é recusada até você reativá-los.",
        preenche: { "lista.porto": "Inativa" },
      },
      {
        cena: "lista",
        alvo: "lista.inativar",
        instrucao: "Voltou a usar? Clique em “Reativar”",
        explicacao: "A operadora volta para o pedido com as condições como estavam.",
      },
    ],
    eDepois: {
      texto: "Para conferir os depósitos das operadoras, use Financeiro → Repasses de cartão.",
    },
  }),
];
