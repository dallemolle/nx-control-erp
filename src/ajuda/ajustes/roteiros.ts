import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";
import { LISTA_ABERTA } from "./cenas";
import { AMOSTRA, LOTES_OPCOES, SOBRA, rotuloLote } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_LANCA =
  "Quem pode: perfis Administrador e Produção, com permissão de alteração na filial. Os demais perfis só veem a " +
  "lista, sem o botão “Novo ajuste”.";

const QUEM_VE = "Quem vê: todos os perfis. A tela mostra só a filial atual.";

const loteDoExemplo = (codigo: string) => rotuloLote(LOTES_OPCOES.find((l) => l.codigo === codigo)!);

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "dar-baixa",
    titulo: "Dar baixa no estoque",
    quandoUsar:
      "Quando sai produto do estoque sem ser venda nem OP: lote vencido descartado, avaria ou quebra, amostra para " +
      "a ADEPARA ou o laboratório, consumo da casa.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.novo",
        instrucao: "Clique em “Novo ajuste”",
        explicacao: "O botão fica no alto da tela, à direita.",
      },
      {
        cena: "novo",
        alvo: "novo.sentido",
        instrucao: "Deixe marcado “Saída”",
        explicacao: "É o padrão. Saída tira kg do lote; entrada é só para sobra de inventário.",
      },
      {
        cena: "novo",
        alvo: "novo.lote",
        instrucao: "Abra a lista de lotes",
        explicacao:
          "Para saída, só lotes com saldo, do que vence primeiro para o último, com o saldo e a validade. Lote " +
          "vencido também aparece: o descarte de vencido é feito aqui, sem precisar de liberação. Polpa de OP ainda " +
          "aberta não aparece.",
        preenche: { "novo.lote": LISTA_ABERTA },
      },
      {
        cena: "novo",
        alvo: "novo.lote",
        instrucao: "Escolha o lote",
        explicacao: `No exemplo, a polpa grossa ${AMOSTRA.lote}, de onde sai a amostra para o laboratório.`,
        preenche: { "novo.lote": loteDoExemplo(AMOSTRA.lote) },
      },
      {
        cena: "novo",
        alvo: "novo.kg",
        instrucao: "Digite a quantidade",
        explicacao:
          "Em kg, sempre positiva: o sinal vem da escolha Saída ou Entrada. Saída maior que o saldo do lote é " +
          `recusada. No exemplo, ${AMOSTRA.kg} kg.`,
        preenche: { "novo.kg": String(AMOSTRA.kg) },
      },
      {
        cena: "novo",
        alvo: "novo.data",
        instrucao: "Confira a data",
        explicacao: "Já vem com hoje. Use o dia em que o produto saiu de fato.",
      },
      {
        cena: "novo",
        alvo: "novo.motivo",
        instrucao: "Escolha o motivo",
        explicacao:
          "Vem “Avaria/quebra”; troque se for outro. Vencido: lote descartado por validade. Amostra: para a " +
          "ADEPARA ou o laboratório. Consumo interno: uso da casa, degustação. Inventário: diferença na contagem. " +
          "Outro: o que não se encaixa (explique na observação).",
        preenche: { "novo.motivo": AMOSTRA.motivo },
      },
      {
        cena: "novo",
        alvo: "novo.observacao",
        instrucao: "Escreva uma observação",
        explicacao: "Opcional, mas é o que vai explicar o ajuste daqui a seis meses. Aparece na lista e no arquivo.",
        preenche: { "novo.observacao": AMOSTRA.observacao },
      },
      {
        cena: "novo",
        alvo: "novo.salvar",
        instrucao: "Clique em “Salvar ajuste”",
        explicacao: "O saldo do lote cai na hora, e o ajuste fica na auditoria com quem lançou.",
      },
      {
        cena: "lista",
        alvo: "lista.amostra",
        instrucao: "Confira na lista",
        explicacao:
          "Saída aparece com sinal de menos, em vermelho. O ajuste também aparece na Rastreabilidade do lote.",
        preenche: { "lista.amostra": "lancado" },
      },
    ],
    eDepois: {
      texto:
        "O ajuste mexe só no estoque: não gera lançamento financeiro. O valor do lote no Estoque cai junto com o " +
        "saldo.",
      proximoRoteiro: "inventario",
    },
  }),

  roteiro({
    id: "inventario",
    titulo: "Acertar o estoque depois de uma contagem",
    quandoUsar:
      "Quando a contagem física não bate com o sistema. Sobrou: entrada. Faltou: saída. Nos dois casos, motivo " +
      "Inventário.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "novo",
        alvo: "novo.sentido",
        instrucao: "Para sobra, marque “Entrada”",
        explicacao: "O motivo passa a vir como Inventário. Para falta, deixe Saída e escolha Inventário no motivo.",
        preenche: { "novo.sentido": "entrada" },
      },
      {
        cena: "novo",
        alvo: "novo.lote",
        instrucao: "Escolha o lote",
        explicacao:
          "Na entrada, a lista traz também os lotes zerados: a sobra pode ser de um lote que o sistema já dava como " +
          `acabado. No exemplo, a contagem da Câmara fria achou ${SOBRA.kg} kg a mais no ${SOBRA.lote}.`,
        preenche: { "novo.lote": loteDoExemplo(SOBRA.lote) },
      },
      {
        cena: "novo",
        alvo: "novo.kg",
        instrucao: "Digite a diferença, não o total contado",
        explicacao:
          "Se o sistema tinha 420 kg e a contagem achou 422 kg, a entrada é de 2 kg. Sempre positiva: o sinal vem " +
          "da escolha Entrada.",
        preenche: { "novo.kg": String(SOBRA.kg) },
      },
      {
        cena: "novo",
        alvo: "novo.observacao",
        instrucao: "Diga de que contagem é",
        explicacao: "Ajuda a juntar os ajustes de um mesmo inventário depois.",
        preenche: { "novo.observacao": SOBRA.observacao },
      },
      {
        cena: "novo",
        alvo: "novo.salvar",
        instrucao: "Salve",
        explicacao: "O saldo do lote sobe na hora, com o mesmo custo/kg que o lote já tinha.",
      },
      {
        cena: "lista",
        alvo: "lista.sobra",
        instrucao: "Confira na lista",
        explicacao: "Entrada aparece com sinal de mais.",
        preenche: { "lista.amostra": "lancado", "lista.sobra": "lancado" },
      },
    ],
    eDepois: {
      texto: "Para conferir antes de contar, use a tela de Estoque com o filtro de local: ela mostra o saldo de cada lote.",
      proximoRoteiro: "corrigir-ajuste",
    },
  }),

  roteiro({
    id: "corrigir-ajuste",
    titulo: "Corrigir um ajuste lançado errado",
    quandoUsar: "Quando um ajuste saiu com o lote, a quantidade ou o sentido errado.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.tabela",
        instrucao: "Ajuste não se edita nem se exclui",
        explicacao:
          "A lista não tem botões: todo ajuste fica registrado como foi lançado. Para corrigir, lance outro ajuste " +
          "que desfaça o errado.",
        preenche: { "lista.amostra": "lancado" },
      },
      {
        cena: "novo",
        alvo: "novo.sentido",
        instrucao: "Lance o contrário",
        explicacao:
          "Uma saída errada se desfaz com uma entrada da mesma quantidade no mesmo lote; uma entrada errada, com uma " +
          "saída. Depois, lance o ajuste certo.",
        preenche: { "novo.sentido": "entrada" },
      },
      {
        cena: "novo",
        alvo: "novo.motivo",
        instrucao: "Use o motivo Outro",
        explicacao: "Assim o acerto não se mistura com os ajustes de inventário nos filtros.",
        preenche: { "novo.motivo": "Outro" },
      },
      {
        cena: "novo",
        alvo: "novo.observacao",
        instrucao: "Explique na observação",
        explicacao: "Diga qual ajuste está sendo desfeito (data, lote e quantidade), para quem ler a lista depois.",
        preenche: { "novo.observacao": "Desfaz a saída de 20/11 no lote errado" },
      },
    ],
    eDepois: {
      texto:
        "Atenção: depois de um ajuste, o lote passa a ter movimento. Uma recepção cujo lote teve ajuste não pode mais " +
        "ser excluída, e uma OP cuja polpa teve ajuste não pode mais ser reaberta nem cancelada, mesmo que o ajuste " +
        "seja desfeito.",
      proximoRoteiro: "consultar-ajustes",
    },
  }),

  roteiro({
    id: "consultar-ajustes",
    titulo: "Consultar e exportar os ajustes",
    quandoUsar: "Para ver as perdas do mês, conferir um inventário ou mandar a lista para alguém.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.filtros",
        instrucao: "Escolha o período",
        explicacao:
          "Abre no mês atual, pela data do ajuste. A lista muda assim que você troca um filtro; “Limpar filtros” " +
          "volta ao padrão.",
      },
      {
        cena: "lista",
        alvo: "lista.motivo",
        instrucao: "Filtre pelo motivo",
        explicacao: "No exemplo, “Vencido” mostra só a baixa do fruto de açaí que sobrou do dia 17.",
        preenche: { "lista.motivo": "Vencido" },
      },
      {
        cena: "lista",
        alvo: "lista.tabela",
        instrucao: "Leia a lista",
        explicacao:
          "Da data mais recente para a mais antiga, com o lote, o produto, a quantidade (saída negativa, em " +
          "vermelho), o motivo, a observação e quem lançou.",
      },
      {
        cena: "lista",
        alvo: "lista.exportar",
        instrucao: "Exporte",
        explicacao: "CSV, Excel ou PDF com o período e o motivo escolhidos.",
      },
    ],
    eDepois: {
      texto: "O histórico completo de um lote, com os ajustes, está na Rastreabilidade.",
    },
  }),
];
