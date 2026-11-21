import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import { ROTULOS_PERFIL } from "@/lib/schemas/usuario";
import type { ALVOS } from "./alvos";
import { CHAVE_ANTIGA, CHAVE_NOVA, CNPJ_MATRIZ, JOANA, LUCIA, OUTRA_FILIAL, RITA_NOVO_PERFIL, SENHA_JOANA } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_PODE = "Quem pode: só o perfil Administrador. Os outros perfis não veem esta tela.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "cadastrar-usuario",
    titulo: "Cadastrar um usuário",
    quandoUsar: "Quando alguém novo vai usar o sistema e ainda não tem login.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.novo",
        instrucao: "Clique em “Novo usuário”",
        explicacao: "No exemplo, a Joana Pires começa na fábrica e vai lançar recepções e OPs.",
      },
      {
        cena: "novo",
        alvo: "form.email",
        instrucao: "Informe o email",
        explicacao: "É o login da pessoa. O mesmo email serve para todas as empresas em que ela tiver acesso.",
        preenche: { "form.email": JOANA.email },
      },
      {
        cena: "novo",
        alvo: "form.verificar",
        instrucao: "Clique em “Verificar”",
        explicacao:
          "Confere se o email já tem login no sistema. Não tem: nada aparece, e o formulário pede nome e senha.",
      },
      {
        cena: "novo",
        alvo: "form.nome",
        instrucao: "Informe o nome",
        explicacao: "Como a pessoa aparece nesta lista, na auditoria e no topo da tela dela.",
        preenche: { "form.nome": JOANA.nome },
      },
      {
        cena: "novo",
        alvo: "form.senha",
        instrucao: "Defina a senha inicial",
        explicacao: "Pelo menos 8 caracteres. Passe a senha para a pessoa por um canal seguro.",
        dica: "Hoje não há como a pessoa trocar a senha depois, nem como redefinir: combine uma senha forte.",
        preenche: { "form.senha": SENHA_JOANA },
      },
      {
        cena: "novo",
        alvo: "form.perfil",
        instrucao: "Escolha o perfil",
        explicacao: `O que a pessoa pode fazer na empresa. Vem em Consulta; a Joana é ${ROTULOS_PERFIL[JOANA.perfil]}.`,
        preenche: { "form.perfil": JOANA.perfil },
      },
      {
        cena: "perfis",
        alvo: "perfis.producao",
        instrucao: "Na dúvida, compare os perfis",
        explicacao:
          "Produção cuida da recepção, do processamento e do estoque, e não vê o financeiro. Dê a cada pessoa o " +
          "perfil com o mínimo de que ela precisa.",
      },
      {
        cena: "novo",
        alvo: "form.acesso",
        instrucao: "Deixe marcado o acesso a esta filial",
        explicacao:
          "Vem marcado: a pessoa já entra na filial em que você está (a Matriz). Sem nenhuma filial, ela faz login mas " +
          "não passa da escolha de empresa.",
      },
      {
        cena: "novo",
        alvo: "form.alteracao",
        instrucao: "Marque “Permitir alteração”",
        explicacao:
          "Sem isso, o acesso é só de leitura: a pessoa vê as telas, sem os botões de salvar. A Joana precisa lançar, " +
          "então tem alteração.",
        preenche: { "form.alteracao": "sim" },
      },
      {
        cena: "novo",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "A Joana entra na lista, ativa, e já pode entrar no sistema com o email e a senha.",
      },
      {
        cena: "lista",
        alvo: "lista.joana",
        instrucao: "Confira na lista",
        explicacao: "A lista vem em ordem de nome.",
        preenche: { "lista.joana": "sim" },
      },
      {
        cena: "acessos",
        alvo: "acessos.joana",
        instrucao: "E no acesso por filial",
        explicacao: `Abaixo da lista, o cartão da Joana mostra Leitura e Alteração na Matriz e nada na ${OUTRA_FILIAL}.`,
      },
    ],
    eDepois: {
      texto:
        "Para dar acesso a outras filiais, marque no cartão da pessoa em “Acesso por filial”. Tudo o que você faz aqui " +
        "fica na Auditoria.",
      proximoRoteiro: "usuario-existente",
    },
  }),
  roteiro({
    id: "usuario-existente",
    titulo: "Dar acesso a quem já tem login",
    quandoUsar: "Quando a pessoa já usa o sistema por outra empresa, como uma contadora que atende várias.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.novo",
        instrucao: "Clique em “Novo usuário”",
        explicacao: "No exemplo, a Lúcia Martins, contadora da empresa, já tem login pelo escritório dela.",
        preenche: { "lista.joana": "sim" },
      },
      {
        cena: "novo",
        alvo: "form.email",
        instrucao: "Informe o email que ela já usa",
        explicacao: "É por ele que o sistema acha o login dela.",
        preenche: { "form.email": LUCIA.email },
      },
      {
        cena: "novo",
        alvo: "form.verificar",
        instrucao: "Clique em “Verificar”",
        explicacao: "O sistema procura o email entre todos os logins.",
      },
      {
        cena: "novo",
        alvo: "form.encontrado",
        instrucao: "Confira quem foi encontrado",
        explicacao:
          "Nome e senha somem: a Lúcia continua com a senha dela. Você só cria o vínculo com esta empresa, com o " +
          "perfil daqui.",
        dica: "Se ela já estiver nesta empresa, ao salvar aparece “Este usuário já tem acesso a esta empresa”.",
        preenche: { "form.encontrado": LUCIA.nome },
      },
      {
        cena: "novo",
        alvo: "form.perfil",
        instrucao: `Escolha o perfil: ${ROTULOS_PERFIL[LUCIA.perfil]}`,
        explicacao: "O perfil é por empresa: na empresa dela a Lúcia pode ser Administradora, e aqui só consultar.",
        preenche: { "form.perfil": LUCIA.perfil },
      },
      {
        cena: "perfis",
        alvo: "perfis.auditor",
        instrucao: "O Auditor só consulta",
        explicacao: "Vê tudo, inclusive a Auditoria e o dashboard executivo, sem alterar nada. Bom para a contabilidade.",
      },
      {
        cena: "novo",
        alvo: "form.alteracao",
        instrucao: "Deixe “Permitir alteração” desmarcado",
        explicacao: "Acesso só de leitura na Matriz. Com o perfil Auditor, ela não alteraria nada de qualquer forma.",
      },
      {
        cena: "novo",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "Na próxima vez que entrar, a Lúcia escolhe entre as empresas dela.",
      },
      {
        cena: "lista",
        alvo: "lista.lucia",
        instrucao: "Confira na lista",
        explicacao: "Ela aparece aqui como qualquer usuário. Desativar tira só o acesso a esta empresa, não o login dela.",
        preenche: { "lista.lucia": "sim" },
      },
    ],
    eDepois: { texto: "O acesso a mais filiais é dado no cartão dela, em “Acesso por filial”.", proximoRoteiro: "perfil-acesso" },
  }),
  roteiro({
    id: "perfil-acesso",
    titulo: "Mudar perfil, acesso por filial ou desativar",
    quandoUsar: "Quando alguém muda de função, passa a atender outra filial ou sai da empresa.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.perfil-rita",
        instrucao: "Para mudar o perfil, escolha outro na linha",
        explicacao:
          `A Rita passa a cuidar também do financeiro: de ${ROTULOS_PERFIL.VENDAS} para ` +
          `${ROTULOS_PERFIL[RITA_NOVO_PERFIL]}, que também faz pedidos. Salva na hora, sem botão.`,
        dica: "O perfil novo vale na próxima tela que a pessoa abrir.",
        preenche: { "lista.joana": "sim", "lista.lucia": "sim", "lista.perfil-rita": RITA_NOVO_PERFIL },
      },
      {
        cena: "lista",
        alvo: "lista.voce",
        instrucao: "A sua linha é diferente",
        explicacao:
          "Seu perfil aparece só como texto e não há “Desativar”: ninguém muda o próprio perfil nem se desativa. " +
          "Assim a empresa nunca fica sem administrador. Para mudar o seu, peça a outro Administrador.",
      },
      {
        cena: "acessos",
        alvo: "acessos.rita-igarape",
        instrucao: `Em “Acesso por filial”, marque Leitura na ${OUTRA_FILIAL}`,
        explicacao: "Cada clique salva na hora. Com Leitura, a filial aparece para a Rita em “Trocar filial”.",
        preenche: { "acessos.rita-igarape": "sim" },
      },
      {
        cena: "acessos",
        alvo: "acessos.rita-igarape-alteracao",
        instrucao: "Marque Alteração, se ela vai lançar lá",
        explicacao:
          "Só dá para marcar com Leitura marcada. Sem Alteração, a pessoa vê a filial e não salva nada nela, " +
          "qualquer que seja o perfil. Desmarcar Leitura tira as duas.",
        preenche: { "acessos.rita-igarape-alteracao": "sim" },
      },
      {
        cena: "acessos",
        alvo: "acessos.voce-matriz",
        instrucao: "Sua Leitura na filial em que você está fica travada",
        explicacao:
          "Para você não perder o acesso à tela que está usando. Para mudá-la, troque de filial antes ou peça a " +
          "outro Administrador.",
      },
      {
        cena: "lista",
        alvo: "lista.desativar-pedro",
        instrucao: "Alguém saiu? Clique em “Desativar”",
        explicacao: "No exemplo, o Pedro Alves saiu da empresa. Não pede confirmação.",
      },
      {
        cena: "lista",
        alvo: "lista.pedro",
        instrucao: "Confira o status",
        explicacao:
          "Inativo: o Pedro não entra mais nesta empresa, e as chaves de API dele param de funcionar aqui. O que ele " +
          "fez continua na Auditoria. O botão vira “Reativar”.",
        preenche: { "lista.pedro": "Inativo" },
      },
    ],
    eDepois: {
      texto:
        "Mudanças de perfil, de acesso e de status ficam na Auditoria (entidades UsuarioEmpresa e " +
        "UsuarioEmpresaFilial), com quem fez e quando.",
      proximoRoteiro: "chaves-api",
    },
  }),
  roteiro({
    id: "chaves-api",
    titulo: "Gerar e revogar uma chave de API",
    quandoUsar: "Quando um sistema ou agente de IA vai usar a API do NX Control em nome de um usuário.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.chaves-carlos",
        instrucao: "Na linha do usuário, clique em “Chaves de API”",
        explicacao:
          "A chave age como aquele usuário: com o perfil e os acessos por filial dele. No exemplo, um agente de IA vai " +
          "registrar lançamentos da Tesouraria, então a chave é do Carlos.",
      },
      {
        cena: "chaves",
        alvo: "chaves.nome",
        instrucao: "Dê um nome à chave",
        explicacao: "Para saber depois quem usa cada chave.",
        preenche: { "chaves.nome": CHAVE_NOVA.nome },
      },
      {
        cena: "chaves",
        alvo: "chaves.validade",
        instrucao: "Escolha a validade",
        explicacao: "30 dias, 90 dias, 1 ano ou Sem validade. Vencida, a chave para de funcionar sozinha.",
        preenche: { "chaves.validade": `${CHAVE_NOVA.validadeDias} dias` },
      },
      {
        cena: "chaves",
        alvo: "chaves.gerar",
        instrucao: "Clique em “Gerar”",
        explicacao: "A chave é criada na hora.",
      },
      {
        cena: "chaves",
        alvo: "chaves.copiar",
        instrucao: "Copie a chave agora",
        explicacao:
          "É a única vez que ela aparece inteira. Fechou a janela sem copiar? Revogue e gere outra. Guarde-a como uma " +
          "senha.",
        preenche: { "chaves.nova": "sim" },
      },
      {
        cena: "chaves",
        alvo: "chaves.nova",
        instrucao: "Confira na lista",
        explicacao:
          `Daqui em diante só aparece o começo (${CHAVE_NOVA.completa.slice(0, 11)}...), a criação, o último uso e a ` +
          `validade. Na chamada à API, a chave vai no cabeçalho “Authorization: Bearer” e o CNPJ da filial em ` +
          `“X-Filial-CnpjCpf” (${CNPJ_MATRIZ}).`,
      },
      {
        cena: "chaves",
        alvo: "chaves.revogar",
        instrucao: "Chave que não é mais usada? Clique em “Revogar”",
        explicacao: `A “${CHAVE_ANTIGA.nome}” não é usada desde setembro. Não pede confirmação.`,
      },
      {
        cena: "chaves",
        alvo: "chaves.antiga",
        instrucao: "Confira: Revogada",
        explicacao: "A chave para de funcionar na hora, e não dá para desfazer. Gerar e revogar ficam na Auditoria.",
        preenche: { "chaves.antiga": "Revogada" },
      },
    ],
    eDepois: {
      texto:
        "Se a chave vazar, revogue e gere outra. Desativar o usuário também desliga as chaves dele nesta empresa.",
    },
  }),
];
