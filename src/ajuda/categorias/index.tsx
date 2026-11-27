"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada, SelectSimulado } from "@/components/ajuda/campos-simulados";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";

// Espelho de src/app/(dashboard)/cadastros/categorias/page.tsx e de categoria-financeira-dialog-form.tsx. Mudou um
// rótulo, campo ou coluna lá? Ajuste aqui também.

/**
 * Exemplo: as categorias da filial nas ajudas do Financeiro e do Orçamento, em ordem de nome. A Maria cadastra
 * “Taxas de cartão” (a categoria da taxa da Operadora de cartão) dentro de “Despesas bancárias” e inativa “Venda de
 * bens usados”, usada uma vez só, na venda do trator — por isso ela não está no Orçamento. Hoje é 21/11/2026.
 */
export type CategoriaExemplo = { nome: string; tipo: "Receita" | "Despesa"; pai: string | null };

export const CATEGORIAS: readonly CategoriaExemplo[] = [
  { nome: "Despesas bancárias", tipo: "Despesa", pai: null },
  { nome: "Energia elétrica", tipo: "Despesa", pai: null },
  { nome: "Insumos Agrícolas", tipo: "Despesa", pai: null },
  { nome: "Mão de obra temporária", tipo: "Despesa", pai: null },
  { nome: "Venda de bens usados", tipo: "Receita", pai: null },
  { nome: "Venda de produtos", tipo: "Receita", pai: null },
];
export const TAXAS: CategoriaExemplo = { nome: "Taxas de cartão", tipo: "Despesa", pai: "Despesas bancárias" };
export const INATIVADA = "Venda de bens usados";

export const ALVOS = {
  lista: ["lista.nova", "lista.tabela", "lista.taxas", "lista.bensUsados", "lista.inativar"],
  nova: ["form.nome", "form.tipo", "form.pai", "form.naoOperacional", "form.salvar"],
} as const;

