import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE = "Quem vê: perfis Administrador, Financeiro, Tesouraria, Gestor, Auditor e Consulta.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "orcar-ano",
    titulo: "Orçar o ano",
    quandoUsar:
      "No planejamento do ano, para dizer quanto se espera gastar e receber em cada categoria, mês a mês. E sempre " +
      "que a previsão mudar: uma compra maior de adubo, um mês de colheita mais forte.",
    quemPode:
      "Quem pode: perfis Administrador e Financeiro, com permissão de alteração na filial. Para os outros perfis, " +
      "os campos aparecem travados e sem o botão Salvar.",
    passos: [
      {
        cena: "painel",
        alvo: "painel.ano",
        instrucao: "Escolha o ano",
        explicacao:
          "Use “Ano anterior” e “Próximo ano”. O orçamento é da filial atual: cada filial tem o seu, e a tela não " +
          "soma as filiais da empresa.",
      },
      {
        cena: "painel",
        alvo: "grade.secao",
        instrucao: "Uma linha por categoria financeira",
        explicacao:
          "Aparecem todas as categorias ativas da filial, de receita e de despesa, em ordem alfabética. Orce as " +
          "receitas também: elas viram a meta do mês. Para ter uma categoria nova aqui, cadastre-a em Cadastros → " +
          "Categorias financeiras.",
      },
      {
        cena: "painel",
        alvo: "grade.insumos",
        instrucao: "Os 12 campos são os meses, de janeiro a dezembro",
        explicacao:
          "O primeiro campo depois do nome é janeiro e o último é dezembro. No exemplo, Insumos Agrícolas tem " +
          "R$ 2.500,00 em agosto e setembro e R$ 1.500,00 em outubro e novembro, os meses de adubação.",
        dica:
          "A grade não mostra o nome dos meses: conte da esquerda para a direita. No celular, arraste a grade para " +
          "o lado para ver os últimos meses.",
      },
      {
        cena: "painel",
        alvo: "grade.insumos.mes-11",
        instrucao: "Digite o valor do mês",
        explicacao:
          "Só o número, sem R$ e sem ponto de milhar: 2000 para R$ 2.000,00. Para centavos, use ponto: 45.90. " +
          "Campo vazio vale zero, e valor negativo não é aceito. No exemplo, novembro de Insumos Agrícolas passa " +
          "de 1500 para 2000.",
        dica: "Cuidado com o ponto de milhar: 1.500 é lido como um real e cinquenta centavos (R$ 1,50).",
        preenche: { "grade.insumos.mes-11": "2000" },
      },
      {
        cena: "painel",
        alvo: "grade.insumos.salvar",
        instrucao: "Clique em “Salvar” na mesma linha",
        explicacao:
          "Cada linha tem o seu botão, que grava os 12 meses daquela categoria de uma vez: ou salva todos, ou " +
          "nenhum. Mudou duas categorias? Clique no Salvar de cada uma. Cada mudança fica na Auditoria.",
      },
    ],
    eDepois: {
      texto:
        "A tela não mostra mensagem de “salvo”: o botão fica em “Salvando...” e volta ao normal. Se algo der " +
        "errado, o erro aparece em vermelho no fim da linha, com o mês (por exemplo, “Mês 3: Não pode ser " +
        "negativo”). O comparativo passa a usar o valor novo: no exemplo, Insumos Agrícolas deixa de marcar " +
        "Estouro em novembro, porque os R$ 1.800,00 previstos cabem nos R$ 2.000,00 orçados.",
      proximoRoteiro: "ler-comparativo",
    },
  }),

  roteiro({
    id: "ler-comparativo",
    titulo: "Comparar orçado, realizado e projetado",
    quandoUsar:
      "No acompanhamento do mês: para saber em que categorias o gasto já passou do combinado e se a receita " +
      "está batendo a meta.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.mes",
        instrucao: "Escolha o mês",
        explicacao: "O comparativo mostra um mês por vez, do ano escolhido nos botões ao lado.",
      },
      {
        cena: "painel",
        alvo: "comp.realizado",
        instrucao: "Realizado: o que já entrou ou saiu",
        explicacao:
          "Soma as movimentações conciliadas da categoria, pela data do lançamento no banco. Pagamento ainda não " +
          "conciliado não entra: concilie o extrato antes de analisar o mês. Dinheiro em conta Caixa já entra " +
          "conciliado.",
      },
      {
        cena: "painel",
        alvo: "comp.projetado",
        instrucao: "Projetado: o que ainda vai entrar ou sair",
        explicacao:
          "O saldo das parcelas em aberto que vencem no mês, inclusive as vencidas e não pagas. Uma parcela que " +
          "venceu em outubro continua contando em outubro: não passa para o mês seguinte.",
      },
      {
        cena: "painel",
        alvo: "comp.linha.insumos",
        instrucao: "Linha vermelha com “Estouro”: a despesa passou do orçado",
        explicacao:
          "Para despesas, o estouro soma o que já foi pago com o que ainda vai ser pago. Em Insumos Agrícolas: " +
          "R$ 800,00 pagos + R$ 1.000,00 da parcela do adubo = R$ 1.800,00, contra R$ 1.500,00 orçados.",
        dica:
          "A Variação e a Variação % comparam só o realizado com o orçado (R$ 800,00 − R$ 1.500,00 = −R$ 700,00). " +
          "Por isso a mesma linha pode mostrar variação negativa e Estouro: o estouro conta também o que ainda " +
          "falta pagar.",
      },
      {
        cena: "painel",
        alvo: "comp.linha.mao-de-obra",
        instrucao: "Despesa sem orçamento é estouro",
        explicacao:
          "Mão de obra temporária não foi orçada (R$ 0,00) e teve R$ 300,00 de recibo: qualquer gasto já é " +
          "estouro. A Variação % aparece como “—”, porque não há percentual sobre zero.",
      },
      {
        cena: "painel",
        alvo: "comp.linha.venda",
        instrucao: "Receita acima do orçado é boa notícia",
        explicacao:
          "Categoria de receita nunca marca estouro. Em Venda de produtos, R$ 23.500,00 recebidos contra " +
          "R$ 20.000,00 orçados: Variação de R$ 3.500,00, ou 17.5%.",
      },
    ],
    eDepois: {
      texto:
        "Achou um estouro? Confira os títulos da categoria em Contas a pagar, ou, se a previsão mudou, ajuste o " +
        "orçado do mês (roteiro “Orçar o ano”).",
      proximoRoteiro: "filtrar-exportar",
    },
  }),

  roteiro({
    id: "filtrar-exportar",
    titulo: "Filtrar por classificação e exportar",
    quandoUsar: "Para ver quanto do realizado tem documento fiscal, ou para levar o orçamento do ano para a planilha.",
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
          "O orçado é um só, não é dividido entre fiscal e gerencial. Na visão Fiscal do exemplo, Venda de " +
          "produtos mostra R$ 18.000,00 realizados contra os mesmos R$ 20.000,00 orçados: parece abaixo da meta, " +
          "mas o restante entrou como gerencial. E o recibo da mão de obra, que é gerencial, some da conta. Use o " +
          "filtro para ver a composição, não para julgar a meta.",
      },
      {
        cena: "painel",
        alvo: "painel.exportar",
        instrucao: "Exporte o ano inteiro",
        explicacao:
          "PDF, CSV ou Excel. O arquivo traz os 12 meses de todas as categorias, não só o mês da tela, com uma " +
          "coluna Estouro (Sim ou Não), e respeita o filtro de classificação.",
      },
    ],
    eDepois: {
      texto: "Para voltar a ver tudo, escolha “Todos” no filtro.",
    },
  }),
];
