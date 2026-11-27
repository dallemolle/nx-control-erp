"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada } from "@/components/ajuda/campos-simulados";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";

// Espelho de src/app/(dashboard)/cadastros/centros-de-lucro/page.tsx e de centro-lucro-dialog-form.tsx. Mudou um
// rótulo, campo ou coluna lá? Ajuste aqui também.

/** Exemplo: a filial separa as receitas da polpa e do fruto in natura; a Maria cria a Loja. Hoje é 21/11/2026. */
export const CENTROS = [
  { codigo: "CL-01", nome: "Polpa" },
  { codigo: "CL-02", nome: "Fruto in natura" },
] as const;
export const LOJA = { codigo: "CL-03", nome: "Loja" } as const;

export const ALVOS = {
  lista: ["lista.novo", "lista.tabela", "lista.loja"],
  novo: ["form.nome", "form.codigo", "form.salvar"],
} as const;

/** Os centros no ponto do roteiro (`lista.loja` = "sim" depois de salvo), em ordem de código. */
export function centrosDoRoteiro(valores: Valores): { codigo: string; nome: string }[] {
  return valores["lista.loja"] === "sim" ? [...CENTROS, LOJA] : [...CENTROS];
}

function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Centros de lucro</p>
          <p className="text-sm text-muted-foreground">Cadastro de centros de lucro da filial.</p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo centro de lucro</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {centrosDoRoteiro(valores).map((c) => (
              <TableRow key={c.codigo}>
                <TableCell>{c.codigo}</TableCell>
                <TableCell className="font-medium">
                  {c.codigo === LOJA.codigo ? (
                    <Alvo nome="lista.loja" className="inline-block px-1">
                      {c.nome}
                    </Alvo>
                  ) : (
                    c.nome
                  )}
                </TableCell>
                <TableCell>
                  <Badge>Ativo</Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <BotaoSimulado variant="outline" size="sm">
                    Editar
                  </BotaoSimulado>
                  <BotaoSimulado variant="outline" size="sm">
                    Inativar
                  </BotaoSimulado>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Alvo>
    </div>
  );
}

function CenaNovo({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Novo centro de lucro">
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} />
      <CampoSimulado alvo="form.codigo" rotulo="Código" valor={valores["form.codigo"]} />
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

const roteiro = construtorDeRoteiros<typeof ALVOS>();

export const ajudaCentrosDeLucro: DefinicaoAjuda = {
  tituloTela: "Centros de lucro",
  resumo:
    "As frentes que geram receita na filial: polpa, fruto in natura, loja. Classificar títulos e lançamentos por " +
    "centro de lucro mostra no Fluxo de caixa por dimensão quanto cada frente trouxe.",
  cenas: { lista: CenaLista, novo: CenaNovo },
  roteiros: [
    roteiro({
      id: "cadastrar-centro-lucro",
      titulo: "Cadastrar um centro de lucro",
      quandoUsar: "Quando uma frente nova passa a vender e você quer acompanhar as receitas dela à parte.",
      quemPode:
        "Quem pode: perfis Administrador, Financeiro e Tesouraria, com permissão de alteração na filial. Os demais " +
        "perfis veem a lista, sem os botões.",
      passos: [
        {
          cena: "lista",
          alvo: "lista.novo",
          instrucao: "Clique em “Novo centro de lucro”",
          explicacao: "O centro é da filial. No exemplo, a loja passa a ter as receitas acompanhadas à parte.",
        },
        {
          cena: "novo",
          alvo: "form.nome",
          instrucao: "Informe o nome",
          explicacao: "Como aparece no título, na Tesouraria e no Fluxo de caixa por dimensão.",
          preenche: { "form.nome": LOJA.nome },
        },
        {
          cena: "novo",
          alvo: "form.codigo",
          instrucao: "Informe o código",
          explicacao: "Um código curto; a lista vem em ordem de código.",
          dica: "O código não pode repetir na filial: aparece “Já existe um centro de lucro com este código”.",
          preenche: { "form.codigo": LOJA.codigo },
        },
        {
          cena: "novo",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "Centro de lucro não tem pai: todos ficam no mesmo nível.",
        },
        {
          cena: "lista",
          alvo: "lista.loja",
          instrucao: "Confira na lista",
          explicacao:
            "Para tirar um centro de uso, clique em “Inativar”: ele some dos títulos e lançamentos novos, e o " +
            "histórico continua no Fluxo por dimensão. Nos antigos, aparece como “(inativo)” e pode ficar.",
          preenche: { "lista.loja": "sim" },
        },
      ],
      eDepois: {
        texto:
          "Nos títulos a receber e nos lançamentos da Tesouraria, escolha o centro de lucro da receita. O Fluxo de " +
          "caixa por dimensão separa as entradas e saídas por centro.",
      },
    }),
  ],
};
