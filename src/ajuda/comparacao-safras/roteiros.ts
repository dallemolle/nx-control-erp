import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE = "Quem vê: perfis Administrador, Financeiro, Tesouraria, Gestor, Auditor e Consulta.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "orcar-safra",
    titulo: "Orçar uma safra",
    quandoUsar:
      "No planejamento de uma safra nova, ou quando a expectativa de resultado de uma safra mudar (preço, " +
      "produtividade, custo de insumo).",
    quemPode:
      "Quem pode: perfis Administrador e Financeiro, com permissão de alteração na filial. Para os outros perfis, " +
      "o orçado aparece só como valor, sem campo nem botão.",
    passos: [
      {
        cena: "painel",
        alvo: "painel.tabela",
        instrucao: "Uma linha por safra",
        explicacao:
          "Aparecem todas as safras ativas da filial, planejadas, em andamento ou encerradas, da mais nova para a " +
          "mais antiga (pela data de início). Para ter uma safra nova aqui, cadastre-a em Cadastros → Safras.",
      },
      {
        cena: "painel",
        alvo: "orcado.safra-2026",
        instrucao: "Digite o resultado esperado da safra",
        explicacao:
          "O orçado é um valor só para a safra inteira, sem divisão por mês. Como o Realizado desta tela é " +
          "entradas menos saídas, o orçado que faz sentido comparar é o resultado que você espera: quanto deve " +
          "sobrar depois de vender a produção e pagar os custos. No exemplo, R$ 30.000,00 para a 2026/27.",
        dica:
          "Só o número, sem R$ e sem ponto de milhar: 30000. O campo não aceita negativo, então não dá para orçar " +
          "uma safra com prejuízo esperado.",
        preenche: { "orcado.safra-2026": "30000" },
      },
      {
        cena: "painel",
        alvo: "salvar.safra-2026",
        instrucao: "Clique em “Salvar” na mesma linha",
        explicacao: "Cada safra tem o seu botão. A mudança fica na Auditoria.",
      },
    ],
    eDepois: {
      texto:
        "A tela não mostra mensagem de “salvo”: o botão fica em “Salvando...” e volta ao normal. Se algo der " +
        "errado, o erro aparece em vermelho ao lado do botão. A Variação da safra é recalculada com o orçado novo.",
      proximoRoteiro: "comparar-safras",
    },
  }),

  roteiro({
    id: "comparar-safras",
    titulo: "Comparar o resultado das safras",
    quandoUsar:
      "Para saber se a safra em andamento vai chegar ao resultado planejado, e como ela se compara com as " +
      "safras anteriores.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "cab.realizado",
        instrucao: "Realizado: o resultado que já aconteceu",
        explicacao:
          "Tudo o que entrou menos tudo o que saiu, conciliado, com a marca da safra, em qualquer data: a compra " +
          "de adubo antes do plantio e a venda depois da colheita entram na safra marcada, não no período em " +
          "que aconteceram. Fica negativo enquanto a safra só gastou.",
        dica:
          "Só conta o que foi marcado com a safra no título ou no lançamento. Despesa sem safra (energia, " +
          "tarifa bancária) não entra em nenhuma linha.",
      },
      {
        cena: "painel",
        alvo: "cab.projetado",
        instrucao: "Projetado: o que ainda falta entrar e sair",
        explicacao:
          "O saldo das parcelas em aberto marcadas com a safra, de qualquer vencimento, inclusive as vencidas: a " +
          "receber menos a pagar.",
      },
      {
        cena: "painel",
        alvo: "cab.variacao",
        instrucao: "Variação: realizado menos orçado",
        explicacao:
          "Em reais e, entre parênteses, em percentual do orçado. Não inclui o projetado, e a tela não marca " +
          "estouro como o Orçamento mensal: a leitura é sua.",
      },
      {
        cena: "painel",
        alvo: "linha.safra-2025",
        instrucao: "Leia a safra em andamento",
        explicacao:
          "A 2025/26 tem R$ 33.000,00 de resultado realizado contra R$ 40.000,00 orçados: Variação de " +
          "−R$ 7.000,00 (-17.5%). Somando os R$ 3.000,00 projetados, chega a R$ 36.000,00: ainda R$ 4.000,00 " +
          "abaixo do orçado.",
      },
      {
        cena: "painel",
        alvo: "linha.safra-2024",
        instrucao: "Compare com a safra encerrada",
        explicacao:
          "A 2024/25 já fechou: R$ 38.200,00 de resultado contra R$ 35.000,00 orçados, Variação de R$ 3.200,00 " +
          "(9.1%). Compare safras encerradas entre si: as que estão em andamento ainda vão mudar.",
      },
      {
        cena: "painel",
        alvo: "linha.safra-2026",
        instrucao: "Safra planejada: variação negativa é normal",
        explicacao:
          "A 2026/27 ainda não colheu nada: só tem R$ 300,00 de mão de obra no preparo. O realizado é negativo e " +
          "a Variação fica longe do orçado até as vendas começarem.",
      },
      {
        cena: "painel",
        alvo: "cab.status",
        instrucao: "Status: em que fase está a safra",
        explicacao:
          "Planejado, Em andamento ou Encerrado. Quem muda o status é o cadastro da safra, em " +
          "Cadastros → Safras; esta tela só mostra.",
      },
    ],
    eDepois: {
      texto:
        "Para entender de onde vem o resultado de uma safra, abra o Fluxo de caixa por dimensão com a dimensão " +
        "Safra: ele separa entradas e saídas, mas mostra um mês por vez.",
      proximoRoteiro: "filtrar-exportar",
    },
  }),

  roteiro({
    id: "filtrar-exportar",
    titulo: "Filtrar por classificação e exportar",
    quandoUsar: "Para ver quanto do resultado de cada safra tem documento fiscal, ou para levar a tabela para a planilha.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.classificacao",
        instrucao: "Filtre por Fiscal ou Gerencial, se precisar",
        explicacao: "Realizado e projetado passam a somar só o movimento daquela classificação.",
        preenche: { "painel.classificacao": "Fiscal" },
      },
      {
        cena: "painel",
        alvo: "painel.aviso",
        instrucao: "O orçado não muda com o filtro",
        explicacao:
          "O orçado da safra é um só. Na visão Fiscal do exemplo, a 2025/26 mostra R$ 26.000,00 realizados " +
          "contra os mesmos R$ 40.000,00: a diferença para a visão Todos é o movimento gerencial. Use o filtro para " +
          "ver a composição, não para julgar a meta.",
      },
      {
        cena: "painel",
        alvo: "painel.exportar",
        instrucao: "Exporte, se precisar de um arquivo",
        explicacao:
          "PDF, CSV ou Excel, com todas as safras da tela e o filtro de classificação. No arquivo, a variação " +
          "percentual tem coluna própria.",
      },
    ],
    eDepois: {
      texto: "Para voltar a ver tudo, escolha “Todos” no filtro.",
    },
  }),
];
