"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alvo } from "@/components/ajuda/campos-simulados";
import { formatarMoeda } from "@/lib/formatacao";
import { construtorDeRoteiros, type DefinicaoAjuda } from "@/ajuda/tipos";
import { percentualComVirgula, ROTULOS_FAIXA_AGING } from "@/app/(dashboard)/dashboard-executivo/formatos";

// Espelho de src/app/(dashboard)/dashboard-executivo/page.tsx, dos três gráficos e do aviso de filiais desativadas
// (_shared/aviso-filiais-desativadas.tsx). Mudou um card, rótulo ou gráfico lá? Ajuste aqui também. Os gráficos da
// cena são imitação em CSS (sem recharts).

/**
 * Exemplo: em 22/11/2026, você (Administrador) abre o dashboard da Empresa Demonstração, que soma a Matriz e a Filial
 * Igarapé-Miri. As parcelas em aberto são as das outras ajudas (o açaí do José da Silva, a última parcela do adubo e
 * do trator, a Sorveteria Polar, o Mercadinho São João) mais algumas contas do mês. Fictício e fixo. Os cards e o
 * aging são escritos à mão; o teste confere com `calcularIndicadoresExecutivos` e `calcularAging`. A parcela 2 do adubo
 * (R$ 1.012,00) foi paga e aprovada em 19/11 e ainda aguarda conciliação.
 */
export const HOJE = "22/11/2026";
export const HOJE_ISO = "2026-11-22";

export type ParcelaExemplo = {
  descricao: string;
  tipo: "PAGAR" | "RECEBER";
  vencimento: string;
  saldo: number;
};

export const PARCELAS: readonly ParcelaExemplo[] = [
  { descricao: "Açaí do José da Silva (FA-261120-01)", tipo: "PAGAR", vencimento: "2026-11-27", saldo: 3360 },
  { descricao: "Adubo da Agro Insumos, parcela 3", tipo: "PAGAR", vencimento: "2026-12-10", saldo: 1000 },
  { descricao: "Energia elétrica de novembro", tipo: "PAGAR", vencimento: "2026-12-05", saldo: 1850 },
  { descricao: "Mão de obra temporária da safra", tipo: "PAGAR", vencimento: "2026-12-28", saldo: 2400 },
  { descricao: "Embalagens Norte, caixas de outubro", tipo: "PAGAR", vencimento: "2026-10-15", saldo: 600 },
  { descricao: "Trator usado, parcela 3", tipo: "RECEBER", vencimento: "2026-12-10", saldo: 15000 },
  { descricao: "Sorveteria Polar, pedido 131 (1/2)", tipo: "RECEBER", vencimento: "2026-12-06", saldo: 350 },
  { descricao: "Sorveteria Polar, pedido 131 (2/2)", tipo: "RECEBER", vencimento: "2026-12-20", saldo: 350 },
  { descricao: "Mercadinho São João, pedido 115", tipo: "RECEBER", vencimento: "2026-10-30", saldo: 450 },
  { descricao: "Lanchonete Tucumã, venda de agosto", tipo: "RECEBER", vencimento: "2026-08-05", saldo: 280 },
];

/** Saldo conciliado das contas em 22/11 (o fim da evolução do saldo). */
export const CAIXA_CONCILIADO = 52300;

/** A parcela 2 do adubo, paga e aprovada em 19/11, que o extrato ainda não confirmou. */
export const AGUARDANDO_CONCILIACAO = { entradas: 0, saidas: 1012 } as const;

/** Lançamentos conciliados, por mês (de junho a novembro), sem transferências entre contas. */
export const MESES = [
  { mes: "jun. de 26", entradas: 12000, saidas: 10500 },
  { mes: "jul. de 26", entradas: 9800, saidas: 11200 },
  { mes: "ago. de 26", entradas: 8600, saidas: 9900 },
  { mes: "set. de 26", entradas: 21500, saidas: 12300 },
  { mes: "out. de 26", entradas: 24800, saidas: 13600 },
  { mes: "nov. de 26", entradas: 18400, saidas: 11250 },
] as const;

