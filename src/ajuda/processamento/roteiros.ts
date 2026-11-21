import { construtorDeRoteiros, type Roteiro } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import type { ALVOS } from "./alvos";
import { rotuloLoteDisponivel } from "./cenas";
import { CONFIGURACAO, CONSUMOS, INSUMOS, LOCAL_POLPA, LOTES_DISPONIVEIS, OP, POLPAS, PROCESSO, RESUMO } from "./exemplo";

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_LANCA =
  "Quem pode: perfis Administrador e Produção, com permissão de alteração na filial. Os demais perfis veem as OPs, " +
  "sem os formulários e os botões.";

const QUEM_VE = "Quem vê: todos os perfis. A tela mostra só a filial atual.";

const [AGC, AMC] = POLPAS;
const [EMBALAGEM] = INSUMOS;

/** Estado da OP com fruto, polpa e insumos lançados e o processo salvo. */
const OP_COMPLETA = {
  "op.consumos": "lancado",
  "op.producoes": "lancado",
  "op.insumos": "lancado",
  "op.processo": "salvo",
} as const;

export const ROTEIROS: readonly Roteiro[] = [
  roteiro({
    id: "abrir-op",
    titulo: "Abrir uma ordem de produção (OP)",
    quandoUsar:
      "No começo de cada batelada de fruto que vai virar polpa. Uma OP por batelada: ela junta o fruto que entrou, a " +
      "polpa que saiu, os insumos e o processo, e calcula o rendimento e o custo.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "lista",
        alvo: "lista.nova",
        instrucao: "Clique em “Nova OP”",
        explicacao: "O botão fica no alto da tela de Processamento, à direita.",
      },
      {
        cena: "novaOp",
        alvo: "nova.data",
        instrucao: "Confira a data",
        explicacao:
          "Já vem com o dia de hoje. A data entra no número da OP e no dos lotes de polpa, conta a validade da polpa e " +
          "decide se um lote de fruto está vencido.",
      },
      {
        cena: "novaOp",
        alvo: "nova.fruta",
        instrucao: "Escolha a fruta",
        explicacao:
          "Uma OP é de uma fruta só: o consumo aceita só lotes de fruto dela, e a produção, só polpas dela. Com uma " +
          "única fruta ativa, ela já vem escolhida.",
        preenche: { "nova.fruta": OP.fruta },
      },
      {
        cena: "novaOp",
        alvo: "nova.responsavel",
        instrucao: "Informe o responsável, se quiser",
        explicacao: "Quem tocou a batelada. É só um nome, para consulta; não precisa ser usuário do sistema.",
        preenche: { "nova.responsavel": OP.responsavel },
      },
      {
        cena: "novaOp",
        alvo: "nova.abrir",
        instrucao: "Clique em “Abrir OP”",
        explicacao: "A OP é criada e o sistema abre o detalhe dela na hora.",
      },
      {
        cena: "op",
        alvo: "op.cabecalho",
        instrucao: "Confira o número da OP",
        explicacao:
          `${OP.numero}: “OP”, a data em ano-mês-dia (261120 = 20/11/2026) e a sequência do dia. A OP nasce Aberta e ` +
          "vazia; o balanço aparece como “Verificar” até haver fruto e polpa lançados.",
      },
    ],
    eDepois: {
      texto:
        "Errou a data, a fruta ou o responsável? “Editar”, no alto do detalhe, muda o responsável sempre; a data e a " +
        "fruta só enquanto a OP não tem consumo nem produção.",
      proximoRoteiro: "lancar-fruto-polpa",
    },
  }),

  roteiro({
    id: "lancar-fruto-polpa",
    titulo: "Lançar o fruto consumido e a polpa produzida",
    quandoUsar: "Durante ou logo depois da batelada, no detalhe da OP aberta.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "op",
        alvo: "op.abas",
        instrucao: "Use as abas da OP",
        explicacao:
          "Consumo, Produção, Insumos e Processo. O número em cada aba é a quantidade de linhas lançadas. Comece pelo " +
          "Consumo.",
      },
      {
        cena: "op",
        alvo: "op.consumoLote",
        instrucao: "Escolha o lote de fruto",
        explicacao:
          "A lista traz os lotes da fruta da OP com saldo, do que vence primeiro para o último, com o saldo e a " +
          "validade de cada um. Lote vencido na data da OP aparece como VENCIDO e só é aceito se tiver sido liberado " +
          "na tela de Estoque, com a liberação cobrindo a data da OP.",
        preenche: { "op.consumoLote": rotuloLoteDisponivel(LOTES_DISPONIVEIS[0]) },
      },
      {
        cena: "op",
        alvo: "op.consumoKg",
        instrucao: "Digite quantos kg entraram",
        explicacao:
          "Em kg, mesmo para fruto recebido em rasas. Acima do saldo, o campo avisa e o sistema recusa. No exemplo, " +
          `o lote inteiro: ${CONSUMOS[0].kg} kg.`,
        preenche: { "op.consumoKg": String(CONSUMOS[0].kg) },
      },
      {
        cena: "op",
        alvo: "op.lancarConsumo",
        instrucao: "Clique em “Lançar consumo” e repita para cada lote",
        explicacao:
          "O fruto sai do estoque na hora e o formulário volta vazio para o próximo lote. No exemplo, entram também " +
          `os ${CONSUMOS[1].kg} kg do ${CONSUMOS[1].lote}, a colheita do Talhão 3.`,
      },
      {
        cena: "op",
        alvo: "op.consumos",
        instrucao: "Confira os lotes consumidos",
        explicacao:
          "Cada lote entra com o custo/kg dele: o preço pago ao produtor ou o custo-padrão da colheita. No exemplo, " +
          `${RESUMO.frutoKg} de fruto que custaram ${formatarMoeda(RESUMO.custoFruto)}.`,
        preenche: { "op.consumos": "lancado" },
      },
      {
        cena: "op",
        alvo: "op.abas",
        instrucao: "Vá para a aba Produção",
        explicacao: "Aqui entra cada polpa que saiu da despolpadeira.",
        preenche: { "op.abas": "producao" },
      },
      {
        cena: "op",
        alvo: "op.polpa",
        instrucao: "Escolha a polpa",
        explicacao:
          "A lista traz só as polpas da fruta da OP (cadastradas em Cadastros → Produtos). Com uma só, ela já vem " +
          "escolhida.",
        preenche: { "op.polpa": `${AGC.codigo} · ${AGC.descricao}` },
      },
      {
        cena: "op",
        alvo: "op.local",
        instrucao: "Escolha o local",
        explicacao: `Onde a polpa vai ficar guardada. No exemplo, a ${LOCAL_POLPA}.`,
        preenche: { "op.local": LOCAL_POLPA },
      },
      {
        cena: "op",
        alvo: "op.polpaKg",
        instrucao: "Digite os kg produzidos",
        explicacao: `No exemplo, ${AGC.kg} kg de polpa grossa.`,
        preenche: { "op.polpaKg": String(AGC.kg) },
      },
      {
        cena: "op",
        alvo: "op.embalagens",
        instrucao: "Informe as embalagens, se quiser",
        explicacao: "Quantas embalagens saíram. É informativo: o custo da embalagem entra pela aba Insumos.",
        preenche: { "op.embalagens": String(AGC.embalagens) },
      },
      {
        cena: "op",
        alvo: "op.lancarPolpa",
        instrucao: "Clique em “Lançar polpa” e repita para cada polpa",
        explicacao:
          "Cada linha cria um lote de polpa na hora, com número e validade contados da data da OP. No exemplo, " +
          `entram também ${AMC.kg} kg de polpa média.`,
      },
      {
        cena: "op",
        alvo: "op.producoes",
        instrucao: "Confira os lotes de polpa",
        explicacao:
          `${AGC.lote} e ${AMC.lote}: o código do produto, a data e a sequência. Eles aparecem no Estoque como “Em ` +
          "produção” e ficam bloqueados para venda e ajuste até a OP ser encerrada.",
        preenche: { "op.producoes": "lancado" },
      },
    ],
    eDepois: {
      texto:
        "O balanço de massa fica em “Verificar” por enquanto: falta informar a água, o caroço e a perda, na aba " +
        "Processo.",
      proximoRoteiro: "insumos-processo",
    },
  }),

  roteiro({
    id: "insumos-processo",
    titulo: "Lançar insumos e o processo",
    quandoUsar:
      "Para completar a OP: o que foi gasto além do fruto (embalagens, energia, mão de obra) e os números do " +
      "processo, que conferem a batelada.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "op",
        alvo: "op.abas",
        instrucao: "Vá para a aba Insumos",
        explicacao: "Os insumos entram no custo da polpa, junto com o fruto.",
        preenche: { "op.consumos": "lancado", "op.producoes": "lancado", "op.abas": "insumos" },
      },
      {
        cena: "op",
        alvo: "op.insumo",
        instrucao: "Escolha o insumo",
        explicacao:
          "A lista mostra cada insumo com a unidade e o custo unitário do cadastro (Cadastros → Insumos). A OP guarda " +
          "o custo daquele momento: mudar o cadastro depois não altera esta OP.",
        preenche: {
          "op.insumo": `${EMBALAGEM.nome} · ${EMBALAGEM.unidade} · ${formatarMoeda(EMBALAGEM.custoUnitario)}`,
        },
      },
      {
        cena: "op",
        alvo: "op.insumoQtd",
        instrucao: "Digite a quantidade e lance",
        explicacao:
          `Na unidade do insumo. No exemplo, ${EMBALAGEM.quantidade} embalagens; depois, 120 kWh de energia e 16 h ` +
          "de mão de obra, cada um com “Lançar insumo”.",
        preenche: { "op.insumoQtd": String(EMBALAGEM.quantidade) },
      },
      {
        cena: "op",
        alvo: "op.insumos",
        instrucao: "Confira os insumos",
        explicacao: `Somam ${formatarMoeda(RESUMO.custoInsumos)} no exemplo, e o custo da OP sobe junto.`,
        preenche: { "op.insumos": "lancado" },
      },
      {
        cena: "op",
        alvo: "op.abas",
        instrucao: "Vá para a aba Processo",
        explicacao: "Os números da batelada, que alimentam o balanço de massa e o branqueamento.",
        preenche: { "op.abas": "processo" },
      },
      {
        cena: "op",
        alvo: "op.temperatura",
        instrucao: "Informe a temperatura do branqueamento",
        explicacao:
          "Só aparece para fruta que exige branqueamento, como o açaí. Precisa ser pelo menos a mínima da " +
          `configuração (no exemplo, ${CONFIGURACAO.branqueamentoTemperaturaMinC} °C).`,
        preenche: { "op.temperatura": String(PROCESSO.temperaturaC) },
      },
      {
        cena: "op",
        alvo: "op.tempo",
        instrucao: "Informe o tempo do branqueamento",
        explicacao:
          `Em segundos, pelo menos ${CONFIGURACAO.branqueamentoTempoMinS} s no exemplo. Faltando a temperatura ou o ` +
          "tempo, o branqueamento fica “Verificar”.",
        preenche: { "op.tempo": String(PROCESSO.tempoS) },
      },
      {
        cena: "op",
        alvo: "op.massas",
        instrucao: "Informe a água, o caroço e a perda",
        explicacao:
          `Água em litros (1 L conta como 1 kg), caroço/resíduo e perda em kg. No exemplo, ${PROCESSO.aguaLitros} L, ` +
          `${PROCESSO.carocoResiduoKg} kg e ${PROCESSO.perdaKg} kg. A observação é livre.`,
        preenche: { "op.massas": "preenchido" },
      },
      {
        cena: "op",
        alvo: "op.salvarProcesso",
        instrucao: "Clique em “Salvar processo”",
        explicacao: "Grava todos os campos da aba de uma vez e mostra “Salvo.”.",
        dica:
          "Salve antes de trocar de aba: os números digitados e não salvos se perdem, sem aviso, quando você muda de " +
          "aba ou sai da tela.",
        preenche: { "op.processo": "salvo" },
      },
      {
        cena: "op",
        alvo: "op.rendimento",
        instrucao: "Leia o rendimento",
        explicacao: `Polpa ÷ fruto: ${RESUMO.polpaKg} de ${RESUMO.frutoKg} dão ${RESUMO.rendimento}.`,
      },
      {
        cena: "op",
        alvo: "op.balanco",
        instrucao: "Confira o balanço de massa",
        explicacao:
          "O que entrou (fruto + água) menos o que saiu (polpa + caroço + perda). No exemplo, 1.478 − 1.470 = " +
          `${RESUMO.balancoKg} (${RESUMO.balancoPercentual}): OK, porque está dentro da tolerância da configuração ` +
          "(3%). Acima dela, fica “Verificar”: em geral, falta lançar algo ou um peso foi digitado errado.",
      },
      {
        cena: "op",
        alvo: "op.custo",
        instrucao: "Veja o custo provisório",
        explicacao:
          `Fruto (${formatarMoeda(RESUMO.custoFruto)}) + insumos (${formatarMoeda(RESUMO.custoInsumos)}) ÷ kg de ` +
          `polpa = ${formatarMoeda(RESUMO.custoKgPolpa)} por kg em média. É provisório: muda a cada linha lançada ` +
          "ou removida, até a OP ser encerrada.",
      },
    ],
    eDepois: {
      texto: "Com tudo conferido, encerre a OP para gravar o custo e liberar a polpa.",
      proximoRoteiro: "encerrar-op",
    },
  }),

  roteiro({
    id: "encerrar-op",
    titulo: "Encerrar a OP e liberar a polpa",
    quandoUsar: "Quando a batelada terminou e tudo foi lançado. Enquanto a OP está aberta, a polpa não pode ser vendida.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "op",
        alvo: "op.resumo",
        instrucao: "Confira o resumo antes",
        explicacao:
          "Fruto, polpa, rendimento, balanço, branqueamento e custo. Para encerrar, a OP precisa ter ao menos um " +
          "consumo e uma produção.",
        preenche: OP_COMPLETA,
      },
      {
        cena: "op",
        alvo: "op.encerrar",
        instrucao: "Clique em “Encerrar OP”",
        explicacao: "Fica no alto do detalhe, à direita.",
      },
      {
        cena: "encerrar",
        alvo: "encerrar.aviso",
        instrucao: "Leia o que acontece",
        explicacao:
          "O custo é gravado e os lotes de polpa ficam liberados para venda e ajuste. Se a OP produziu mais de uma " +
          "polpa e alguma está sem preço de referência (Cadastros → Produtos), o sistema recusa e diz qual cadastrar.",
      },
      {
        cena: "encerrar",
        alvo: "encerrar.verificar",
        instrucao: "Se houver item a verificar, confirme",
        explicacao:
          "Quando o balanço ou o branqueamento está “Verificar”, o diálogo pede para marcar a confirmação. Ela fica " +
          "registrada na auditoria. No exemplo, tudo está OK e esta caixa não aparece: ela está aqui só para você " +
          "conhecer.",
        preenche: { "encerrar.verificar": "sim" },
      },
      {
        cena: "encerrar",
        alvo: "encerrar.confirmar",
        instrucao: "Clique em “Encerrar”",
        explicacao: "A OP passa para Encerrada.",
      },
      {
        cena: "op",
        alvo: "op.custoLote",
        instrucao: "Veja o custo de cada polpa",
        explicacao:
          "O custo total da OP é dividido pelo preço de referência das polpas: a que vale mais por kg recebe um " +
          `custo/kg maior. No exemplo, ${formatarMoeda(AGC.custoKg)} na grossa (referência de ` +
          `${formatarMoeda(AGC.precoReferenciaKg)}/kg) e ${formatarMoeda(AMC.custoKg)} na média (` +
          `${formatarMoeda(AMC.precoReferenciaKg)}/kg). Com uma polpa só, ela fica com o custo médio.`,
        preenche: { "op.status": "Encerrada", "op.abas": "producao" },
      },
      {
        cena: "op",
        alvo: "op.etiqueta",
        instrucao: "Imprima as etiquetas da polpa",
        explicacao: "O botão “Etiqueta” aparece em cada lote de polpa só depois de encerrar.",
      },
    ],
    eDepois: {
      texto:
        "A polpa já pode ser vendida e aparece no Estoque com o custo gravado. Se descobrir um erro, a OP pode ser " +
        "reaberta enquanto nenhum lote de polpa tiver saído.",
      proximoRoteiro: "corrigir-op",
    },
  }),

  roteiro({
    id: "corrigir-op",
    titulo: "Corrigir, reabrir ou cancelar uma OP",
    quandoUsar: "Quando uma linha foi lançada errada, ou quando a OP encerrada precisa de correção ou não devia existir.",
    quemPode: QUEM_LANCA,
    passos: [
      {
        cena: "op",
        alvo: "op.remover",
        instrucao: "OP aberta: remova a linha errada e lance de novo",
        explicacao:
          "Não há edição de linha. “Remover” pede confirmação e desfaz o estoque: o consumo devolve o fruto ao lote; " +
          "a polpa removida deixa o lote dela zerado (o número não é reaproveitado). O mesmo vale nas abas Produção " +
          "e Insumos.",
        preenche: OP_COMPLETA,
      },
      {
        cena: "op",
        alvo: "op.editar",
        instrucao: "OP aberta: “Editar” muda o cabeçalho",
        explicacao: "O responsável, sempre; a data e a fruta, só depois de remover todo o consumo e toda a produção.",
      },
      {
        cena: "op",
        alvo: "op.reabrir",
        instrucao: "OP encerrada: clique em “Reabrir”",
        explicacao: "Para corrigir uma OP já encerrada: ela volta a ficar aberta, com as abas editáveis.",
        preenche: { "op.status": "Encerrada" },
      },
      {
        cena: "desfazer",
        alvo: "desfazer.aviso",
        instrucao: "Leia o que acontece",
        explicacao:
          "Os custos gravados são limpos e a polpa volta a ficar bloqueada. Corrija o que precisar e encerre de novo.",
      },
      {
        cena: "desfazer",
        alvo: "desfazer.motivo",
        instrucao: "Escreva o motivo e confirme",
        explicacao: "Obrigatório, com pelo menos 3 letras. Aparece no detalhe da OP e fica na auditoria.",
        preenche: { "desfazer.motivo": "Faltou lançar a energia" },
      },
      {
        cena: "op",
        alvo: "op.cancelar",
        instrucao: "“Cancelar OP” é para a OP que não devia existir",
        explicacao:
          "Funciona aberta ou encerrada, também com motivo: o fruto volta aos lotes de origem e os lotes de polpa " +
          "são zerados. Não dá para desfazer. A OP cancelada continua na lista, fora dos totais.",
      },
      {
        cena: "desfazer",
        alvo: "desfazer.confirmar",
        instrucao: "Confirme o cancelamento",
        explicacao: "Clique no botão vermelho “Cancelar OP”. Sem o motivo, o formulário não é enviado.",
        preenche: { "desfazer.aviso": "cancelar", "desfazer.motivo": "OP aberta em duplicidade" },
      },
      {
        cena: "op",
        alvo: "op.bloqueado",
        instrucao: "Quando não dá mais para reabrir nem cancelar",
        explicacao:
          "Depois que algum lote de polpa da OP teve venda, ajuste ou transferência, mesmo que desfeitos depois, os " +
          "dois botões ficam desabilitados e a tela diz qual lote impediu.",
        dica: "Nesse caso, corrija o estoque com um ajuste na tela de Ajustes de estoque.",
        preenche: { "op.status": "Encerrada", "op.bloqueado": "sim" },
      },
    ],
    eDepois: {
      texto: "Toda remoção, reabertura e cancelamento fica na auditoria da OP, com quem fez e quando.",
      proximoRoteiro: "consultar-ops",
    },
  }),

  roteiro({
    id: "consultar-ops",
    titulo: "Consultar e exportar as OPs",
    quandoUsar: "Para acompanhar o rendimento e o custo das bateladas, achar OPs com problema ou mandar a lista para alguém.",
    quemPode: QUEM_VE,
    passos: [
      {
        cena: "lista",
        alvo: "lista.filtros",
        instrucao: "Escolha o período e, se quiser, a fruta",
        explicacao:
          "Abre no mês atual, pela data da OP. A lista muda assim que você troca um filtro; “Limpar filtros” volta ao " +
          "padrão.",
      },
      {
        cena: "lista",
        alvo: "lista.tabela",
        instrucao: "Leia a lista",
        explicacao:
          "Da OP mais recente para a mais antiga, com fruto, polpa, rendimento, balanço e branqueamento de cada uma. " +
          "Linhas removidas não contam.",
      },
      {
        cena: "lista",
        alvo: "lista.custo",
        instrucao: "Custo médio/kg: provisório ou gravado",
        explicacao:
          "Na OP aberta, o custo aparece com “(prov.)”, porque ainda muda. Na encerrada, é o custo gravado no " +
          "encerramento.",
      },
      {
        cena: "lista",
        alvo: "lista.numero",
        instrucao: "Clique no número para abrir a OP",
        explicacao: "Abre o detalhe, com o resumo e as quatro abas.",
      },
      {
        cena: "lista",
        alvo: "lista.verificar",
        instrucao: "Ache as OPs com problema",
        explicacao:
          "“A verificar” → Balanço (ou Branqueamento) mostra só as OPs não canceladas com aquele item fora do limite. " +
          "No exemplo, a OP de acerola do dia 19.",
        preenche: { "lista.verificar": "Balanço" },
      },
      {
        cena: "lista",
        alvo: "lista.status",
        instrucao: "Filtre pelo status, se quiser",
        explicacao: "Aberta, Encerrada ou Cancelada. Útil para achar OPs esquecidas abertas, com a polpa bloqueada.",
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
        "Os totais do período (fruto processado, polpa, rendimento e custo médio) estão no Painel e no Relatório de " +
        "processamento.",
    },
  }),
];
