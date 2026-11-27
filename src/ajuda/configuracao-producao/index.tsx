"use client";

import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alvo,
  BotaoSimulado,
  CampoSimulado,
  SelectSimulado,
} from "@/components/ajuda/campos-simulados";
import {
  construtorDeRoteiros,
  type DefinicaoAjuda,
  type PropsCena,
} from "@/ajuda/tipos";
import { ALERTAS } from "@/ajuda/estoque/exemplo";
import { CONFIGURACAO } from "@/ajuda/processamento/exemplo";
import { COMPRA, PRAZO_PRODUTOR_DIAS } from "@/ajuda/recepcao/exemplo";
import { FILIAL_ATIVA } from "@/ajuda/usuarios/exemplo";

// Espelho de src/app/(dashboard)/configuracao-producao/page.tsx e de configuracao-form.tsx. Mudou um rótulo, campo ou
// card lá? Ajuste aqui também.

/**
 * Exemplo: em 19/11/2026, véspera da primeira recepção da safra, você (Administrador) configura a Matriz. Os alertas,
 * o branqueamento e a tolerância ficam nos padrões, que são os valores das ajudas de Estoque e Processamento; a
 * categoria de compra e o prazo de 7 dias dão o vencimento 27/11 do José da Silva na Recepção. O teste confere.
 */
export const VALORES_INICIAIS = {
  "registro.adepara": "",
  "registro.endereco": "",
  "alerta.congelado": String(ALERTAS.alertaVencimentoCongeladoDias),
  "alerta.resfriado": String(ALERTAS.alertaVencimentoResfriadoDias),
  "branq.temperatura": String(CONFIGURACAO.branqueamentoTemperaturaMinC),
  "branq.tempo": String(CONFIGURACAO.branqueamentoTempoMinS),
  "balanco.tolerancia": String(CONFIGURACAO.toleranciaBalancoMassa * 100),
  "compra.categoria": "Nenhuma",
  "compra.prazo": "0",
  "vendas.categoria": "Nenhuma",
  "vendas.recebimento": "Nenhuma",
  "vendas.caixa": "Nenhuma",
} as const;

export const CATEGORIA_COMPRA = "Insumos Agrícolas";
export const CATEGORIA_VENDA = "Venda de produtos";
export const CONTA_RECEBIMENTO = "Banco do Brasil - Ag 1234/CC 12345-6";
export const CONTA_CAIXA = "Caixa · Fazenda";
export const REGISTRO_ADEPARA = "PA-0452/2026";
export const ENDERECO = "Ramal do Açaí, km 8, Zona rural · Abaetetuba/PA";

/** O que o primeiro roteiro deixa salvo; os outros dois partem daí. */
const SALVO_NO_PRIMEIRO = {
  "compra.categoria": CATEGORIA_COMPRA,
  "compra.prazo": String(PRAZO_PRODUTOR_DIAS),
  "vendas.categoria": CATEGORIA_VENDA,
  "vendas.recebimento": CONTA_RECEBIMENTO,
  "vendas.caixa": CONTA_CAIXA,
} as const;

/** A OP de acerola de 19/11 (Relatório de processamento): entra 250 kg, sai 225 kg, diferença de 10%. */
export const OP_ACEROLA = {
  numero: "OP-261119-01",
  entradaKg: 250,
  saidaKg: 225,
} as const;

export const ALVOS = {
  config: [
    "registro.adepara",
    "registro.endereco",
    "alerta.congelado",
    "alerta.resfriado",
    "branq.temperatura",
    "branq.tempo",
    "balanco.tolerancia",
    "compra.categoria",
    "compra.prazo",
    "vendas.categoria",
    "vendas.recebimento",
    "vendas.caixa",
    "salvar",
    "mensagem",
  ],
} as const;