/** Saldo conciliado no fim de maio: o ponto de partida da evolução do saldo. */
export const SALDO_ANTES_DE_JUNHO = 25950;

export const INDICADORES = {
  caixaDisponivel: 51288,
  aguardandoConciliacao: -1012,
  contasAPagarEmAberto: 9210,
  contasAReceberEmAberto: 16430,
  inadimplencia: 730,
  geracaoDeCaixaMesAtual: 7150,
  obrigacoes7Dias: 3360,
  obrigacoes30Dias: 6210,
  recebimentosEsperados30Dias: 15700,
  saldoProjetado30Dias: 60908, // 51.288 + 730 − 600 + 15.700 − 6.210
} as const;

/** Novembro: as entradas do mês divididas entre fiscal e gerencial (somam as entradas de novembro). */
export const FISCAL = { entradasFiscal: 14900, entradasGerencial: 3500, pendenciasFiscais: 2 } as const;

export const AGING = [
  { faixa: "0-30", contasAPagar: 0, contasAReceber: 450 },
  { faixa: "31-60", contasAPagar: 600, contasAReceber: 0 },
  { faixa: "61-90", contasAPagar: 0, contasAReceber: 0 },
  { faixa: "90+", contasAPagar: 0, contasAReceber: 280 },
] as const;

/** A filial inativada na ajuda de Filiais: ficou com o troco no caixa. */
export const CAMETA = { nome: "Posto de compra Cametá", saldoEmCaixa: 120 } as const;

export const ALVOS = {
  painel: [
    "aviso",
    "card.caixa",
    "card.pagar",
    "card.receber",
    "card.inadimplencia",
    "card.geracao",
    "card.obrig7",
    "card.obrig30",
    "card.receb30",
    "card.projetado",
    "fiscal.entradas",
    "fiscal.percentual",
    "fiscal.pendencias",
    "fiscal.link",
    "grafico.entradasSaidas",
    "grafico.saldo",
    "grafico.aging",
  ],
} as const;

type AlvoPainel = (typeof ALVOS.painel)[number];

const CARDS: readonly { alvo: AlvoPainel; label: string; valor: number; nota?: string }[] = [
  {
    alvo: "card.caixa",
    label: "Caixa disponível",
    valor: INDICADORES.caixaDisponivel,
    nota: `${formatarMoeda(INDICADORES.aguardandoConciliacao)} aguardando conciliação`,
  },
  { alvo: "card.pagar", label: "Contas a pagar em aberto", valor: INDICADORES.contasAPagarEmAberto },
  { alvo: "card.receber", label: "Contas a receber em aberto", valor: INDICADORES.contasAReceberEmAberto },
  { alvo: "card.inadimplencia", label: "Inadimplência", valor: INDICADORES.inadimplencia },
  { alvo: "card.geracao", label: "Geração de caixa (mês atual)", valor: INDICADORES.geracaoDeCaixaMesAtual },
  { alvo: "card.obrig7", label: "Obrigações (7 dias)", valor: INDICADORES.obrigacoes7Dias },
  { alvo: "card.obrig30", label: "Obrigações (30 dias)", valor: INDICADORES.obrigacoes30Dias },
  { alvo: "card.receb30", label: "Recebimentos esperados (30 dias)", valor: INDICADORES.recebimentosEsperados30Dias },
  {
    alvo: "card.projetado",
    label: "Saldo projetado (30 dias)",
    valor: INDICADORES.saldoProjetado30Dias,
    nota: "Inclui atrasados e o que aguarda conciliação",
  },
];

export const PERCENTUAL_GERENCIAL =
  (FISCAL.entradasGerencial / (FISCAL.entradasFiscal + FISCAL.entradasGerencial)) * 100;

function CardValor({ alvo, label, children }: { alvo: AlvoPainel; label: string; children: ReactNode }) {
  return (
    <Alvo nome={alvo}>
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </Alvo>
  );
}