/** As categorias no ponto do roteiro: `lista.taxas` = "sim" depois de salva; `lista.bensUsados` = Ativo/Inativo. */
export function categoriasDoRoteiro(valores: Valores) {
  const linhas = CATEGORIAS.map((c) => ({ ...c, ativo: c.nome !== INATIVADA || valores["lista.bensUsados"] !== "Inativo" }));
  if (valores["lista.taxas"] === "sim") linhas.push({ ...TAXAS, ativo: true });
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Categorias financeiras</p>
          <p className="text-sm text-muted-foreground">Estrutura hierárquica de receitas e despesas.</p>
        </div>
        <BotaoSimulado alvo="lista.nova">Nova categoria financeira</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Pai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoriasDoRoteiro(valores).map((c) => {
              const status = <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>;
              const bensUsados = c.nome === INATIVADA;
              return (
                <TableRow key={c.nome}>
                  <TableCell className="font-medium">
                    {c.nome === TAXAS.nome ? (
                      <Alvo nome="lista.taxas" className="inline-block px-1">
                        {c.nome}
                      </Alvo>
                    ) : (
                      c.nome
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.tipo === "Receita" ? "default" : "secondary"}>{c.tipo}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.pai ?? "—"}</TableCell>
                  <TableCell>
                    {bensUsados ? (
                      <Alvo nome="lista.bensUsados" className="inline-block px-1">
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
                    <BotaoSimulado alvo={bensUsados ? "lista.inativar" : undefined} variant="outline" size="sm">
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

function CenaNova({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Nova categoria financeira">
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} />
      <SelectSimulado alvo="form.tipo" rotulo="Tipo" valor={valores["form.tipo"] ?? "Receita"} />
      <SelectSimulado alvo="form.pai" rotulo="Categoria pai" valor={valores["form.pai"] ?? "Nenhuma (raiz)"} />
      <Alvo nome="form.naoOperacional" className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled checked={valores["form.naoOperacional"] === "sim"} className="size-4" readOnly />
          Não operacional
        </label>
        <p className="text-xs text-muted-foreground">
          Empréstimos, aportes de sócio e amortização de dívida. Ficam fora da receita e do custo do Fluxo de caixa
          estratégico.
        </p>
      </Alvo>
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

export const ajudaCategorias: DefinicaoAjuda = {
  tituloTela: "Categorias financeiras",
  resumo:
    "O plano de contas da filial: cada título, lançamento e linha do Orçamento é de uma categoria de receita ou de " +
    "despesa.",
  cenas: { lista: CenaLista, nova: CenaNova },
  roteiros: [
    roteiro({
      id: "cadastrar-categoria",
      titulo: "Cadastrar uma categoria",
      quandoUsar: "Quando surge um tipo de receita ou despesa que nenhuma categoria cobre.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.nova",
          instrucao: "Clique em “Nova categoria financeira”",
          explicacao:
            "A categoria é da filial. No exemplo, a taxa da maquininha precisa de uma categoria de despesa própria.",
        },
        {
          cena: "nova",
          alvo: "form.nome",
          instrucao: "Informe o nome",
          explicacao: "Como aparece no título, na Tesouraria, no Orçamento e nos relatórios.",
          preenche: { "form.nome": TAXAS.nome },
        },
        {
          cena: "nova",
          alvo: "form.tipo",
          instrucao: "Escolha o tipo “Despesa”",
          explicacao:
            "Receita para o que entra, Despesa para o que sai. A Operadora de cartão só aceita categoria de despesa " +
            "para a taxa, e o Orçamento avisa quando a despesa passa do orçado.",
          preenche: { "form.tipo": TAXAS.tipo },
        },
        {
          cena: "nova",
          alvo: "form.pai",
          instrucao: "Escolha a categoria pai, se quiser",
          explicacao:
            "Opcional: põe a categoria dentro de outra, para organizar a lista. No exemplo, dentro de “Despesas " +
            "bancárias”.",
          dica:
            "Hoje o pai só aparece na lista: os relatórios e o Orçamento mostram cada categoria separada, sem somar as " +
            "filhas no pai.",
          preenche: { "form.pai": TAXAS.pai! },
        },
        {
          cena: "nova",
          alvo: "form.naoOperacional",
          instrucao: "Deixe “Não operacional” desmarcado",
          explicacao:
            "Taxa de cartão é custo da operação. Marque só as categorias de empréstimo recebido, aporte de sócio e " +
            "amortização de dívida: elas ficam fora da receita e do custo do Fluxo de caixa estratégico, que projeta " +
            "a operação. O resto do sistema (Tesouraria, fluxos, Orçamento) continua mostrando esses lançamentos.",
        },
        {
          cena: "nova",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "Se faltar o nome, a mensagem aparece acima do botão.",
        },
        {
          cena: "lista",
          alvo: "lista.taxas",
          instrucao: "Confira na lista",
          explicacao: "A coluna Pai mostra “Despesas bancárias”. A categoria já aparece no Orçamento e nos títulos.",
          preenche: { "lista.taxas": "sim" },
        },
      ],
      eDepois: {
        texto:
          "Em Cadastros → Operadoras de cartão, escolha “Taxas de cartão” como categoria da taxa: a conta a pagar de " +
          "cada venda no cartão sai nessa categoria.",
        proximoRoteiro: "inativar-categoria",
      },
    }),
    roteiro({
      id: "inativar-categoria",
      titulo: "Inativar uma categoria",
      quandoUsar: "Quando uma categoria não vai mais ser usada. Categoria não é excluída: é inativada.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.bensUsados",
          instrucao: "Ache a categoria",
          explicacao: "No exemplo, “Venda de bens usados” serviu só para a venda do trator usado.",
          preenche: { "lista.taxas": "sim" },
        },
        {
          cena: "lista",
          alvo: "lista.inativar",
          instrucao: "Clique em “Inativar”",
          explicacao: "Não pede confirmação: o status muda na hora.",
        },
        {
          cena: "lista",
          alvo: "lista.bensUsados",
          instrucao: "Confira o status",
          explicacao:
            "Inativo. A categoria some do Orçamento e não pode mais ser a categoria da taxa de uma operadora. O título " +
            "do trator continua com ela, e os relatórios também.",
          dica:
            "Hoje o Contas a pagar, o Contas a receber e a Tesouraria ainda oferecem a categoria inativa: escolha outra.",
          preenche: { "lista.bensUsados": "Inativo" },
        },
        {
          cena: "lista",
          alvo: "lista.inativar",
          instrucao: "Precisa dela de novo? Clique em “Reativar”",
          explicacao: "A categoria volta para o Orçamento, com os valores orçados como estavam.",
        },
      ],
      eDepois: { texto: "Para mudar nome, tipo ou pai, use o “Editar” da linha: o formulário é o mesmo." },
    }),
  ],
};
