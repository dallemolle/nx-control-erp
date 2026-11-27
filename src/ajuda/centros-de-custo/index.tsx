"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada, SelectSimulado } from "@/components/ajuda/campos-simulados";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";

// Espelho de src/app/(dashboard)/cadastros/centros-de-custo/page.tsx e de centro-custo-dialog-form.tsx. Mudou um
// rótulo, campo ou coluna lá? Ajuste aqui também.

/**
 * Exemplo: Administração e Lavoura são os centros do Fluxo por dimensão. A Maria cria a Fábrica de polpa e, dentro
 * dela, a Câmara fria; e inativa o Viveiro de mudas, desativado. Lista em ordem de código. Hoje é 21/11/2026.
 */
export type CentroExemplo = { codigo: string; nome: string; pai: string | null };

export const CENTROS: readonly CentroExemplo[] = [
  { codigo: "CC-01", nome: "Administração", pai: null },
  { codigo: "CC-02", nome: "Lavoura", pai: null },
  { codigo: "CC-09", nome: "Viveiro de mudas", pai: null },
];
export const FABRICA: CentroExemplo = { codigo: "CC-03", nome: "Fábrica de polpa", pai: null };
export const CAMARA: CentroExemplo = { codigo: "CC-03.1", nome: "Câmara fria", pai: "Fábrica de polpa" };

export const ALVOS = {
  lista: ["lista.novo", "lista.tabela", "lista.fabrica", "lista.camara", "lista.viveiro", "lista.inativar"],
  novo: ["form.nome", "form.codigo", "form.pai", "form.salvar"],
} as const;

/**
 * Os centros no ponto do roteiro: `lista.fabrica`/`lista.camara` = "sim" depois de salvos; `lista.viveiro` =
 * Ativo/Inativo.
 */