const MAIOR_MOVIMENTO = Math.max(...MESES.flatMap((m) => [m.entradas, m.saidas]));
const SALDOS = MESES.reduce<number[]>(
  (lista, m) => [...lista, (lista.at(-1) ?? SALDO_ANTES_DE_JUNHO) + m.entradas - m.saidas],
  [],
);
const MAIOR_SALDO = Math.max(...SALDOS);
const MAIOR_AGING = Math.max(...AGING.flatMap((a) => [a.contasAPagar, a.contasAReceber]));

/** Barra vertical de altura proporcional, como as do recharts. */
function Barra({ valor, maior, cor, titulo }: { valor: number; maior: number; cor: string; titulo: string }) {
  return (
    <div
      className="w-3 rounded-t-sm sm:w-4"
      style={{ height: `${Math.max((valor / maior) * 100, valor > 0 ? 2 : 0)}%`, background: cor }}
      title={`${titulo}: ${formatarMoeda(valor)}`}
    />
  );
}

function Legenda({ itens }: { itens: readonly { cor: string; rotulo: string }[] }) {
  return (
    <div className="flex justify-center gap-4 text-xs text-muted-foreground">
      {itens.map((item) => (
        <span key={item.rotulo} className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: item.cor }} />
          {item.rotulo}
        </span>
      ))}
    </div>
  );
}

const COR_ENTRADA = "var(--chart-2)";
const COR_SAIDA = "var(--chart-4)";

