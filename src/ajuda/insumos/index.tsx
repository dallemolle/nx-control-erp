"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada } from "@/components/ajuda/campos-simulados";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";

// Espelho de src/app/(dashboard)/cadastros/insumos/page.tsx e de insumo-dialog-form.tsx. Mudou um rótulo, campo ou
// coluna lá? Ajuste aqui também.

/**
 * Exemplo: os três insumos da OP-261120-01 (ajuda do Processamento), com o custo do dia 20/11. Em 21/11 a fábrica
 * passa a envasar polpa em 500 g e a conta de luz sobe. Lista em ordem de nome.
 */
export type InsumoExemplo = { nome: string; unidade: string; custoUnitario: number };

export const INSUMOS: readonly InsumoExemplo[] = [
  { nome: "Embalagem 1 kg", unidade: "un", custoUnitario: 0.35 },
  { nome: "Energia elétrica", unidade: "kWh", custoUnitario: 0.9 },
  { nome: "Mão de obra", unidade: "h", custoUnitario: 20 },
];
export const EMBALAGEM_500: InsumoExemplo = { nome: "Embalagem 500 g", unidade: "un", custoUnitario: 0.25 };
export const NOVO_CUSTO_ENERGIA = 0.95;

export const ALVOS = {
  lista: ["lista.novo", "lista.tabela", "lista.embalagem", "lista.custo-energia", "lista.editar-energia"],
  novo: ["form.nome", "form.unidade", "form.custo", "form.salvar"],
  editar: ["form.nome", "form.unidade", "form.custo", "form.salvar"],
} as const;

