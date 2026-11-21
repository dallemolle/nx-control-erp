import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { BOA_VISTA, DEMONSTRACAO, LIMITE_IMAGEM_MB, RIO_PARA, TEMA } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_PODE =
  "Quem pode: só o perfil Administrador. A lista mostra apenas as empresas em que você é Administrador.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "cadastrar-empresa",
    titulo: "Cadastrar uma empresa",
    quandoUsar: "Quando o grupo passa a ter outra empresa, com CNPJ próprio, cujos dados devem ficar separados.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.nova",
        instrucao: "Clique em “Nova empresa”",
        explicacao:
          "Cada empresa é um contexto separado: títulos, contas, estoque e usuários de uma não aparecem na outra. No " +
          "exemplo, o grupo comprou o sítio vizinho, que tem CNPJ próprio.",
      },
      {
        cena: "nova",
        alvo: "form.razao",
        instrucao: "Informe a razão social",
        explicacao: "O nome do contrato social.",
        preenche: { "form.razao": BOA_VISTA.razaoSocial },
      },
      {
        cena: "nova",
        alvo: "form.fantasia",
        instrucao: "Informe o nome fantasia",
        explicacao: "É o nome que aparece no topo da tela, em “Trocar empresa” e na prévia do tema.",
        preenche: { "form.fantasia": BOA_VISTA.nomeFantasia },
      },
      {
        cena: "nova",
        alvo: "form.cnpj",
        instrucao: "Informe o CNPJ ou CPF",
        explicacao: "Pode digitar só os números: ao salvar, o sistema põe a pontuação.",
        dica: "Não pode repetir: aparece “Já existe uma empresa com este CNPJ/CPF”.",
        preenche: { "form.cnpj": BOA_VISTA.cnpjDigitado },
      },
      {
        cena: "nova",
        alvo: "form.moeda",
        instrucao: "Deixe a moeda em BRL",
        explicacao: "O código de 3 letras da moeda. Vem BRL.",
      },
      {
        cena: "nova",
        alvo: "form.cor",
        instrucao: "Cor e logo: deixe para o Tema e marca",
        explicacao:
          "A cor personalizada daqui só pinta a barra lateral, e só enquanto a empresa não tem tema salvo. O logo é " +
          "o mesmo “logo para fundo claro” do Tema e marca, que tem mais opções.",
      },
      {
        cena: "nova",
        alvo: "form.aprovacao",
        instrucao: "Aprovação por outra pessoa: deixe marcada",
        explicacao:
          "Com ela, quem registra uma baixa não pode aprová-la (Financeiro → Aprovações). É o controle que evita que " +
          "uma pessoa só pague o que quiser.",
      },
      {
        cena: "nova",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao:
          "O sistema cria a empresa, uma filial “Matriz” com o mesmo CNPJ, e faz de você o Administrador, com acesso " +
          "de alteração na Matriz.",
      },
      {
        cena: "lista",
        alvo: "lista.boa-vista",
        instrucao: "Confira na lista",
        explicacao:
          "A empresa nasce vazia: sem cadastros, contas ou outros usuários. Para trabalhar nela, use “Trocar " +
          "empresa”, no topo.",
        preenche: { "lista.boa-vista": "sim" },
      },
    ],
    eDepois: {
      texto:
        "Dentro da empresa nova, cadastre as filiais (Administração → Filiais), as pessoas (Administração → " +
        "Usuários) e os cadastros financeiros e de produção, que são por filial.",
      proximoRoteiro: "editar-inativar-empresa",
    },
  }),
  roteiro({
    id: "editar-inativar-empresa",
    titulo: "Aprovação por outra pessoa e inativar",
    quandoUsar: "Quando muda quem cuida do financeiro, ou quando uma empresa do grupo encerra as atividades.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.editar-boa-vista",
        instrucao: "Na empresa, clique em “Editar”",
        explicacao: "Na Agro Boa Vista, uma pessoa só cuida do financeiro: ela precisa aprovar as próprias baixas.",
        preenche: {
          "lista.boa-vista": "sim",
          "form.razao": BOA_VISTA.razaoSocial,
          "form.fantasia": BOA_VISTA.nomeFantasia,
        },
      },
      {
        cena: "editar",
        alvo: "form.aprovacao",
        instrucao: "Desmarque a aprovação por outra pessoa",
        explicacao:
          "Só quando não há uma segunda pessoa para aprovar. As baixas continuam passando por Aprovações; só deixa de " +
          "valer a regra de que quem registra não aprova.",
        dica: "A mudança fica na Auditoria, com o antes e o depois.",
        preenche: { "form.aprovacao": "nao" },
      },
      {
        cena: "editar",
        alvo: "form.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "Vale na hora, para todas as filiais da empresa.",
      },
      {
        cena: "lista",
        alvo: "lista.demonstracao",
        instrucao: "A empresa em que você está não tem “Inativar”",
        explicacao:
          `Você está na ${DEMONSTRACAO.nomeFantasia}: inativá-la tiraria você dela na hora. Para inativar, troque de ` +
          "empresa antes.",
      },
      {
        cena: "lista",
        alvo: "lista.inativar-rio-para",
        instrucao: "Para encerrar outra empresa, clique em “Inativar”",
        explicacao: `A ${RIO_PARA.nomeFantasia} encerrou as atividades. Não pede confirmação.`,
      },
      {
        cena: "lista",
        alvo: "lista.rio-para",
        instrucao: "Confira o status",
        explicacao:
          "Inativa: ninguém entra mais nela, nem quem já estava dentro, e as chaves de API param de funcionar. Os " +
          "dados ficam guardados; “Reativar” devolve tudo.",
        preenche: { "lista.rio-para": "Inativa" },
      },
    ],
    eDepois: {
      texto: "Editar, inativar e reativar ficam na Auditoria da própria empresa.",
      proximoRoteiro: "tema-marca",
    },
  }),
  roteiro({
    id: "tema-marca",
    titulo: "Tema e marca",
    quandoUsar: "Para deixar o painel com as cores, fontes e logos da empresa.",
    quemPode: QUEM_PODE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.tema-demonstracao",
        instrucao: "Na empresa, clique em “Tema e marca”",
        explicacao: "O tema vale para todas as pessoas da empresa, em todas as filiais.",
      },
      {
        cena: "tema",
        alvo: "tema.nome",
        instrucao: "O editor abre com o tema salvo",
        explicacao: "Ou com o visual padrão do sistema, se a empresa ainda não tem tema. Dê um nome ao tema.",
      },
      {
        cena: "tema",
        alvo: "tema.modo",
        instrucao: "Escolha o modo que vai editar",
        explicacao:
          "Claro e Escuro têm cores próprias. “Ter modo escuro” liga e desliga o escuro: sem ele, a empresa fica só " +
          "no claro.",
      },
      {
        cena: "tema",
        alvo: "tema.essenciais",
        instrucao: "Comece pelas cores essenciais",
        explicacao: "Fundo, texto, primária (botões e destaques) e barra lateral, cada uma com a cor do texto sobre ela.",
      },
      {
        cena: "tema",
        alvo: "tema.primaria",
        instrucao: "Escolha a primária",
        explicacao: "Pela amostra ou digitando o código #RRGGBB. No exemplo, um lilás claro.",
        preenche: { "tema.primaria": TEMA.primariaReprovada },
      },
      {
        cena: "tema",
        alvo: "tema.selo",
        instrucao: "Confira o selo de contraste",
        explicacao:
          "Abaixo de cada cor de texto: ✓ ok, ⚠ aviso, ✕ erro. O texto branco dos botões precisa de 4,5:1 com a " +
          "primária; o lilás não chega lá.",
      },
      {
        cena: "tema",
        alvo: "tema.resumo",
        instrucao: "O resumo mostra os problemas",
        explicacao:
          "Com erro, “Salvar” fica desabilitado; clicar no resumo leva ao campo com problema. Aviso não impede: ao " +
          "salvar, o sistema pede confirmação.",
      },
      {
        cena: "tema",
        alvo: "tema.primaria",
        instrucao: "Troque por uma cor mais escura",
        explicacao: "O roxo do açaí passa com folga: o selo fica ✓ e o erro some.",
        preenche: { "tema.primaria": TEMA.primaria },
      },
      {
        cena: "tema",
        alvo: "tema.previa",
        instrucao: "Veja a prévia",
        explicacao: "Ela muda a cada cor que você mexe, antes de salvar.",
      },
      {
        cena: "tema",
        alvo: "tema.opcional",
        instrucao: "As outras cores podem ficar no automático",
        explicacao:
          "Nos grupos fechados, “Automático” faz a cor herdar de outra (o cartão herda do fundo). Desmarque só se " +
          "quiser escolher.",
      },
      {
        cena: "tema",
        alvo: "tema.fontes",
        instrucao: "Fontes e raio são opcionais",
        explicacao: "Fontes do Google para texto e títulos, e o arredondamento dos cantos.",
      },
      {
        cena: "tema",
        alvo: "tema.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao:
          "O tema passa a valer para todos. Com tema, o botão de aparência do topo mostra só Claro e Escuro. " +
          "“Descartar alterações” volta ao último tema salvo.",
        preenche: { "tema.salvar": "sim" },
      },
      {
        cena: "tema",
        alvo: "tema.importar",
        instrucao: "Atalho: gere o tema com uma IA",
        explicacao:
          "Em “Importar JSON”, baixe o modelo de pedido, cole numa IA com o manual de marca da empresa e importe a " +
          "resposta (arquivo ou texto). O tema entra no editor para conferir antes de salvar.",
      },
      {
        cena: "tema",
        alvo: "tema.exportar",
        instrucao: "Exportar e Restaurar padrão",
        explicacao:
          "“Exportar” baixa o tema em .json. “Restaurar padrão” (só com tema salvo) volta ao visual do sistema e " +
          "mantém os logos.",
      },
      {
        cena: "marca",
        alvo: "marca.logo",
        instrucao: "Mais abaixo, a Marca: o logo",
        explicacao: `PNG, JPG, SVG ou WebP, até ${LIMITE_IMAGEM_MB} MB. Aparece no topo da barra lateral.`,
      },
      {
        cena: "marca",
        alvo: "marca.logo-escuro",
        instrucao: "O logo para fundo escuro",
        explicacao: "Usado quando a barra lateral é escura, como no exemplo. Sem ele, vale o logo claro.",
      },
      {
        cena: "marca",
        alvo: "marca.favicon",
        instrucao: "O favicon",
        explicacao: `O ícone da aba do navegador: PNG, SVG ou ICO, até ${LIMITE_IMAGEM_MB} MB.`,
      },
      {
        cena: "marca",
        alvo: "marca.salvar",
        instrucao: "Clique em “Salvar marca”",
        explicacao: "A marca é salva à parte do tema. Cada imagem tem “Remover”, quando já existe.",
      },
    ],
    eDepois: {
      texto: "Tudo o que muda no tema e na marca fica na Auditoria da empresa.",
    },
  }),
];