function Ajuda({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function CenaConfiguracao({ valores }: PropsCena) {
  const v = (alvo: keyof typeof VALORES_INICIAIS) =>
    valores[alvo] ?? VALORES_INICIAIS[alvo];
  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Configuração de produção</p>
        <p className="text-sm text-muted-foreground">
          Parâmetros da filial ativa usados na recepção, no processamento e nos
          alertas de estoque.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <CampoSimulado
              alvo="registro.adepara"
              rotulo="Registro na ADEPARA"
              valor={v("registro.adepara")}
            />
            <Ajuda>Aparece na etiqueta do lote.</Ajuda>
          </div>
          <div className="space-y-2">
            <CampoSimulado
              alvo="registro.endereco"
              rotulo="Endereço na etiqueta"
              valor={v("registro.endereco")}
            />
            <Ajuda>
              Endereço do estabelecimento, em uma linha. O CNPJ vem do cadastro
              da filial.
            </Ajuda>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alertas de vencimento</CardTitle>
          <CardDescription>
            Com quantos dias de antecedência o lote aparece como
            &ldquo;vencendo&rdquo;.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CampoSimulado
            alvo="alerta.congelado"
            rotulo="Congelado (dias)"
            valor={v("alerta.congelado")}
          />
          <CampoSimulado
            alvo="alerta.resfriado"
            rotulo="In natura e resfriado (dias)"
            valor={v("alerta.resfriado")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branqueamento</CardTitle>
          <CardDescription>
            Mínimos para as frutas que exigem branqueamento (ex.: açaí).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CampoSimulado
            alvo="branq.temperatura"
            rotulo="Temperatura mínima (°C)"
            valor={v("branq.temperatura")}
          />
          <CampoSimulado
            alvo="branq.tempo"
            rotulo="Tempo mínimo (segundos)"
            valor={v("branq.tempo")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balanço de massa</CardTitle>
          <CardDescription>
            Diferença aceita entre o que entra (fruto + água) e o que sai (polpa
            + caroço + perda) numa ordem de produção.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CampoSimulado
            alvo="balanco.tolerancia"
            rotulo="Tolerância (%)"
            valor={v("balanco.tolerancia")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compra de fruto</CardTitle>
          <CardDescription>
            Usado na conta a pagar gerada pela recepção de fruto de terceiros.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <SelectSimulado
              alvo="compra.categoria"
              rotulo="Categoria financeira"
              valor={v("compra.categoria")}
            />
            <Ajuda>
              Sem categoria, a recepção de terceiro com valor é recusada.
            </Ajuda>
          </div>
          <div className="space-y-2">
            <CampoSimulado
              alvo="compra.prazo"
              rotulo="Prazo de pagamento ao produtor (dias)"
              valor={v("compra.prazo")}
            />
            <Ajuda>
              Vencimento padrão da conta a pagar da compra de fruto. Pode ser
              mudado em cada recepção.
            </Ajuda>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendas</CardTitle>
          <CardDescription>
            Usados pelo pedido de venda para criar a conta a receber e o
            recebimento à vista.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <SelectSimulado
              alvo="vendas.categoria"
              rotulo="Categoria de venda"
              valor={v("vendas.categoria")}
            />
            <Ajuda>Sem categoria, o pedido de venda é recusado.</Ajuda>
          </div>
          <SelectSimulado
            alvo="vendas.recebimento"
            rotulo="Conta de recebimento (Pix e transferência)"
            valor={v("vendas.recebimento")}
          />
          <div className="space-y-2">
            <SelectSimulado
              alvo="vendas.caixa"
              rotulo="Conta Caixa (dinheiro)"
              valor={v("vendas.caixa")}
            />
            <Ajuda>
              Cadastre uma conta do tipo Caixa em Cadastros → Contas bancárias.
            </Ajuda>
          </div>
        </CardContent>
      </Card>

      {valores.mensagem === "sim" ? (
        <Alvo nome="mensagem" className="w-fit px-1">
          <p className="text-sm text-muted-foreground">Configuração salva.</p>
        </Alvo>
      ) : null}
      <BotaoSimulado alvo="salvar">Salvar</BotaoSimulado>
    </div>
  );
}

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_PODE =
  "Quem pode: só o perfil Administrador, e só alterar numa filial em que tenha Alteração. Vale para a filial em que " +
  "você está: cada filial tem a sua configuração.";

export const ajudaConfiguracaoProducao: DefinicaoAjuda = {
  tituloTela: "Configuração de produção",
  resumo:
    "Os parâmetros da filial que a Produção e as Vendas usam sozinhas: a categoria e o prazo da compra de fruto, a " +
    "categoria e as contas da venda, os dados da etiqueta do lote, os alertas de vencimento e os limites que fazem " +
    "a OP marcar “Verificar”. Enquanto nada for salvo, valem os padrões.",
  cenas: { config: CenaConfiguracao },
  roteiros: [
    roteiro({
      id: "preparar-recepcao-vendas",
      titulo: "Preparar a recepção e as vendas",
      quandoUsar:
        "Antes da primeira compra de fruto de terceiro e do primeiro pedido de venda da filial: sem as categorias, " +
        "os dois são recusados.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "config",
          alvo: "compra.categoria",
          instrucao: "Escolha a categoria da compra de fruto",
          explicacao:
            `É a categoria da conta a pagar que a recepção cria quando compra fruto de terceiro. No exemplo, ` +
            `${CATEGORIA_COMPRA}. A lista traz só as categorias de despesa ativas da filial.`,
          dica: "Sem ela, a recepção de terceiro com valor é recusada. A colheita própria não precisa.",
          preenche: { "compra.categoria": CATEGORIA_COMPRA },
        },
        {
          cena: "config",
          alvo: "compra.prazo",
          instrucao: "Informe o prazo de pagamento ao produtor",
          explicacao:
            `Em dias depois da recepção. No exemplo, ${PRAZO_PRODUTOR_DIAS}: o açaí do ${COMPRA.fornecedor}, recebido ` +
            `em ${COMPRA.data}, vence em ${COMPRA.vencimento}.`,
          dica: "Com 0, vence no dia da recepção. Em cada recepção dá para mudar o vencimento.",
          preenche: { "compra.prazo": String(PRAZO_PRODUTOR_DIAS) },
        },
        {
          cena: "config",
          alvo: "vendas.categoria",
          instrucao: "Escolha a categoria de venda",
          explicacao:
            `É a categoria da conta a receber de cada pedido. No exemplo, ${CATEGORIA_VENDA}. A lista traz só as ` +
            "categorias de receita ativas.",
          dica: "Sem ela, nenhum pedido de venda é aceito, nem à vista.",
          preenche: { "vendas.categoria": CATEGORIA_VENDA },
        },
        {
          cena: "config",
          alvo: "vendas.recebimento",
          instrucao: "Escolha a conta de recebimento",
          explicacao:
            "A conta que já vem marcada no pedido pago em Pix ou transferência (dá para trocar no pedido). Contas do " +
            "tipo Caixa não aparecem aqui.",
          dica:
            "A venda na maquininha não usa esta conta: o dinheiro cai na conta de depósito da operadora " +
            "(Cadastros → Operadoras de cartão).",
          preenche: { "vendas.recebimento": CONTA_RECEBIMENTO },
        },
        {
          cena: "config",
          alvo: "vendas.caixa",
          instrucao: "Escolha a conta Caixa",
          explicacao:
            `A que já vem marcada no pedido pago em dinheiro. No exemplo, o ${CONTA_CAIXA}. Só aparecem contas do ` +
            "tipo Caixa.",
          dica: "Nenhuma conta na lista? Cadastre uma do tipo Caixa em Cadastros → Contas bancárias.",
          preenche: { "vendas.caixa": CONTA_CAIXA },
        },
        {
          cena: "config",
          alvo: "salvar",
          instrucao: "Clique em “Salvar”",
          explicacao:
            "Salva a tela inteira de uma vez. Vale para as recepções e os pedidos lançados daqui em diante.",
        },
        {
          cena: "config",
          alvo: "mensagem",
          instrucao: "Confira a mensagem",
          explicacao:
            "“Configuração salva.” aparece embaixo da tela. A alteração fica na Auditoria, com o valor anterior e o " +
            "novo.",
          dica:
            "Inativou depois a categoria ou a conta escolhida? O topo desta tela avisa, o campo mostra “(inativa)” e a " +
            "recepção e o pedido explicam a recusa. Escolha outra aqui ou reative o cadastro.",
          preenche: { mensagem: "sim" },
        },
      ],
      eDepois: {
        texto:
          "A recepção de terceiro passa a criar a conta a pagar e o pedido de venda, a conta a receber. Falta a " +
          "etiqueta do lote.",
        proximoRoteiro: "dados-etiqueta",
      },
    }),
    roteiro({
      id: "dados-etiqueta",
      titulo: "Dados da etiqueta do lote",
      quandoUsar:
        "Antes de imprimir a primeira etiqueta, ou quando o registro ou o endereço mudar.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "config",
          alvo: "registro.adepara",
          instrucao: "Informe o registro na ADEPARA",
          explicacao:
            "Sai no rodapé da etiqueta como “Registro ADEPARA: …”. Em branco, a linha não é impressa.",
          preenche: {
            ...SALVO_NO_PRIMEIRO,
            "registro.adepara": REGISTRO_ADEPARA,
          },
        },
        {
          cena: "config",
          alvo: "registro.endereco",
          instrucao: "Informe o endereço em uma linha",
          explicacao:
            "Sai logo abaixo do nome da empresa e do CNPJ. O CNPJ não se digita aqui: vem do cadastro da filial " +
            `(Administração → Filiais), no exemplo o da ${FILIAL_ATIVA}.`,
          dica: "A etiqueta tem uma linha para o endereço: texto mais longo é cortado.",
          preenche: { "registro.endereco": ENDERECO },
        },
        {
          cena: "config",
          alvo: "salvar",
          instrucao: "Clique em “Salvar”",
          explicacao:
            "As etiquetas impressas daqui em diante saem com o registro e o endereço, também a reimpressão de lotes " +
            "antigos.",
        },
        {
          cena: "config",
          alvo: "mensagem",
          instrucao: "Confira a mensagem",
          explicacao:
            "“Configuração salva.” A etiqueta se imprime na Recepção, no Estoque, no detalhe da OP e na Rastreabilidade.",
          dica:
            "Ingredientes, “manter congelado a −18 °C” e os outros dizeres do produto ficam no cadastro de cada " +
            "produto (Cadastros → Produtos), não aqui.",
          preenche: { mensagem: "sim" },
        },
      ],
      eDepois: {
        texto:
          "Os outros números da tela já vêm com valores padrão. Veja o que cada um muda antes de mexer.",
        proximoRoteiro: "alertas-controles",
      },
    }),
    roteiro({
      id: "alertas-controles",
      titulo: "Alertas de vencimento e controles da OP",
      quandoUsar:
        "Quando o Estoque avisa cedo ou tarde demais, ou quando a fábrica muda o processo de branqueamento ou a " +
        "tolerância de perdas.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "config",
          alvo: "alerta.congelado",
          instrucao: "Dias de alerta do congelado",
          explicacao:
            `Lote congelado que vence em até ${ALERTAS.alertaVencimentoCongeladoDias} dias aparece como “Vencendo” ` +
            "no Estoque e no Painel. O padrão é 30.",
          preenche: {
            ...SALVO_NO_PRIMEIRO,
            "registro.adepara": REGISTRO_ADEPARA,
            "registro.endereco": ENDERECO,
          },
        },
        {
          cena: "config",
          alvo: "alerta.resfriado",
          instrucao: "Dias de alerta do in natura e resfriado",
          explicacao:
            "Vale para os lotes in natura (o fruto) e resfriados. Com " +
            `${ALERTAS.alertaVencimentoResfriadoDias}, o ` +
            "lote aparece como “Vencendo” na véspera e no dia da validade. O padrão é 1.",
          dica: "Com 0, só no dia da validade. Lote com validade já passada aparece como “Vencido”, com qualquer número.",
        },
        {
          cena: "config",
          alvo: "branq.temperatura",
          instrucao: "Temperatura mínima do branqueamento",
          explicacao:
            "Só para frutas que exigem branqueamento (marcado em Cadastros → Frutas; no exemplo, o açaí). A OP " +
            `com temperatura abaixo de ${CONFIGURACAO.branqueamentoTemperaturaMinC} °C marca “Verificar”.`,
        },
        {
          cena: "config",
          alvo: "branq.tempo",
          instrucao: "Tempo mínimo do branqueamento",
          explicacao:
            `Em segundos. A OP precisa ter as duas coisas: pelo menos ${CONFIGURACAO.branqueamentoTemperaturaMinC} ` +
            `°C e ${CONFIGURACAO.branqueamentoTempoMinS} s. Faltando um dos dois na OP, também fica “Verificar”.`,
        },
        {
          cena: "config",
          alvo: "balanco.tolerancia",
          instrucao: "Tolerância do balanço de massa",
          explicacao:
            `Em %. A ${OP_ACEROLA.numero} recebeu ${OP_ACEROLA.entradaKg} kg e somou ${OP_ACEROLA.saidaKg} kg de ` +
            `polpa, caroço e perda: faltam 10%, mais que os ${CONFIGURACAO.toleranciaBalancoMassa * 100}%, e ela ` +
            "marca “Verificar”.",
          dica:
            "“Verificar” não bloqueia nada: é um aviso na OP e no Relatório de processamento para alguém conferir " +
            "as pesagens.",
        },
        {
          cena: "config",
          alvo: "salvar",
          instrucao: "Mudou algum número? Clique em “Salvar”",
          explicacao:
            "Vale para as OPs abertas e as próximas. A OP encerrada guarda a tolerância e os mínimos do dia em que foi " +
            "encerrada: subir a tolerância para 10% não tira o “Verificar” da OP de acerola, já encerrada.",
          dica:
            "Os avisos de vencimento do estoque usam sempre os dias de hoje. Reabrir uma OP faz ela voltar a usar os " +
            "números atuais; ao encerrar de novo, guarda os novos.",
        },
      ],
      eDepois: {
        texto:
          "Para ver o efeito, abra o Estoque (status dos lotes) ou a lista de Processamento (filtro “A verificar”).",
      },
    }),
  ],
};
