import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { DIA_DA_SAIDA, HOJE, MOTORISTA, OBSERVACAO, RECEBEDOR } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_LANCA =
  "Quem pode: perfis Administrador, Financeiro e Vendas, com permissão de alteração na filial. Os demais perfis veem " +
  "as entregas, sem os botões.";

const QUEM_VE = "Quem vê: todos os perfis. A tela mostra só a filial atual.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "sair-entrega",
    titulo: "Sair para uma entrega",
    quandoUsar:
      "Quando a mercadoria sai da propriedade para o cliente. Informe quem leva e marque “Em rota”, para todos saberem " +
      "que ela já saiu.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.tabela",
        instrucao: "Veja as entregas a fazer",
        explicacao:
          "A lista abre só com as entregas pendentes e em rota, de qualquer data, da mais antiga para a mais nova. Cada " +
          "pedido que não é retirado na propriedade cria uma entrega pendente. No exemplo, o 131, da Sorveteria Polar.",
        preenche: { "lista.tabela": DIA_DA_SAIDA, "lista.situacao": "Pendente" },
      },
      {
        cena: "lista",
        alvo: "lista.atraso",
        instrucao: "Confira o atraso",
        explicacao:
          "Dias desde a data prevista. Hoje é o dia previsto, então o atraso é 0. Quando passa da data, o número fica " +
          "vermelho.",
      },
      {
        cena: "lista",
        alvo: "lista.editar",
        instrucao: "Clique em “Editar”",
        explicacao: "O botão “Em rota” não pede nada: antes, informe quem vai levar.",
      },
      {
        cena: "editar",
        alvo: "editar.responsavel",
        instrucao: "Informe o responsável",
        explicacao: "Quem leva a entrega. É só um nome, para consulta; não precisa ser usuário do sistema.",
        preenche: { "editar.responsavel": MOTORISTA },
      },
      {
        cena: "editar",
        alvo: "editar.observacao",
        instrucao: "Anote o que precisar",
        explicacao: "Um recado para quem entrega: horário, portão, telefone.",
        preenche: { "editar.observacao": OBSERVACAO },
      },
      {
        cena: "editar",
        alvo: "editar.data",
        instrucao: "Remarcar? Mude a data prevista",
        explicacao:
          "Se o cliente pedir outro dia, mude a data prevista aqui: o atraso passa a contar da nova data. Neste exemplo " +
          "a data continua a mesma.",
      },
      {
        cena: "editar",
        alvo: "editar.endereco",
        instrucao: "Endereço diferente? Mude aqui",
        explicacao:
          "O endereço veio do pedido (e, nele, do cadastro do cliente). Mudar aqui muda só esta entrega, não o " +
          "cadastro.",
      },
      {
        cena: "editar",
        alvo: "editar.salvar",
        instrucao: "Clique em “Salvar”",
        explicacao: "A lista mostra o responsável na linha da entrega.",
      },
      {
        cena: "lista",
        alvo: "lista.emRota",
        instrucao: "Clique em “Em rota”",
        explicacao: "Na hora em que a mercadoria sai. Não abre formulário: o status muda direto.",
      },
      {
        cena: "lista",
        alvo: "lista.situacao",
        instrucao: "Confira o status",
        explicacao:
          "Em rota. O botão “Em rota” some; ficam “Entregue” e “Editar”. O pedido mostra o mesmo status no cartão " +
          "Entrega.",
        preenche: { "lista.situacao": "Em rota" },
      },
    ],
    eDepois: {
      texto:
        "No exemplo, a Sorveteria Polar estava fechada e o João voltou com a polpa. A entrega continua em rota e é " +
        "feita no dia seguinte.",
      proximoRoteiro: "confirmar-entrega",
    },
  }),

  roteiro({
    id: "confirmar-entrega",
    titulo: "Confirmar que a entrega foi feita",
    quandoUsar: "Quando o cliente recebe a mercadoria. Informe o dia e quem recebeu.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.atraso",
        instrucao: "Veja o atraso em vermelho",
        explicacao:
          `Em ${HOJE}, a entrega prevista para ${DIA_DA_SAIDA} ainda não foi feita: 1 dia de atraso. O atraso conta até ` +
          "o dia em que a entrega for marcada como feita.",
        preenche: { "lista.tabela": HOJE, "lista.situacao": "Em rota", "editar.responsavel": MOTORISTA },
      },
      {
        cena: "lista",
        alvo: "lista.entregue",
        instrucao: "Clique em “Entregue”",
        explicacao: "Abre uma janela para a data e quem recebeu.",
      },
      {
        cena: "entregue",
        alvo: "entregue.data",
        instrucao: "Confira a data da entrega",
        explicacao:
          "Já vem com hoje. Se esqueceu de marcar no dia, informe o dia em que a entrega foi feita: o atraso é contado " +
          "até ela.",
      },
      {
        cena: "entregue",
        alvo: "entregue.recebido",
        instrucao: "Informe quem recebeu",
        explicacao: "O nome de quem recebeu a mercadoria no cliente. Fica no pedido.",
        preenche: { "entregue.recebido": RECEBEDOR },
      },
      {
        cena: "entregue",
        alvo: "entregue.confirmar",
        instrucao: "Clique em “Confirmar entrega”",
        explicacao: "Confira antes a data e o nome.",
        dica:
          "Depois de entregue, o “Editar” não muda a data da entrega nem quem recebeu, e a entrega não volta para Em " +
          "rota.",
      },
      {
        cena: "lista",
        alvo: "lista.tabela",
        instrucao: "A entrega sai da lista",
        explicacao: "A lista mostra só as pendentes e em rota. Para ver as feitas, mude o Status.",
        preenche: { "lista.situacao": "Entregue" },
      },
      {
        cena: "lista",
        alvo: "lista.atraso",
        instrucao: "Veja as entregues",
        explicacao:
          "Status → Entregue mostra as feitas. O 131 ficou com 1 dia de atraso (prevista em 22/11, entregue em 23/11); " +
          "o 128, entregue no dia previsto, com 0.",
        preenche: { "lista.status": "Entregue" },
      },
    ],
    eDepois: {
      texto:
        "O pedido 131 mostra a entrega como Entregue, com a data, o responsável e quem recebeu. A entrega não mexe no " +
        "pagamento: o pedido continua em aberto até o cliente pagar as parcelas.",
      proximoRoteiro: "consultar-entregas",
    },
  }),

  roteiro({
    id: "consultar-entregas",
    titulo: "Consultar e exportar as entregas",
    quandoUsar: "Para cobrar as entregas atrasadas, montar a rota do dia ou mandar a lista para alguém.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.filtros",
        instrucao: "Veja os filtros",
        explicacao:
          "A lista abre com as pendentes e em rota, de qualquer data. A lista muda assim que você troca um filtro; " +
          "“Limpar filtros” volta ao padrão.",
      },
      {
        cena: "lista",
        alvo: "lista.atrasadas",
        instrucao: "Marque “Só atrasadas”",
        explicacao: "Ficam só as entregas que passaram da data prevista. No exemplo, o 131, com 1 dia.",
        preenche: { "lista.atrasadas": "sim" },
      },
      {
        cena: "lista",
        alvo: "lista.status",
        instrucao: "Veja todas as entregas",
        explicacao:
          "Status → Todas mostra também as entregues e as canceladas. Há também Pendente, Em rota, Entregue e Cancelada, " +
          "uma de cada vez.",
        preenche: { "lista.status": "Todas", "lista.atrasadas": "" },
      },
      {
        cena: "lista",
        alvo: "lista.cancelada",
        instrucao: "Entrega cancelada",
        explicacao:
          "Quando o pedido é cancelado, a entrega dele também é, e não muda mais: fica sem botões e sem atraso (“—”). " +
          "No exemplo, o 127.",
      },
      {
        cena: "lista",
        alvo: "lista.atrasoEntregue",
        instrucao: "Atraso de entrega já feita",
        explicacao:
          "Na entregue, o atraso é contado até o dia da entrega e não muda mais. O 128 foi entregue no dia previsto: 0.",
      },
      {
        cena: "lista",
        alvo: "lista.periodo",
        instrucao: "Filtre pela data prevista, se quiser",
        explicacao: "“Prevista de” e “Até” limitam pela data prevista. Em branco, vale qualquer data.",
      },
      {
        cena: "lista",
        alvo: "lista.pedido",
        instrucao: "Clique no número para abrir o pedido",
        explicacao: "O pedido tem um cartão Entrega com os mesmos dados e os mesmos botões.",
      },
      {
        cena: "lista",
        alvo: "lista.exportar",
        instrucao: "Exporte a lista",
        explicacao: "CSV, Excel ou PDF com os filtros escolhidos.",
      },
    ],
    eDepois: {
      texto:
        "O Painel de produção avisa quantas entregas estão pendentes ou em rota e quantas estão atrasadas; o aviso " +
        "das atrasadas abre esta tela já com “Só atrasadas” marcado.",
    },
  }),
];
