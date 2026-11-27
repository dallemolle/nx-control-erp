import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import type { ALVOS } from "./alvos";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_VE = "Quem vê: perfis Administrador, Financeiro, Tesouraria, Gestor, Auditor e Consulta.";

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "ler-comparativo",
    titulo: "Ver quanto do movimento tem nota",
    quandoUsar:
      "Para acompanhar, mês a mês, quanto do dinheiro que entrou e saiu tinha documento fiscal e quanto foi " +
      "negociado sem nota. Útil para conversar com a contabilidade e planejar a regularização.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "painel.ano",
        instrucao: "Escolha o ano",
        explicacao:
          "O ano vale para o realizado por mês e para os maiores parceiros sem nota. O “Em aberto hoje” e as " +
          "pendências fiscais não mudam com o ano. A tela mostra só a filial atual.",
      },
      {
        cena: "painel",
        alvo: "comp.grafico",
        instrucao: "O gráfico: duas barras por mês",
        explicacao:
          "A da esquerda são as entradas e a da direita, as saídas. Cada barra empilha a parte fiscal (embaixo) e a " +
          "gerencial (em cima). Na tela, passe o mouse sobre a barra para ver os valores.",
      },
      {
        cena: "painel",
        alvo: "comp.tabela",
        instrucao: "A tabela: os mesmos números, mês a mês",
        explicacao:
          "Soma as movimentações conciliadas pela data do lançamento no banco, separadas pela classificação de " +
          "cada uma. Transferências entre contas ficam de fora, porque não são fiscais nem gerenciais. Pagamento " +
          "ainda não conciliado não entra; dinheiro em conta Caixa já entra conciliado.",
      },
      {
        cena: "painel",
        alvo: "comp.nov",
        instrucao: "% gerencial: a parte sem nota",
        explicacao:
          "É o gerencial dividido pelo total (fiscal + gerencial), separado para entradas e saídas. Em novembro, " +
          "R$ 5.500,00 das vendas de R$ 23.500,00 foram sem nota: 23.4% das entradas. Mês sem movimento mostra “—”.",
      },
      {
        cena: "painel",
        alvo: "comp.total",
        instrucao: "Total do ano",
        explicacao:
          "A soma dos 12 meses, com o percentual gerencial do ano inteiro: no exemplo, 22.5% das entradas e 13.8% " +
          "das saídas.",
      },
      {
        cena: "painel",
        alvo: "comp.exportar",
        instrucao: "Exporte, se precisar de um arquivo",
        explicacao:
          "PDF, CSV ou Excel com a tabela mês a mês do ano escolhido. O gráfico, o em aberto e os parceiros não " +
          "vão para o arquivo.",
      },
    ],
    eDepois: {
      texto:
        "A classificação vem do título (Fiscal ou Gerencial) e passa para o lançamento na baixa; lançamentos " +
        "avulsos da Tesouraria e da Conciliação têm a classificação escolhida na hora.",
      proximoRoteiro: "em-aberto-parceiros",
    },
  }),

  roteiro({
    id: "em-aberto-parceiros",
    titulo: "Ver o que está em aberto e os maiores parceiros sem nota",
    quandoUsar:
      "Para saber quanto ainda vai entrar e sair com e sem nota, e com quem a fazenda mais negocia sem documento " +
      "fiscal.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "painel",
        alvo: "aberto.cards",
        instrucao: "Em aberto hoje",
        explicacao:
          "O saldo de todas as parcelas ainda não liquidadas, de qualquer vencimento, separado em a receber e a " +
          "pagar, fiscal e gerencial. É a foto de hoje: não muda com o ano escolhido em cima.",
      },
      {
        cena: "painel",
        alvo: "parceiros.tabela",
        instrucao: "Maiores parceiros sem nota",
        explicacao:
          "Os até 10 clientes e fornecedores com mais valor em títulos gerenciais emitidos no ano, pagos ou não " +
          "(parcelas canceladas ou renegociadas não contam). No exemplo, a Açaí da Vila comprou R$ 26.400,00 sem " +
          "nota em 8 títulos.",
        dica:
          "É a lista para priorizar a regularização: são os parceiros em que mais vale a pena passar a emitir ou " +
          "exigir nota.",
      },
    ],
    eDepois: {
      texto: "Sem nenhum título gerencial emitido no ano, a tabela de parceiros dá lugar a um aviso.",
      proximoRoteiro: "pendencias",
    },
  }),

  roteiro({
    id: "pendencias",
    titulo: "Resolver as pendências fiscais",
    quandoUsar:
      "Quando a nota de uma compra ou venda chega depois do lançamento, ou na revisão do mês, antes de mandar os " +
      "documentos para a contabilidade.",
    quemPode:
      QUEM_VE +
      " Para completar os dados do título, é preciso poder editar títulos (perfis Administrador e Financeiro, com " +
      "permissão de alteração na filial).",
    passos: [
      {
        cena: "painel",
        alvo: "pend.titulo",
        instrucao: "A lista de pendências",
        explicacao:
          "Títulos fiscais ativos da filial, de qualquer data, que ainda não têm tudo: tipo de documento, número " +
          "da nota (NF-e, NFC-e, NFS-e, CT-e, nota do produtor e nota de entrada), chave de acesso (NF-e, NFC-e e " +
          "CT-e) ou anexo. O número entre parênteses é a quantidade. Nada fica bloqueado por isso.",
      },
      {
        cena: "painel",
        alvo: "pend.filtro-chave",
        instrucao: "Filtre por um tipo de pendência",
        explicacao:
          "Os botões mostram só os títulos com aquela falta. No exemplo, “Sem chave de acesso” deixa só a NF-e " +
          "2210 da Agro Insumos. “Todas” volta à lista completa.",
        preenche: { "pend.filtro-chave": "ativo" },
      },
      {
        cena: "painel",
        alvo: "pend.documento",
        instrucao: "Clique no documento",
        explicacao:
          "Abre Contas a pagar (ou a receber) já no título, com a linha aberta: parcelas, Anexos e o botão " +
          "Editar à mão. Uma faixa no alto diz que a lista mostra só aquele título.",
        dica: "Para voltar à lista completa, clique em “Ver todos” na faixa, ou mexa em qualquer filtro.",
      },
      {
        cena: "painel",
        alvo: "pend.tabela",
        instrucao: "Complete o título",
        explicacao:
          "No título, use “Editar” para informar o tipo de documento, o número e a chave de acesso, e anexe o PDF " +
          "ou o XML da nota em Anexos, na linha aberta do título. Quando não faltar mais nada, o título sai desta " +
          "lista; se faltar só uma parte, ele continua, com os selos do que ainda falta.",
      },
      {
        cena: "painel",
        alvo: "pend.exportar",
        instrucao: "Exporte a lista, se precisar",
        explicacao:
          "PDF, CSV ou Excel com as pendências do filtro escolhido: bom para mandar a quem precisa buscar as notas.",
      },
    ],
    eDepois: {
      texto:
        "Títulos lançados antes deste recurso aparecem aqui até serem revisados. Se um título foi lançado como " +
        "fiscal mas não tem nota mesmo, reclassifique-o como gerencial no próprio título (o sistema pede o motivo): " +
        "os pagamentos já feitos dele mudam junto no realizado por mês.",
    },
  }),
];
