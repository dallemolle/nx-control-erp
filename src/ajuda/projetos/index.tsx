"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada, SelectSimulado } from "@/components/ajuda/campos-simulados";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";
import { ROTULOS_STATUS_SAFRA_PROJETO, type STATUS_SAFRA_PROJETO } from "@/lib/schemas/enums";

// Espelho de src/app/(dashboard)/cadastros/projetos/page.tsx e de projeto-dialog-form.tsx. Mudou um rótulo, campo ou
// coluna lá? Ajuste aqui também.

type Status = (typeof STATUS_SAFRA_PROJETO)[number];

/**
 * Exemplo: a reforma do galpão já terminou; a Maria cadastra a construção da câmara fria, que começou agora. A câmara,
 * depois de pronta, vira o centro de custo CC-03.1 (ajuda de Centros de custo): o projeto é a obra, com começo e fim.
 * Lista em ordem de código.
 */
export type ProjetoExemplo = { codigo: string; nome: string; status: Status };

export const PROJETOS: readonly ProjetoExemplo[] = [{ codigo: "PRJ-01", nome: "Reforma do galpão", status: "ENCERRADO" }];
export const CAMARA: ProjetoExemplo = { codigo: "PRJ-02", nome: "Construção da câmara fria", status: "EM_ANDAMENTO" };

export const ALVOS = {
  lista: ["lista.novo", "lista.tabela", "lista.camara"],
  novo: ["form.nome", "form.codigo", "form.status", "form.salvar"],
} as const;

/** Os projetos no ponto do roteiro: `lista.camara` = "sim" depois de salvo. */
export function projetosDoRoteiro(valores: Valores) {
  const linhas = [...PROJETOS];
  if (valores["lista.camara"] === "sim") linhas.push(CAMARA);
  return linhas.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Projetos</p>
          <p className="text-sm text-muted-foreground">Cadastro de projetos da filial.</p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo projeto</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projetosDoRoteiro(valores).map((p) => (
              <TableRow key={p.codigo}>
                <TableCell>{p.codigo}</TableCell>
                <TableCell className="font-medium">
                  {p.codigo === CAMARA.codigo ? (
                    <Alvo nome="lista.camara" className="inline-block px-1">
                      {p.nome}
                    </Alvo>
                  ) : (
                    p.nome
                  )}
                </TableCell>
                <TableCell>{ROTULOS_STATUS_SAFRA_PROJETO[p.status]}</TableCell>
                <TableCell>
                  <Badge variant="default">Ativo</Badge>
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
  const status = valores["form.status"] as Status | undefined;
  return (
    <JanelaSimulada titulo="Novo projeto">
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} />
      <CampoSimulado alvo="form.codigo" rotulo="Código" valor={valores["form.codigo"]} />
      <SelectSimulado alvo="form.status" rotulo="Status" valor={ROTULOS_STATUS_SAFRA_PROJETO[status ?? "PLANEJADO"]} />
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

const roteiro = construtorDeRoteiros<typeof ALVOS>();

export const ajudaProjetos: DefinicaoAjuda = {
  tituloTela: "Projetos",
  resumo:
    "Obras e iniciativas com começo e fim, como uma reforma ou uma irrigação. Marcar títulos e lançamentos com o " +
    "projeto mostra no Fluxo de caixa por dimensão quanto ele já custou.",
  cenas: { lista: CenaLista, novo: CenaNovo },
  roteiros: [
    roteiro({
      id: "cadastrar-projeto",
      titulo: "Cadastrar um projeto",
      quandoUsar: "Quando começa uma obra ou iniciativa cujo gasto você quer acompanhar separado.",
      quemPode:
        "Quem pode: perfis Administrador, Financeiro e Tesouraria, com permissão de alteração na filial. Os demais " +
        "perfis veem a lista, sem os botões.",
      passos: [
        {
          cena: "lista",
          alvo: "lista.novo",
          instrucao: "Clique em “Novo projeto”",
          explicacao: "O projeto é da filial. No exemplo, começou a construção da câmara fria.",
        },
        {
          cena: "novo",
          alvo: "form.nome",
          instrucao: "Informe o nome",
          explicacao: "Como aparece no título, na Tesouraria e no Fluxo de caixa por dimensão.",
          preenche: { "form.nome": CAMARA.nome },
        },
        {
          cena: "novo",
          alvo: "form.codigo",
          instrucao: "Informe o código",
          explicacao: "Um código curto, que organiza a lista: ela vem em ordem de código.",
          dica: "O código não pode repetir na filial: aparece “Já existe um projeto com este código”.",
          preenche: { "form.codigo": CAMARA.codigo },
        },
        {
          cena: "novo",
          alvo: "form.status",
          instrucao: "Escolha o status",
          explicacao:
            "Planejado, Em andamento ou Encerrado: só informa a fase. Um projeto Encerrado continua aceitando títulos " +
            "e lançamentos.",
          preenche: { "form.status": CAMARA.status },
        },
        {
          cena: "novo",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "O projeto entra na lista.",
        },
        {
          cena: "lista",
          alvo: "lista.camara",
          instrucao: "Confira na lista",
          explicacao:
            "O PRJ-02 já aparece para escolher nos títulos, na Tesouraria e na Conciliação. Quando a obra terminar, " +
            "use o “Editar” da linha para mudar o status para Encerrado.",
          dica:
            "Inativar tira o projeto dos títulos e lançamentos novos (no Fluxo por dimensão, continua aparecendo " +
            "enquanto tiver valores no período). Nos antigos, ele aparece como “(inativo)” e pode ficar.",
          preenche: { "lista.camara": "sim" },
        },
      ],
      eDepois: {
        texto:
          "Nos títulos e nos lançamentos da obra, escolha o projeto. No Fluxo de caixa por dimensão, escolha a dimensão " +
          "Projeto para ver quanto entrou e saiu em cada um.",
      },
    }),
  ],
};
