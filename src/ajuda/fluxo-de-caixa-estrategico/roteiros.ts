import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE =
  "Quem vê: perfis Administrador, Gestor e Auditor. Só o Administrador e o Gestor mudam as premissas; para o " +
  "Auditor, os campos aparecem travados.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "ler-projecao",
    titulo: "Ler a projeção de 5 anos",
    quandoUsar:
      "Para pensar o negócio nos próximos anos: se a receita crescer tanto e os custos tanto, quanto sobra de " +
      "caixa? Serve para planejar investimentos e financiamentos, não para o dia a dia (para isso, use o Fluxo " +
      "de caixa projetado).",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "BASE.tabela",
        instrucao: "Veja a tabela de um cenário",
        explicacao:
          "Cada cenário (Base, Otimista e Pessimista) tem as suas premissas em cima e a projeção de 5 anos " +
          "embaixo. A tela soma todas as filiais ativas da empresa: é a única tela do Financeiro que consolida.",
      },
      {
        cena: "painel",
        alvo: "BASE.linha.receita",
        instrucao: "Receita e Custo partem dos últimos 12 meses",
        explicacao:
          "O ponto de partida (o ano-base) é o que entrou e o que saiu, conciliado, nos últimos 12 meses. O Ano 1 " +
          "é o ano-base mais o crescimento, o Ano 2 é o Ano 1 mais o crescimento, e assim por diante. No exemplo, " +
          "R$ 220.000,00 de receita com 5% a.a. viram R$ 231.000,00 no Ano 1.",
        dica:
          "O ano-base soma todas as entradas e saídas conciliadas, inclusive transferências entre contas e " +
          "empréstimos recebidos, que não são receita nem custo. Se a fazenda teve muito disso no último ano, a " +
          "projeção fica distorcida.",
      },
      {
        cena: "painel",
        alvo: "BASE.linha.capex",
        instrucao: "CAPEX: o investimento, em % da receita",
        explicacao:
          "Máquinas, benfeitorias, implantação de pomar. A tela calcula como um percentual da receita de cada ano: " +
          "3% de R$ 231.000,00 = R$ 6.930,00 no Ano 1.",
      },
      {
        cena: "painel",
        alvo: "BASE.linha.juros",
        instrucao: "Juros: o custo da dívida nova",
        explicacao:
          "O novo endividamento entra como dinheiro todo ano e vai somando numa dívida que nunca é paga. Os juros " +
          "são a taxa sobre a dívida do fim do ano anterior: no Ano 1 são sempre zero. No cenário Base do " +
          "exemplo não há dívida nova.",
      },
      {
        cena: "painel",
        alvo: "BASE.linha.saldo",
        instrucao: "Saldo de caixa: onde o dinheiro chega",
        explicacao:
          "Parte do saldo em caixa de hoje (o conciliado mais o que foi lançado e aguarda conciliação, o mesmo " +
          "saldo contábil da Tesouraria) e soma a geração líquida de cada ano (receita − custo − CAPEX + dívida " +
          "nova − juros). Fica vermelho quando é negativo.",
      },
      {
        cena: "painel",
        alvo: "BASE.linha.margem",
        instrucao: "Margem líquida: quanto sobra de cada real de receita",
        explicacao:
          "É (receita − custo) ÷ receita. Atenção: apesar do nome, ela não desconta CAPEX nem juros. É a margem da " +
          "operação, antes de investimento e dívida.",
      },
    ],
    eDepois: {
      texto:
        "A projeção é uma conta simples sobre premissas: não considera prazos de recebimento e pagamento, capital " +
        "de giro nem amortização de dívida. Use para comparar caminhos, não como previsão exata.",
      proximoRoteiro: "ajustar-premissas",
    },
  }),

  roteiro({
    id: "ajustar-premissas",
    titulo: "Ajustar as premissas de um cenário",
    quandoUsar:
      "Quando os cenários estão zerados (a empresa começa assim) ou quando a expectativa mudou: um preço novo, " +
      "uma safra maior, um financiamento em vista.",
    quemPode: "Quem pode: perfis Administrador e Gestor.",
    passos: [
      {
        cena: "painel",
        alvo: "BASE.receita",
        instrucao: "Crescimento de receita (% a.a.)",
        explicacao:
          "Quanto a receita cresce por ano, em porcentagem. Digite 8 para 8%. Pode ser negativo, até −100%, para " +
          "um cenário de queda. No exemplo, o Base passa de 5% para 8%.",
        preenche: { "BASE.receita": "8.00" },
      },
      {
        cena: "painel",
        alvo: "BASE.custos",
        instrucao: "Crescimento de custos/despesas (% a.a.)",
        explicacao: "O mesmo para os custos: quanto eles crescem por ano. Também aceita negativo.",
      },
      {
        cena: "painel",
        alvo: "BASE.capex",
        instrucao: "CAPEX (% da receita)",
        explicacao: "Quanto da receita vai para investimento, de 0% a 100%.",
      },
      {
        cena: "painel",
        alvo: "BASE.endividamento",
        instrucao: "Novo endividamento anual (R$) e taxa de juros",
        explicacao:
          "O endividamento é em reais, não em porcentagem: o valor de dívida nova que entra em caixa todo ano. A " +
          "taxa de juros anual (até 200%) incide sobre a dívida acumulada a partir do ano seguinte.",
      },
      {
        cena: "painel",
        alvo: "BASE.salvar",
        instrucao: "Clique em “Salvar premissas”",
        explicacao:
          "Cada cenário tem o seu botão. As premissas valem para a empresa toda e para todos os usuários, e cada " +
          "mudança fica na Auditoria. A tabela é recalculada na hora.",
      },
    ],
    eDepois: {
      texto:
        "Aparece “Premissas salvas.” embaixo do formulário, e a tabela do cenário mostra os 5 anos com os números " +
        "novos. Os outros cenários não mudam.",
      proximoRoteiro: "comparar-cenarios",
    },
  }),

  roteiro({
    id: "comparar-cenarios",
    titulo: "Comparar cenários e filtrar por classificação",
    quandoUsar:
      "Para ver a distância entre o melhor e o pior caso, e quanto do caixa vem do movimento fiscal ou do " +
      "gerencial.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "OTIMISTA.secao",
        instrucao: "Role até o cenário Otimista",
        explicacao: "No exemplo, receita crescendo 10% a.a. com os custos a 6%: o caixa sobe ano a ano.",
      },
      {
        cena: "painel",
        alvo: "PESSIMISTA.linha.saldo",
        instrucao: "Veja quando o Pessimista fica no vermelho",
        explicacao:
          "Receita caindo 5% a.a., custos subindo 8% e R$ 30.000,00 de dívida nova por ano a 18%: o saldo fica " +
          "negativo no Ano 3. É o sinal de que, nesse caminho, falta dinheiro mesmo pegando empréstimo.",
      },
      {
        cena: "painel",
        alvo: "painel.classificacao",
        instrucao: "Filtre por Fiscal ou Gerencial, se precisar",
        explicacao: "O ano-base passa a usar só o movimento daquela classificação.",
        preenche: { "painel.classificacao": "Fiscal" },
      },
      {
        cena: "painel",
        alvo: "painel.aviso",
        instrucao: "Leia o aviso da visão filtrada",
        explicacao:
          "A projeção filtrada parte de zero e a linha de saldo vira Acumulado de caixa: quanto aquela parte do " +
          "negócio gera nos 5 anos. As premissas são as mesmas nas três visões.",
      },
      {
        cena: "painel",
        alvo: "painel.exportar",
        instrucao: "Exporte, se precisar de um arquivo",
        explicacao: "PDF, CSV ou Excel, com os três cenários e o filtro de classificação da tela.",
      },
    ],
    eDepois: {
      texto:
        "Se alguma filial foi desativada e ainda tem pendências, um aviso aparece no topo: ela não entra nos " +
        "números até ser reativada em Administração → Filiais.",
    },
  }),
];
