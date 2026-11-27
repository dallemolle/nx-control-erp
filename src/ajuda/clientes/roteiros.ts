import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { DIVERSOS, POLAR, TUCUMA, VER_O_PESO } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_CADASTRA =
  "Quem pode: perfis Administrador, Financeiro, Tesouraria e Vendas, com permissão de alteração na filial. Os demais " +
  "perfis veem a lista, sem os botões.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "cadastrar-cliente",
    titulo: "Cadastrar um cliente",
    quandoUsar:
      "Antes da primeira venda ou conta a receber de um cliente novo. O que você informa aqui já vem preenchido no " +
      "pedido.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.novo",
        instrucao: "Clique em “Novo cliente”",
        explicacao:
          "O cadastro é da empresa: vale para todas as filiais. No exemplo, a Rita cadastra a Sorveteria Polar, que " +
          "faz o primeiro pedido amanhã.",
      },
      {
        cena: "novo",
        alvo: "form.nome",
        instrucao: "Informe o nome",
        explicacao: "O nome que aparece no pedido, nos títulos e nos relatórios. É o único campo obrigatório.",
        preenche: { "form.nome": POLAR.nome },
      },
      {
        cena: "novo",
        alvo: "form.cnpj",
        instrucao: "Informe o CNPJ ou CPF",
        explicacao:
          "Pode digitar só os números: ao salvar, o sistema põe a pontuação. São aceitos 11 dígitos (CPF) ou 14 " +
          "(CNPJ).",
        dica: "Não pode repetir: se outro cliente já tiver esse documento, aparece “Já existe um cliente com este CPF/CNPJ”.",
        preenche: { "form.cnpj": POLAR.cnpjDigitado },
      },
      {
        cena: "novo",
        alvo: "form.contato",
        instrucao: "Informe com quem falar",
        explicacao: "O nome da pessoa de contato no cliente. Na Sorveteria Polar, o Rui.",
        preenche: { "form.contato": POLAR.contato },
      },
      {
        cena: "novo",
        alvo: "form.telefone",
        instrucao: "Informe o telefone",
        explicacao: "Email e telefone são opcionais. A coluna Contato da lista mostra o email ou, sem email, o telefone.",
        preenche: { "form.telefone": POLAR.telefone },
      },
      {
        cena: "novo",
        alvo: "form.classificacao",
        instrucao: "Escolha a classificação padrão",
        explicacao:
          "Fiscal para quem compra com nota; Gerencial para quem compra sem nota. Ela já vem escolhida no pedido e nas " +
          "contas a receber do cliente. Com Nenhuma, o pedido vem como Gerencial e a conta a receber como Fiscal; você " +
          "escolhe em cada um. No exemplo, fica Nenhuma.",
      },
      {
        cena: "novo",
        alvo: "form.canal",
        instrucao: "Escolha o canal de venda",
        explicacao: "Que tipo de cliente é: batedor, atacado, varejo, restaurante, indústria ou consumidor final. O pedido já vem com ele.",
        preenche: { "form.canal": POLAR.canal },
      },
      {
        cena: "novo",
        alvo: "form.municipio",
        instrucao: "Informe o município",
        explicacao: "Opcional, para consulta.",
        preenche: { "form.municipio": POLAR.municipio },
      },
      {
        cena: "novo",
        alvo: "form.endereco",
        instrucao: "Informe o endereço de entrega",
        explicacao:
          "Vai para o pedido e, dele, para a entrega. Mudar o endereço num pedido ou numa entrega não muda o cadastro.",
        preenche: { "form.endereco": POLAR.endereco },
      },
      {
        cena: "novo",
        alvo: "form.retira",
        instrucao: "Deixe “Retira na propriedade” desmarcado",
        explicacao:
          "Desmarcado, cada pedido do cliente gera uma entrega. Marque para quem vem buscar: o pedido não gera entrega. " +
          "No pedido dá para mudar, venda a venda.",
      },
      {
        cena: "novo",
        alvo: "form.tipo",
        instrucao: "Dados bancários: opcionais",
        explicacao:
          "Pix ou depósito, por exemplo para devolver um valor ao cliente. Ficam guardados no cadastro; nenhuma outra " +
          "tela os mostra. No exemplo, fica Nenhum.",
      },
      {
        cena: "novo",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "Se faltar algo ou o documento estiver errado, a mensagem aparece acima do botão e a janela continua aberta.",
      },
      {
        cena: "lista",
        alvo: "lista.polar",
        instrucao: "Confira na lista",
        explicacao: "A Sorveteria Polar entra em ordem de nome, com o CNPJ formatado, o canal e o telefone.",
        preenche: { "lista.polar": "sim" },
      },
    ],
    eDepois: {
      texto:
        "No Novo pedido, ao escolher a Sorveteria Polar, o canal, a classificação, o endereço e o “Retira na " +
        "propriedade” já vêm do cadastro. É assim que nasce o pedido 131.",
      proximoRoteiro: "cadastrar-sem-documento",
    },
  }),

  roteiro({
    id: "cadastrar-sem-documento",
    titulo: "Cadastrar um cliente sem documento",
    quandoUsar:
      "Para as vendas de balcão e da maquininha a quem não precisa de cadastro: um cliente “Clientes diversos”, sem " +
      "CNPJ/CPF.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.novo",
        instrucao: "Clique em “Novo cliente”",
        explicacao: "Um cadastro só serve para todas as vendas avulsas.",
        preenche: { "lista.polar": "sim" },
      },
      {
        cena: "novo",
        alvo: "form.nome",
        instrucao: "Dê um nome genérico",
        explicacao: "Por exemplo, “Clientes diversos” ou “Consumidor final”.",
        preenche: { "form.nome": DIVERSOS.nome },
      },
      {
        cena: "novo",
        alvo: "form.cnpj",
        instrucao: "Deixe o CNPJ/CPF em branco",
        explicacao: "No cliente, o documento é opcional. Sem documento, pode haver mais de um cliente assim.",
      },
      {
        cena: "novo",
        alvo: "form.canal",
        instrucao: "Escolha “Consumidor final”",
        explicacao: "O canal das vendas avulsas.",
        preenche: { "form.canal": DIVERSOS.canal },
      },
      {
        cena: "novo",
        alvo: "form.retira",
        instrucao: "Marque “Retira na propriedade”",
        explicacao: "Quem compra no balcão leva na hora: o pedido não gera entrega.",
        preenche: { "form.retira": "sim" },
      },
      {
        cena: "novo",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "Os outros campos podem ficar em branco.",
      },
      {
        cena: "lista",
        alvo: "lista.diversos",
        instrucao: "Confira na lista",
        explicacao: "Sem documento e sem contato, as colunas mostram “—”.",
        preenche: { "lista.diversos": "sim" },
      },
    ],
    eDepois: {
      texto:
        "Use “Clientes diversos” no Novo pedido das vendas avulsas, inclusive na maquininha. Para quem compra sempre, " +
        "vale fazer um cadastro próprio: o Relatório de vendas separa as compras por cliente.",
      proximoRoteiro: "editar-cliente",
    },
  }),

  roteiro({
    id: "editar-cliente",
    titulo: "Mudar o cadastro de um cliente",
    quandoUsar: "Quando o cliente muda de telefone, endereço, canal ou dados bancários.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.editar",
        instrucao: "Clique em “Editar” na linha do cliente",
        explicacao:
          `No exemplo, o ${VER_O_PESO.nome} passou uma chave Pix. O que você muda vale para os próximos pedidos e ` +
          "títulos; os já lançados ficam como estavam.",
        preenche: { "lista.polar": "sim", "lista.diversos": "sim" },
      },
      {
        cena: "editar",
        alvo: "form.tipo",
        instrucao: "Escolha o tipo “PIX”",
        explicacao: "Aparecem o tipo de chave e a chave. Com “Depósito bancário”, aparecem banco, agência, conta, tipo de conta e titular.",
        preenche: { "form.tipo": "PIX" },
      },
      {
        cena: "editar",
        alvo: "form.tipoChave",
        instrucao: "Escolha o tipo de chave",
        explicacao: "CPF/CNPJ, celular, email ou chave aleatória.",
        preenche: { "form.tipoChave": VER_O_PESO.tipoChave },
      },
      {
        cena: "editar",
        alvo: "form.chave",
        instrucao: "Informe a chave",
        explicacao: "Com PIX, o tipo de chave e a chave são obrigatórios.",
        preenche: { "form.chave": VER_O_PESO.telefone },
      },
      {
        cena: "editar",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "Só fica o tipo escolhido: se um dia trocar para depósito, a chave Pix é apagada ao salvar.",
      },
      {
        cena: "lista",
        alvo: "lista.tabela",
        instrucao: "A lista não muda",
        explicacao: "Os dados bancários não aparecem na lista. Para consultar, abra o “Editar” do cliente.",
      },
    ],
    eDepois: {
      texto: "Toda mudança no cadastro fica registrada na Auditoria, com o valor de antes e o de depois.",
      proximoRoteiro: "inativar-cliente",
    },
  }),

  roteiro({
    id: "inativar-cliente",
    titulo: "Inativar e reativar um cliente",
    quandoUsar: "Quando o cliente deixa de comprar. Cliente não é excluído: é inativado.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.tucuma",
        instrucao: "Ache o cliente na lista",
        explicacao: `No exemplo, a ${TUCUMA} fechou e não compra mais.`,
        preenche: { "lista.polar": "sim", "lista.diversos": "sim" },
      },
      {
        cena: "lista",
        alvo: "lista.inativar",
        instrucao: "Clique em “Inativar”",
        explicacao: "Não pede confirmação: o status muda na hora.",
      },
      {
        cena: "lista",
        alvo: "lista.tucuma",
        instrucao: "Confira o status",
        explicacao:
          "Inativo. O cliente some da escolha do Novo pedido e da conta a receber nova. Os pedidos e os títulos " +
          "antigos continuam como estavam, e ele continua nos filtros e nos relatórios.",
        dica:
          "Ao editar um título antigo dele, o cliente aparece como “(inativo)” e pode ficar; só não dá para lançar " +
          "título novo nem trocar outro título para ele.",
        preenche: { "lista.tucuma": "Inativo" },
      },
      {
        cena: "lista",
        alvo: "lista.inativar",
        instrucao: "Voltou a comprar? Clique em “Reativar”",
        explicacao: "O cliente volta a aparecer no Novo pedido, com o cadastro como estava.",
      },
    ],
    eDepois: {
      texto: "Fornecedores se inativam do mesmo jeito, em Cadastros → Fornecedores.",
    },
  }),
];