export function centrosDoRoteiro(valores: Valores) {
  const linhas = CENTROS.map((c) => ({ ...c, ativo: c.codigo !== "CC-09" || valores["lista.viveiro"] !== "Inativo" }));
  if (valores["lista.fabrica"] === "sim") linhas.push({ ...FABRICA, ativo: true });
  if (valores["lista.camara"] === "sim") linhas.push({ ...CAMARA, ativo: true });
  return linhas.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

const ALVO_DO_NOME: Readonly<Record<string, string>> = { "CC-03": "lista.fabrica", "CC-03.1": "lista.camara" };

function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Centros de custo</p>
          <p className="text-sm text-muted-foreground">
            Estrutura hierárquica: Empresa → Unidade → Departamento → Centro de custo.
          </p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo centro de custo</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Pai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {centrosDoRoteiro(valores).map((c) => {
              const status = <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>;
              const viveiro = c.codigo === "CC-09";
              const alvoNome = ALVO_DO_NOME[c.codigo];
              return (
                <TableRow key={c.codigo}>
                  <TableCell>{c.codigo}</TableCell>
                  <TableCell className="font-medium">
                    {alvoNome ? (
                      <Alvo nome={alvoNome} className="inline-block px-1">
                        {c.nome}
                      </Alvo>
                    ) : (
                      c.nome
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.pai ?? "—"}</TableCell>
                  <TableCell>
                    {viveiro ? (
                      <Alvo nome="lista.viveiro" className="inline-block px-1">
                        {status}
                      </Alvo>
                    ) : (
                      status
                    )}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <BotaoSimulado variant="outline" size="sm">
                      Editar
                    </BotaoSimulado>
                    <BotaoSimulado alvo={viveiro ? "lista.inativar" : undefined} variant="outline" size="sm">
                      {c.ativo ? "Inativar" : "Reativar"}
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

function CenaNovo({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Novo centro de custo">
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} />
      <CampoSimulado alvo="form.codigo" rotulo="Código" valor={valores["form.codigo"]} />
      <SelectSimulado alvo="form.pai" rotulo="Centro de custo pai" valor={valores["form.pai"] ?? "Nenhum (raiz)"} />
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

const roteiro = construtorDeRoteiros<typeof ALVOS>();
const QUEM_PODE =
  "Quem pode: perfis Administrador, Financeiro e Tesouraria, com permissão de alteração na filial. Os demais perfis " +
  "veem a lista, sem os botões.";

export const ajudaCentrosDeCusto: DefinicaoAjuda = {
  tituloTela: "Centros de custo",
  resumo:
    "As áreas da filial que gastam: administração, lavoura, fábrica. Classificar títulos e lançamentos por centro de " +
    "custo mostra no Fluxo de caixa por dimensão quanto cada área consumiu.",
  cenas: { lista: CenaLista, novo: CenaNovo },
  roteiros: [
    roteiro({
      id: "cadastrar-centro-custo",
      titulo: "Cadastrar um centro de custo",
      quandoUsar: "Quando uma área nova passa a ter despesas que você quer acompanhar separado.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.novo",
          instrucao: "Clique em “Novo centro de custo”",
          explicacao: "O centro é da filial. No exemplo, a fábrica de polpa passa a ter as despesas acompanhadas à parte.",
        },
        {
          cena: "novo",
          alvo: "form.nome",
          instrucao: "Informe o nome",
          explicacao: "Como aparece no título, na Tesouraria e no Fluxo de caixa por dimensão.",
          preenche: { "form.nome": FABRICA.nome },
        },
        {
          cena: "novo",
          alvo: "form.codigo",
          instrucao: "Informe o código",
          explicacao: "Um código curto, que organiza a lista: ela vem em ordem de código.",
          dica: "O código não pode repetir na filial: aparece “Já existe um centro de custo com este código”.",
          preenche: { "form.codigo": FABRICA.codigo },
        },
        {
          cena: "novo",
          alvo: "form.pai",
          instrucao: "Sem pai: é um centro principal",
          explicacao: "Deixe “Nenhum (raiz)” para um centro que não fica dentro de outro.",
        },
        {
          cena: "novo",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "A Fábrica de polpa entra na lista.",
        },
        {
          cena: "lista",
          alvo: "lista.fabrica",
          instrucao: "Agora, um centro dentro dele",
          explicacao: "Para acompanhar a câmara fria separada, crie outro centro com a Fábrica de polpa como pai.",
          preenche: {
            "lista.fabrica": "sim",
            "form.nome": CAMARA.nome,
            "form.codigo": CAMARA.codigo,
          },
        },
        {
          cena: "novo",
          alvo: "form.pai",
          instrucao: "Escolha o centro pai",
          explicacao: "A Câmara fria fica dentro da Fábrica de polpa. Um centro não pode ficar dentro dele mesmo nem de um filho.",
          dica:
            "Hoje o pai só organiza a lista: o Fluxo por dimensão mostra cada centro separado, sem somar os filhos no " +
            "pai.",
          preenche: { "form.pai": FABRICA.nome },
        },
        {
          cena: "novo",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "A coluna Pai mostra a Fábrica de polpa.",
        },
        {
          cena: "lista",
          alvo: "lista.camara",
          instrucao: "Confira na lista",
          explicacao: "CC-03.1 vem logo depois de CC-03: o código ajuda a ver quem está dentro de quem.",
          preenche: { "lista.camara": "sim" },
        },
      ],
      eDepois: {
        texto:
          "Nos títulos e nos lançamentos da Tesouraria, escolha o centro de custo da despesa. O Fluxo de caixa por " +
          "dimensão separa as entradas e saídas por centro.",
        proximoRoteiro: "inativar-centro-custo",
      },
    }),
    roteiro({
      id: "inativar-centro-custo",
      titulo: "Inativar um centro de custo",
      quandoUsar: "Quando a área deixa de existir. Centro de custo não é excluído: é inativado.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.viveiro",
          instrucao: "Ache o centro",
          explicacao: "No exemplo, o viveiro de mudas foi desativado.",
          preenche: { "lista.fabrica": "sim", "lista.camara": "sim" },
        },
        {
          cena: "lista",
          alvo: "lista.inativar",
          instrucao: "Clique em “Inativar”",
          explicacao: "Não pede confirmação: o status muda na hora.",
        },
        {
          cena: "lista",
          alvo: "lista.viveiro",
          instrucao: "Confira o status",
          explicacao:
            "Inativo. O centro some dos títulos e lançamentos novos (Contas a pagar, Contas a receber, Tesouraria e " +
            "Conciliação). No Fluxo por dimensão, continua aparecendo enquanto tiver valores no período: o histórico " +
            "não se perde.",
          dica: "Ao editar um título ou lançamento antigo, o centro aparece como “(inativo)” e pode ficar.",
          preenche: { "lista.viveiro": "Inativo" },
        },
        {
          cena: "lista",
          alvo: "lista.inativar",
          instrucao: "Precisa dele de novo? Clique em “Reativar”",
          explicacao: "O centro volta para os títulos e a Tesouraria.",
        },
      ],
      eDepois: { texto: "Para mudar nome, código ou pai, use o “Editar” da linha: o formulário é o mesmo." },
    }),
  ],
};