function CenaPainel() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-lg font-semibold">Dashboard executivo</p>
        <p className="text-sm text-muted-foreground">
          Consolidado das filiais ativas da empresa. Restrito a Administrador, Gestor e Auditor.
        </p>
      </div>

      <Alvo nome="aviso">
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="note">
          <p>Uma filial desativada não entra nestes números, mas ainda tem pendências:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              <span className="font-medium text-foreground">{CAMETA.nome}</span>: saldo em caixa de{" "}
              {formatarMoeda(CAMETA.saldoEmCaixa)}.
            </li>
          </ul>
          <p className="mt-1">
            Para tratar essas pendências, um administrador pode reativar a filial em Administração → Filiais.
          </p>
        </div>
      </Alvo>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {CARDS.map((card) => (
          <CardValor key={card.alvo} alvo={card.alvo} label={card.label}>
            <p className="text-2xl font-semibold">{formatarMoeda(card.valor)}</p>
            {card.nota && <p className="mt-1 text-xs text-muted-foreground">{card.nota}</p>}
          </CardValor>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-base font-semibold">Fiscal × gerencial (mês atual)</p>
          <Alvo nome="fiscal.link" className="inline-block px-1">
            <span className="text-sm text-primary">Ver relatório da filial ativa</span>
          </Alvo>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Alvo nome="fiscal.entradas" className="col-span-2 grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Entradas fiscais</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatarMoeda(FISCAL.entradasFiscal)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Entradas gerenciais</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatarMoeda(FISCAL.entradasGerencial)}</p>
              </CardContent>
            </Card>
          </Alvo>
          <CardValor alvo="fiscal.percentual" label="% gerencial nas entradas">
            <p className="text-2xl font-semibold">{percentualComVirgula(PERCENTUAL_GERENCIAL)}</p>
          </CardValor>
          <CardValor alvo="fiscal.pendencias" label="Pendências fiscais">
            <p className="text-2xl font-semibold">{FISCAL.pendenciasFiscais}</p>
            <p className="text-xs text-muted-foreground">Títulos fiscais sem nota, chave ou anexo</p>
          </CardValor>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Alvo nome="grafico.entradasSaidas" className="space-y-2 p-1">
          <p className="text-base font-semibold">Entradas x Saídas (últimos 6 meses)</p>
          <div className="flex h-40 items-end justify-around border-b border-l px-2">
            {MESES.map((m) => (
              <div key={m.mes} className="flex h-full items-end gap-0.5">
                <Barra valor={m.entradas} maior={MAIOR_MOVIMENTO} cor={COR_ENTRADA} titulo="Entradas" />
                <Barra valor={m.saidas} maior={MAIOR_MOVIMENTO} cor={COR_SAIDA} titulo="Saídas" />
              </div>
            ))}
          </div>
          <div className="flex justify-around text-xs text-muted-foreground">
            {MESES.map((m) => (
              <span key={m.mes}>{m.mes.slice(0, 4)}</span>
            ))}
          </div>
          <Legenda
            itens={[
              { cor: COR_ENTRADA, rotulo: "Entradas" },
              { cor: COR_SAIDA, rotulo: "Saídas" },
            ]}
          />
        </Alvo>
        <Alvo nome="grafico.saldo" className="space-y-2 p-1">
          <p className="text-base font-semibold">Evolução do saldo (últimos 6 meses)</p>
          <div className="flex h-40 items-end justify-around border-b border-l px-2">
            {SALDOS.map((saldo, i) => (
              <div key={MESES[i].mes} className="relative h-full w-2.5">
                {/* Altura proporcional ao saldo; % de `bottom` usa a altura da coluna (a de margem usaria a largura). */}
                <div
                  className="absolute left-0 size-2.5 -translate-y-1/2 rounded-full"
                  style={{ background: "var(--chart-3)", bottom: `${(saldo / MAIOR_SALDO) * 90}%` }}
                  title={`Saldo: ${formatarMoeda(saldo)}`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-around text-xs text-muted-foreground">
            {MESES.map((m) => (
              <span key={m.mes}>{m.mes.slice(0, 4)}</span>
            ))}
          </div>
        </Alvo>
        <Alvo nome="grafico.aging" className="space-y-2 p-1 lg:col-span-2">
          <p className="text-base font-semibold">Aging de contas a pagar/receber (vencidas, por dias de atraso)</p>
          <div className="flex h-40 items-end justify-around border-b border-l px-2">
            {AGING.map((a) => (
              <div key={a.faixa} className="flex h-full items-end gap-0.5">
                <Barra valor={a.contasAPagar} maior={MAIOR_AGING} cor={COR_SAIDA} titulo="Contas a pagar" />
                <Barra valor={a.contasAReceber} maior={MAIOR_AGING} cor={COR_ENTRADA} titulo="Contas a receber" />
              </div>
            ))}
          </div>
          <div className="flex justify-around text-xs text-muted-foreground">
            {AGING.map((a) => (
              <span key={a.faixa}>{ROTULOS_FAIXA_AGING[a.faixa]}</span>
            ))}
          </div>
          <Legenda
            itens={[
              { cor: COR_SAIDA, rotulo: "Contas a pagar" },
              { cor: COR_ENTRADA, rotulo: "Contas a receber" },
            ]}
          />
        </Alvo>
      </div>
    </div>
  );
}

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_PODE =
  "Quem pode: os perfis Administrador, Gestor e Auditor. Os números somam todas as filiais ativas da empresa, " +
  "também as em que a pessoa não tem acesso.";

const moeda = formatarMoeda;

export const ajudaDashboardExecutivo: DefinicaoAjuda = {
  tituloTela: "Dashboard executivo",
  resumo:
    "A empresa inteira numa tela: caixa, contas em aberto, o que vence nos próximos dias, o fiscal × gerencial do " +
    "mês e três gráficos. Só leitura: para agir, vá à tela de cada assunto.",
  cenas: { painel: CenaPainel },
  roteiros: [
    roteiro({
      id: "ler-indicadores",
      titulo: "Ler os indicadores",
      quandoUsar:
        "Para saber, numa olhada, quanto há em caixa, quanto se deve, quanto falta receber e como fecha o mês.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "painel",
          alvo: "card.caixa",
          instrucao: "Caixa disponível",
          explicacao:
            `Saldo de todas as contas das filiais ativas em ${HOJE}, o mesmo saldo contábil da Tesouraria: o que o ` +
            `extrato já confirmou (${moeda(CAIXA_CONCILIADO)}) mais o que foi lançado e ainda aguarda conciliação. No ` +
            `exemplo, a parcela 2 do adubo, paga e aprovada em 19/11: ${moeda(INDICADORES.caixaDisponivel)}.`,
          dica: "A linha embaixo do valor mostra quanto ainda aguarda conciliação. Ela some quando tudo está conciliado.",
        },
        {
          cena: "painel",
          alvo: "card.pagar",
          instrucao: "Contas a pagar e a receber em aberto",
          explicacao:
            "O que falta pagar e receber de todas as parcelas em aberto, vencidas ou não, já descontadas as baixas " +
            `aprovadas. No exemplo, ${moeda(INDICADORES.contasAPagarEmAberto)} a pagar.`,
        },
        {
          cena: "painel",
          alvo: "card.inadimplencia",
          instrucao: "Inadimplência",
          explicacao:
            "O que os clientes deviam ter pago e não pagaram: parcelas a receber com vencimento antes de hoje. No " +
            `exemplo, ${moeda(INDICADORES.inadimplencia)}: o Mercadinho São João (pedido 115, R$ 450,00) e a ` +
            "Lanchonete Tucumã (R$ 280,00, de agosto).",
          dica: "Parcela paga em parte entra pelo que falta.",
        },
        {
          cena: "painel",
          alvo: "card.geracao",
          instrucao: "Geração de caixa do mês",
          explicacao:
            "Entradas menos saídas conciliadas desde o dia 1º. Em novembro: R$ 18.400,00 − R$ 11.250,00 = " +
            `${moeda(INDICADORES.geracaoDeCaixaMesAtual)}.`,
        },
        {
          cena: "painel",
          alvo: "card.obrig7",
          instrucao: "Obrigações em 7 e 30 dias",
          explicacao:
            "Contas a pagar que vencem de hoje até daqui a 7 (ou 30) dias. Nos 7 dias, só o açaí do José da Silva, " +
            `${moeda(INDICADORES.obrigacoes7Dias)}, que vence em 27/11.`,
          dica: "Conta já vencida não entra aqui: ela aparece no aging, lá embaixo.",
        },
        {
          cena: "painel",
          alvo: "card.receb30",
          instrucao: "Recebimentos esperados em 30 dias",
          explicacao:
            "Contas a receber que vencem de hoje até daqui a 30 dias: a última parcela do trator e as duas da " +
            `Sorveteria Polar, ${moeda(INDICADORES.recebimentosEsperados30Dias)}. As atrasadas não entram.`,
        },
        {
          cena: "painel",
          alvo: "card.projetado",
          instrucao: "Saldo projetado em 30 dias",
          explicacao:
            "A mesma conta do Fluxo de caixa projetado: caixa disponível + atrasados (a receber − a pagar) + " +
            `recebimentos esperados − obrigações de 30 dias: ${moeda(INDICADORES.caixaDisponivel)} + ` +
            `${moeda(INDICADORES.inadimplencia)} − R$ 600,00 + ${moeda(INDICADORES.recebimentosEsperados30Dias)} − ` +
            `${moeda(INDICADORES.obrigacoes30Dias)} = ${moeda(INDICADORES.saldoProjetado30Dias)}.`,
          dica:
            "Os atrasados entram porque esse dinheiro ainda vai entrar ou sair. Para ver mês a mês, use o Fluxo de " +
            "caixa projetado.",
        },
        {
          cena: "painel",
          alvo: "aviso",
          instrucao: "Filial desativada com pendência",
          explicacao:
            `Filial desativada não entra em nenhum número. Se ela ainda tem dinheiro ou contas em aberto, o aviso ` +
            `mostra quanto: no exemplo, o ${CAMETA.nome} ficou com ${moeda(CAMETA.saldoEmCaixa)} de troco.`,
          dica:
            "Para acertar, um administrador reativa a filial (Administração → Filiais) e resolve dentro dela: as " +
            "transferências só acontecem entre contas da mesma filial.",
        },
      ],
      eDepois: {
        texto: "Logo abaixo dos cards fica o fiscal × gerencial do mês.",
        proximoRoteiro: "fiscal-gerencial",
      },
    }),
    roteiro({
      id: "fiscal-gerencial",
      titulo: "Fiscal × gerencial do mês",
      quandoUsar: "Para acompanhar quanto do que entra tem nota e quantos títulos fiscais ainda estão incompletos.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "painel",
          alvo: "fiscal.entradas",
          instrucao: "Entradas fiscais e gerenciais",
          explicacao:
            "As entradas conciliadas do mês, separadas pela classificação do lançamento: Fiscal (com documento) e " +
            "Gerencial (sem nota). Transferências entre contas não entram.",
        },
        {
          cena: "painel",
          alvo: "fiscal.percentual",
          instrucao: "% gerencial nas entradas",
          explicacao:
            `Gerencial ÷ (fiscal + gerencial). No exemplo, ${moeda(FISCAL.entradasGerencial)} de ` +
            `${moeda(FISCAL.entradasFiscal + FISCAL.entradasGerencial)}: ${percentualComVirgula(PERCENTUAL_GERENCIAL)}.`,
          dica: "Sem nenhuma entrada classificada no mês, aparece “—”.",
        },
        {
          cena: "painel",
          alvo: "fiscal.pendencias",
          instrucao: "Pendências fiscais",
          explicacao:
            "Quantos títulos fiscais ativos estão sem tipo de documento, número da nota, chave de acesso ou anexo, " +
            "somando as filiais. Não bloqueia nada: é um lembrete.",
        },
        {
          cena: "painel",
          alvo: "fiscal.link",
          instrucao: "Clique em “Ver relatório da filial ativa”",
          explicacao:
            "Abre o relatório Fiscal × gerencial com a lista das pendências. Atenção: o relatório é só da filial em " +
            "que você está; o dashboard soma todas. Para ver outra filial, troque de filial antes.",
        },
      ],
      eDepois: {
        texto: "Mais abaixo, os gráficos mostram os últimos seis meses e as contas atrasadas.",
        proximoRoteiro: "ler-graficos",
      },
    }),
    roteiro({
      id: "ler-graficos",
      titulo: "Ler os gráficos",
      quandoUsar: "Para ver a tendência dos últimos meses e o tamanho dos atrasos.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "painel",
          alvo: "grafico.entradasSaidas",
          instrucao: "Entradas x Saídas",
          explicacao:
            "Uma dupla de barras por mês, dos últimos 6, com o mês atual no fim. Só lançamentos conciliados. Passe o " +
            "mouse numa barra para ver o valor.",
          dica:
            "Transferência entre contas da empresa aparece como entrada e como saída e infla as duas barras (o " +
            "saldo não muda).",
        },
        {
          cena: "painel",
          alvo: "grafico.saldo",
          instrucao: "Evolução do saldo",
          explicacao:
            "O saldo conciliado de todas as contas no fim de cada mês. O mês atual vai até o último dia: sem " +
            `lançamento com data futura, é o caixa conciliado (${moeda(CAIXA_CONCILIADO)}). O Caixa disponível ` +
            "soma a isso o que aguarda conciliação.",
        },
        {
          cena: "painel",
          alvo: "grafico.aging",
          instrucao: "Aging",
          explicacao:
            "Só as parcelas vencidas e não pagas, por dias de atraso. No exemplo: a receber, o Mercadinho (1–30 dias) " +
            "e a Lanchonete Tucumã (mais de 90); a pagar, as caixas da Embalagens Norte, vencidas em 15/10 (31–60).",
          dica: "Quanto mais à direita, mais difícil de cobrar (ou mais juros a pagar). Comece por lá.",
        },
      ],
      eDepois: {
        texto:
          "Para agir sobre o que viu, vá a Contas a pagar, Contas a receber ou ao Fluxo de caixa projetado; o " +
          "dashboard só mostra.",
      },
    }),
  ],
};
