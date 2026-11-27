import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { ESCRITORIO, MSG_TIPO_CAIXA, SICREDI, TIPO_CAIXA, TIPO_CORRENTE, TROCO } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_CADASTRA =
  "Quem pode: perfis Administrador, Financeiro e Tesouraria, com permissão de alteração na filial. Os demais perfis " +
  "veem a lista, sem os botões.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "cadastrar-conta",
    titulo: "Cadastrar uma conta no banco",
    quandoUsar:
      "Na implantação do sistema e sempre que a filial abrir uma conta nova. Sem a conta cadastrada, não há onde " +
      "lançar as baixas, os lançamentos e o extrato dela.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.nova",
        instrucao: "Clique em “Nova conta bancária”",
        explicacao:
          "A conta é da filial: cada filial cadastra as suas. No exemplo, a filial abriu uma conta corrente no Sicredi.",
      },
      {
        cena: "nova",
        alvo: "form.tipo",
        instrucao: "Confira o tipo",
        explicacao:
          "Conta corrente (o padrão), Aplicação, Investimento, Empréstimo/financiamento ou Caixa (dinheiro em espécie). " +
          "Só o Caixa muda o formulário e as regras; os demais funcionam igual.",
        preenche: { "form.tipo": TIPO_CORRENTE },
      },
      {
        cena: "nova",
        alvo: "form.banco",
        instrucao: "Escolha o banco",
        explicacao: "A lista vem de Cadastros → Bancos. Se o banco não estiver lá, cadastre-o antes.",
        preenche: { "form.banco": SICREDI.banco },
      },
      {
        cena: "nova",
        alvo: "form.agencia",
        instrucao: "Informe a agência",
        explicacao: "Como está no extrato.",
        preenche: { "form.agencia": SICREDI.agencia },
      },
      {
        cena: "nova",
        alvo: "form.conta",
        instrucao: "Informe a conta",
        explicacao: "Com o dígito, como está no extrato.",
        preenche: { "form.conta": SICREDI.conta },
      },
      {
        cena: "nova",
        alvo: "form.moeda",
        instrucao: "Confira a moeda",
        explicacao: "Já vem BRL (real).",
      },
      {
        cena: "nova",
        alvo: "form.saldo",
        instrucao: "Saldo inicial: 0 para conta nova",
        explicacao:
          "O saldo inicial vale desde antes do primeiro lançamento: entra no saldo de todos os meses, na Tesouraria e " +
          "no Fluxo de caixa. Conta nova começa com 0, e o dinheiro entra pelos lançamentos e transferências.",
        dica:
          "Na implantação do sistema, informe o saldo do extrato no dia anterior ao primeiro lançamento que será " +
          "registrado no sistema.",
      },
      {
        cena: "nova",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "Se faltar algo, a mensagem aparece acima do botão e a janela continua aberta.",
      },
      {
        cena: "lista",
        alvo: "lista.sicredi",
        instrucao: "Confira na lista",
        explicacao: "A lista mostra as contas na ordem em que foram cadastradas, com o saldo inicial em reais.",
        preenche: { "lista.sicredi": "sim" },
      },
    ],
    eDepois: {
      texto:
        "A conta passa a aparecer na Tesouraria (lançamentos, transferências e saldo), na baixa dos títulos, na " +
        "Conciliação e no Fluxo de caixa. Para pôr dinheiro nela, faça uma transferência na Tesouraria.",
      proximoRoteiro: "cadastrar-caixa",
    },
  }),

  roteiro({
    id: "cadastrar-caixa",
    titulo: "Cadastrar um caixa (dinheiro em espécie)",
    quandoUsar: "Para o dinheiro guardado na empresa: o caixa do escritório, da fazenda, da loja. Pode haver mais de um.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.nova",
        instrucao: "Clique em “Nova conta bancária”",
        explicacao:
          "O caixa também é cadastrado aqui. No exemplo, a filial já tem o Caixa · Fazenda e passa a guardar troco no " +
          "escritório.",
        preenche: { "lista.sicredi": "sim" },
      },
      {
        cena: "nova",
        alvo: "form.tipo",
        instrucao: "Escolha “Caixa (dinheiro em espécie)”",
        explicacao: "Banco e agência somem: o sistema usa um banco interno, o “Caixa interno”.",
        preenche: { "form.tipo": TIPO_CAIXA },
      },
      {
        cena: "nova",
        alvo: "form.conta",
        instrucao: "Dê uma identificação",
        explicacao: "Onde o dinheiro fica: “Escritório”, “Fazenda”, “Loja”.",
        preenche: { "form.conta": ESCRITORIO.conta },
      },
      {
        cena: "nova",
        alvo: "form.saldo",
        instrucao: "Deixe o saldo inicial em 0",
        explicacao:
          `O troco de ${TROCO} sai do Caixa · Fazenda: depois de salvar, faça uma transferência na Tesouraria. Pôr ` +
          "os R$ 300 no saldo inicial contaria duas vezes o mesmo dinheiro, e desde o início do ano.",
      },
      {
        cena: "nova",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "Pronto: o caixa já aparece na Tesouraria.",
      },
      {
        cena: "lista",
        alvo: "lista.escritorio",
        instrucao: "Confira na lista",
        explicacao: "No caixa, a coluna Banco mostra “Caixa interno (dinheiro em espécie)” e a Agência, “—”.",
        preenche: { "lista.escritorio": "sim" },
      },
    ],
    eDepois: {
      texto:
        "No Novo pedido, a venda em Dinheiro só aceita conta Caixa. Os lançamentos do caixa já entram conciliados: ele " +
        "não tem extrato e não aparece na Conciliação nem nas Operadoras de cartão. Para conferir o dinheiro contado, " +
        "informe o saldo na Tesouraria.",
      proximoRoteiro: "corrigir-inativar",
    },
  }),

  roteiro({
    id: "corrigir-inativar",
    titulo: "Corrigir ou inativar uma conta",
    quandoUsar: "Quando um dado da conta está errado ou a conta foi encerrada. Conta não é excluída: é inativada.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.editar",
        instrucao: "Clique em “Editar” na linha da conta",
        explicacao: "Abre o mesmo formulário, preenchido. No exemplo, a conta do Banco do Brasil.",
        preenche: { "lista.sicredi": "sim", "lista.escritorio": "sim" },
      },
      {
        cena: "editar",
        alvo: "form.saldo",
        instrucao: "Saldo inicial errado? Corrija aqui",
        explicacao:
          "Mudar o saldo inicial muda o saldo de todos os meses, na Tesouraria e no Fluxo de caixa. A Auditoria " +
          "registra o valor de antes e o de depois. No exemplo, o saldo fica como está.",
      },
      {
        cena: "editar",
        alvo: "form.tipo",
        instrucao: "Trocar para Caixa?",
        explicacao:
          "Entre conta corrente, aplicação, investimento e empréstimo a troca é livre. De ou para Caixa, só enquanto a " +
          "conta não tiver lançamentos.",
        preenche: { "form.tipo": TIPO_CAIXA },
      },
      {
        cena: "editar",
        alvo: "form.erro",
        instrucao: "Veja a mensagem ao salvar",
        explicacao: "O Banco do Brasil já tem lançamentos: a troca é recusada e nada muda. Feche a janela sem salvar.",
        preenche: { "form.erro": MSG_TIPO_CAIXA },
      },
      {
        cena: "lista",
        alvo: "lista.santander",
        instrucao: "Ache a conta encerrada",
        explicacao:
          "A conta do Santander foi encerrada em outubro: o dinheiro foi transferido para o Banco do Brasil e o saldo " +
          "dela está zerado.",
      },
      {
        cena: "lista",
        alvo: "lista.inativar",
        instrucao: "Clique em “Inativar”",
        explicacao: "Não pede confirmação: o status muda na hora.",
      },
      {
        cena: "lista",
        alvo: "lista.santander",
        instrucao: "Confira o status",
        explicacao:
          "Inativo. A conta sai da Tesouraria e das escolhas de conta no título novo e na baixa. O Fluxo de caixa e os " +
          "relatórios continuam contando o que passou por ela, então os meses passados não mudam. Nada é apagado.",
        dica:
          "Só dá para inativar conta com saldo contábil zero: se ainda houver dinheiro, transfira para outra conta na " +
          "Tesouraria antes. A tela avisa o saldo.",
        preenche: { "lista.santander": "Inativo" },
      },
      {
        cena: "lista",
        alvo: "lista.inativar",
        instrucao: "Precisa dela de novo? Clique em “Reativar”",
        explicacao: "A conta volta para a Tesouraria e para o Fluxo de caixa.",
      },
    ],
    eDepois: {
      texto:
        "Trocou de banco? Cadastre a conta nova com saldo inicial 0, transfira o dinheiro na Tesouraria e só então " +
        "inative a antiga, já zerada.",
    },
  }),
];
