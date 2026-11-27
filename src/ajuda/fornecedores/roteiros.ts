import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { EMBALAGENS, RAIMUNDO, SITIO } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_CADASTRA =
  "Quem pode: perfis Administrador, Financeiro e Tesouraria, com permissão de alteração na filial. Os demais perfis " +
  "veem a lista, sem os botões.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "cadastrar-fornecedor",
    titulo: "Cadastrar um fornecedor",
    quandoUsar:
      "Antes da primeira conta a pagar de um fornecedor novo. A classificação escolhida aqui já vem nas contas a " +
      "pagar dele.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.novo",
        instrucao: "Clique em “Novo fornecedor”",
        explicacao:
          "O cadastro é da empresa: vale para todas as filiais. No exemplo, a Maria cadastra a Embalagens Norte, que " +
          "vende os sacos de polpa.",
      },
      {
        cena: "novo",
        alvo: "form.nome",
        instrucao: "Informe o nome",
        explicacao: "O nome que aparece nas contas a pagar, na recepção de fruto e nos relatórios.",
        preenche: { "form.nome": EMBALAGENS.nome },
      },
      {
        cena: "novo",
        alvo: "form.cnpj",
        instrucao: "Informe o CNPJ ou CPF",
        explicacao:
          "Obrigatório no fornecedor. Pode digitar só os números: ao salvar, o sistema põe a pontuação. São aceitos 11 " +
          "dígitos (CPF) ou 14 (CNPJ).",
        dica: "Não pode repetir: se outro fornecedor já tiver esse documento, aparece “Já existe um fornecedor com este CPF/CNPJ”.",
        preenche: { "form.cnpj": EMBALAGENS.cnpjDigitado },
      },
      {
        cena: "novo",
        alvo: "form.contato",
        instrucao: "Informe com quem falar",
        explicacao: "O nome da pessoa de contato no fornecedor. Opcional, como email e telefone.",
        preenche: { "form.contato": EMBALAGENS.contato },
      },
      {
        cena: "novo",
        alvo: "form.telefone",
        instrucao: "Informe o telefone",
        explicacao: "A coluna Contato da lista mostra o email ou, sem email, o telefone.",
        preenche: { "form.telefone": EMBALAGENS.telefone },
      },
      {
        cena: "novo",
        alvo: "form.municipio",
        instrucao: "Informe o município",
        explicacao: "Opcional, para consulta.",
        preenche: { "form.municipio": EMBALAGENS.municipio },
      },
      {
        cena: "novo",
        alvo: "form.classificacao",
        instrucao: "Escolha “Fiscal”",
        explicacao:
          "Fiscal para quem emite nota; Gerencial para quem não emite. A conta a pagar nova do fornecedor já vem com " +
          "ela, e dá para mudar em cada título. Com Nenhuma, a conta a pagar vem como Fiscal.",
        preenche: { "form.classificacao": EMBALAGENS.classificacao },
      },
      {
        cena: "novo",
        alvo: "form.tipo",
        instrucao: "Dados bancários: escolha “Depósito bancário”",
        explicacao:
          "Opcional: Pix ou depósito, para quem vai pagar. Aparecem no detalhe das contas a pagar do fornecedor " +
          "(clique na linha do título) e na tela de baixa, ao lado do nome.",
        preenche: { "form.tipo": "Depósito bancário" },
      },
      {
        cena: "novo",
        alvo: "form.banco",
        instrucao: "Escolha o banco",
        explicacao: "A lista vem de Cadastros → Bancos.",
        preenche: { "form.banco": EMBALAGENS.banco },
      },
      {
        cena: "novo",
        alvo: "form.agencia",
        instrucao: "Informe agência e conta",
        explicacao: "Como o fornecedor passou, com o dígito.",
        preenche: { "form.agencia": EMBALAGENS.agencia, "form.conta": EMBALAGENS.conta },
      },
      {
        cena: "novo",
        alvo: "form.tipoConta",
        instrucao: "Escolha o tipo de conta",
        explicacao: "Corrente ou poupança. Com depósito, banco, agência, conta e tipo de conta são obrigatórios.",
        preenche: { "form.tipoConta": EMBALAGENS.tipoConta },
      },
      {
        cena: "novo",
        alvo: "form.titular",
        instrucao: "Informe o titular",
        explicacao: "O nome de quem é a conta. Opcional; ajuda a conferir quando a conta é de outro nome.",
        preenche: { "form.titular": EMBALAGENS.nome },
      },
      {
        cena: "novo",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "Se faltar algo ou o documento estiver errado, a mensagem aparece acima do botão e a janela continua aberta.",
      },
      {
        cena: "lista",
        alvo: "lista.embalagens",
        instrucao: "Confira na lista",
        explicacao: "A Embalagens Norte entra em ordem de nome, com o CNPJ formatado e o telefone.",
        preenche: { "lista.embalagens": "sim" },
      },
    ],
    eDepois: {
      texto:
        "No Contas a pagar, ao escolher a Embalagens Norte num título novo, a classificação já vem Fiscal. Os sacos " +
        "também podem ser cadastrados como insumo (Cadastros → Insumos) para entrar no custo da OP.",
      proximoRoteiro: "cadastrar-produtor",
    },
  }),

  roteiro({
    id: "cadastrar-produtor",
    titulo: "Cadastrar um produtor que vende sem nota",
    quandoUsar:
      "Para o produtor que entrega fruto e recebe por recibo, sem nota. Ele precisa estar cadastrado antes da " +
      "Recepção de fruto.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.novo",
        instrucao: "Clique em “Novo fornecedor”",
        explicacao: "No exemplo, o Raimundo Ferreira, produtor de açaí de Igarapé-Miri, vai entregar fruto amanhã.",
        preenche: { "lista.embalagens": "sim" },
      },
      {
        cena: "novo",
        alvo: "form.nome",
        instrucao: "Informe o nome do produtor",
        explicacao: "Pessoa física: o nome dele.",
        preenche: { "form.nome": RAIMUNDO.nome },
      },
      {
        cena: "novo",
        alvo: "form.cnpj",
        instrucao: "Informe o CPF",
        explicacao: "Mesmo sem nota, o documento é obrigatório: 11 dígitos, com ou sem pontuação.",
        preenche: { "form.cnpj": RAIMUNDO.cpfDigitado },
      },
      {
        cena: "novo",
        alvo: "form.telefone",
        instrucao: "Informe o telefone",
        explicacao: "Para combinar as entregas.",
        preenche: { "form.telefone": RAIMUNDO.telefone },
      },
      {
        cena: "novo",
        alvo: "form.municipio",
        instrucao: "Informe o município",
        explicacao: "De onde vem o fruto. Opcional, para consulta.",
        preenche: { "form.municipio": RAIMUNDO.municipio },
      },
      {
        cena: "novo",
        alvo: "form.classificacao",
        instrucao: "Escolha “Gerencial”",
        explicacao:
          "Na Recepção de fruto, a compra dele já vem Gerencial e não pede o número da nota do produtor; a conta a " +
          "pagar sai com recibo. Com Fiscal, a recepção exige o número da nota.",
        preenche: { "form.classificacao": RAIMUNDO.classificacao },
      },
      {
        cena: "novo",
        alvo: "form.tipo",
        instrucao: "Dados bancários: escolha “PIX”",
        explicacao: "Aparecem o tipo de chave e a chave.",
        preenche: { "form.tipo": "PIX" },
      },
      {
        cena: "novo",
        alvo: "form.tipoChave",
        instrucao: "Escolha o tipo de chave",
        explicacao: "CPF/CNPJ, celular, email ou chave aleatória. O Raimundo usa o CPF.",
        preenche: { "form.tipoChave": RAIMUNDO.tipoChave },
      },
      {
        cena: "novo",
        alvo: "form.chave",
        instrucao: "Informe a chave",
        explicacao: "Com PIX, o tipo de chave e a chave são obrigatórios. Confira com o produtor antes de salvar.",
        preenche: { "form.chave": RAIMUNDO.cpfDigitado },
      },
      {
        cena: "novo",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "Só fica o tipo escolhido: se um dia trocar para depósito, a chave Pix é apagada ao salvar.",
      },
      {
        cena: "lista",
        alvo: "lista.raimundo",
        instrucao: "Confira na lista",
        explicacao: "O CPF aparece formatado. Os dados bancários não aparecem na lista.",
        preenche: { "lista.raimundo": "sim" },
      },
    ],
    eDepois: {
      texto:
        "Na Recepção de fruto, escolha a origem Terceiro e o Raimundo Ferreira como fornecedor: a recepção cria a " +
        "conta a pagar do fruto em nome dele, e o lote mostra de quem veio na Rastreabilidade.",
      proximoRoteiro: "inativar-fornecedor",
    },
  }),

  roteiro({
    id: "inativar-fornecedor",
    titulo: "Mudar, inativar e reativar um fornecedor",
    quandoUsar: "Quando o fornecedor muda de dados ou deixa de vender. Fornecedor não é excluído: é inativado.",
    quemPode: QUEM_CADASTRA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.editar",
        instrucao: "Para mudar o cadastro, use “Editar”",
        explicacao:
          "Abre o mesmo formulário, preenchido. O que você muda vale para os próximos títulos e recepções; os já " +
          "lançados ficam como estavam. A Auditoria registra o antes e o depois.",
        preenche: { "lista.embalagens": "sim", "lista.raimundo": "sim" },
      },
      {
        cena: "lista",
        alvo: "lista.sitio",
        instrucao: "Ache o fornecedor que parou de vender",
        explicacao: `No exemplo, o ${SITIO} entregou fruto em setembro e outubro e não vende mais.`,
      },
      {
        cena: "lista",
        alvo: "lista.inativar",
        instrucao: "Clique em “Inativar”",
        explicacao: "Não pede confirmação: o status muda na hora.",
      },
      {
        cena: "lista",
        alvo: "lista.sitio",
        instrucao: "Confira o status",
        explicacao:
          "Inativo. O fornecedor some da escolha da Recepção de fruto e da conta a pagar nova. As recepções e os " +
          "títulos antigos continuam como estavam, e ele continua nos filtros e no Relatório de origem.",
        dica:
          "Ao editar um título antigo dele, o fornecedor aparece como “(inativo)” e pode ficar; só não dá para " +
          "lançar título novo nem trocar outro título para ele.",
        preenche: { "lista.sitio": "Inativo" },
      },
      {
        cena: "lista",
        alvo: "lista.inativar",
        instrucao: "Voltou a vender? Clique em “Reativar”",
        explicacao: "O fornecedor volta para a Recepção de fruto, com o cadastro como estava.",
      },
    ],
    eDepois: {
      texto:
        "A Cartões Rurais foi criada pela operadora de cartão (Cadastros → Operadoras de cartão), pelo CNPJ. Não " +
        "inative o fornecedor de uma operadora em uso: ao salvar a operadora, ela recusa fornecedor inativo com o " +
        "CNPJ dela e pede para reativar.",
    },
  }),
];