/** Os insumos no ponto do roteiro: `lista.embalagem` = "sim" depois de salvo; `lista.custo-energia` = custo novo. */
export function insumosDoRoteiro(valores: Valores) {
  const custoEnergia = valores["lista.custo-energia"];
  const linhas = INSUMOS.map((i) =>
    i.nome === "Energia elétrica" && custoEnergia ? { ...i, custoUnitario: Number(custoEnergia) } : i,
  );
  if (valores["lista.embalagem"] === "sim") linhas.push(EMBALAGEM_500);
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Insumos</p>
          <p className="text-sm text-muted-foreground">
            Embalagens, energia e mão de obra usadas no processamento. O custo aqui é a referência; cada ordem de
            produção grava o custo do dia.
          </p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo insumo</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead className="text-right">Custo unitário</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {insumosDoRoteiro(valores).map((i) => {
              const energia = i.nome === "Energia elétrica";
              const custo = formatarMoeda(i.custoUnitario);
              return (
                <TableRow key={i.nome}>
                  <TableCell className="font-medium">
                    {i.nome === EMBALAGEM_500.nome ? (
                      <Alvo nome="lista.embalagem" className="inline-block px-1">
                        {i.nome}
                      </Alvo>
                    ) : (
                      i.nome
                    )}
                  </TableCell>
                  <TableCell>{i.unidade}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {energia ? (
                      <Alvo nome="lista.custo-energia" className="inline-block px-1">
                        {custo}
                      </Alvo>
                    ) : (
                      custo
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">Ativo</Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <BotaoSimulado alvo={energia ? "lista.editar-energia" : undefined} variant="outline" size="sm">
                      Editar
                    </BotaoSimulado>
                    <BotaoSimulado variant="outline" size="sm">
                      Inativar
                    </BotaoSimulado>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Alvo>
    </div>
  );
}

function Formulario({ valores, titulo }: PropsCena & { titulo: string }) {
  return (
    <JanelaSimulada titulo={titulo}>
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} />
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSimulado alvo="form.unidade" rotulo="Unidade" valor={valores["form.unidade"]} placeholder="un" />
        <CampoSimulado alvo="form.custo" rotulo="Custo unitário (R$)" valor={valores["form.custo"]?.replace(".", ",")} />
      </div>
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

const CenaNovo = (props: PropsCena) => <Formulario {...props} titulo="Novo insumo" />;
const CenaEditar = (props: PropsCena) => <Formulario {...props} titulo="Editar insumo" />;

const roteiro = construtorDeRoteiros<typeof ALVOS>();
const QUEM_PODE =
  "Quem pode: perfis Administrador e Produção, com permissão de alteração na filial. Os demais perfis veem a lista, " +
  "sem os botões. O insumo é da empresa: vale para todas as filiais.";

export const ajudaInsumos: DefinicaoAjuda = {
  tituloTela: "Insumos",
  resumo:
    "O que a fábrica gasta além do fruto: embalagens, energia, mão de obra. Lançados na OP, entram no custo da polpa.",
  cenas: { lista: CenaLista, novo: CenaNovo, editar: CenaEditar },
  roteiros: [
    roteiro({
      id: "cadastrar-insumo",
      titulo: "Cadastrar um insumo",
      quandoUsar: "Quando a fábrica passa a usar algo novo que deve entrar no custo da polpa.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.novo",
          instrucao: "Clique em “Novo insumo”",
          explicacao: "No exemplo, a fábrica passa a envasar polpa em embalagens de 500 g.",
        },
        {
          cena: "novo",
          alvo: "form.nome",
          instrucao: "Informe o nome",
          explicacao: "Como aparece na aba Insumos da OP.",
          dica: "O nome não pode repetir na empresa: aparece “Já existe um insumo com este nome”.",
          preenche: { "form.nome": EMBALAGEM_500.nome },
        },
        {
          cena: "novo",
          alvo: "form.unidade",
          instrucao: "Informe a unidade",
          explicacao: "Em que você conta o insumo na OP: un, kWh, h, kg. Texto livre.",
          preenche: { "form.unidade": EMBALAGEM_500.unidade },
        },
        {
          cena: "novo",
          alvo: "form.custo",
          instrucao: "Informe o custo de uma unidade",
          explicacao: "Em reais, com até 4 casas decimais. A OP multiplica pela quantidade lançada.",
          preenche: { "form.custo": String(EMBALAGEM_500.custoUnitario) },
        },
        {
          cena: "novo",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "O insumo entra na lista, em ordem de nome.",
        },
        {
          cena: "lista",
          alvo: "lista.embalagem",
          instrucao: "Confira na lista",
          explicacao:
            "Já aparece na aba Insumos das OPs abertas. Insumo inativo some dessa lista; as OPs que já o usaram não " +
            "mudam.",
          preenche: { "lista.embalagem": "sim" },
        },
      ],
      eDepois: {
        texto: "Na OP, aba Insumos, escolha o insumo e a quantidade: o custo entra no custo da OP e é rateado entre as polpas.",
        proximoRoteiro: "atualizar-custo-insumo",
      },
    }),
    roteiro({
      id: "atualizar-custo-insumo",
      titulo: "Atualizar o custo de um insumo",
      quandoUsar: "Quando o preço muda: uma conta de luz nova, um reajuste da embalagem ou da diária.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.editar-energia",
          instrucao: "No insumo, clique em “Editar”",
          explicacao: "No exemplo, o kWh subiu de R$ 0,90 para R$ 0,95.",
          preenche: {
            "lista.embalagem": "sim",
            "form.nome": "Energia elétrica",
            "form.unidade": "kWh",
            "form.custo": "0.9",
          },
        },
        {
          cena: "editar",
          alvo: "form.custo",
          instrucao: "Informe o custo novo",
          explicacao: "Os outros campos ficam como estão.",
          preenche: { "form.custo": String(NOVO_CUSTO_ENERGIA) },
        },
        {
          cena: "editar",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "O custo novo aparece na lista.",
        },
        {
          cena: "lista",
          alvo: "lista.custo-energia",
          instrucao: "Confira: vale para as próximas linhas da OP",
          explicacao:
            "Cada linha de insumo grava o custo do momento em que foi lançada. Os 120 kWh da OP-261120-01 continuam a " +
            "R$ 0,90; uma linha lançada agora, mesmo numa OP já aberta, entra a R$ 0,95.",
          preenche: { "lista.custo-energia": String(NOVO_CUSTO_ENERGIA) },
        },
      ],
      eDepois: {
        texto:
          "Para corrigir o custo numa OP aberta, remova a linha do insumo e lance de novo: ela pega o custo atual do " +
          "cadastro.",
      },
    }),
  ],
};
