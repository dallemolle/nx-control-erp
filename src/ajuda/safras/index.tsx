"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada, SelectSimulado } from "@/components/ajuda/campos-simulados";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";
import { ROTULOS_STATUS_SAFRA_PROJETO, type STATUS_SAFRA_PROJETO } from "@/lib/schemas/enums";

// Espelho de src/app/(dashboard)/cadastros/safras/page.tsx e de safra-dialog-form.tsx. Mudou um rótulo, campo ou
// coluna lá? Ajuste aqui também.

type Status = (typeof STATUS_SAFRA_PROJETO)[number];

/**
 * Exemplo: as safras da Comparação entre safras e do Fluxo por dimensão. Cada safra vai de dezembro a novembro, então
 * atravessa a virada do ano. Hoje é 21/11/2026: a 2025/26 termina no fim do mês, e a Maria cadastra a 2026/27, que
 * começa em dezembro. Lista em ordem de nome.
 */
export type SafraExemplo = { nome: string; inicio: string; fim: string; status: Status };

export const SAFRAS: readonly SafraExemplo[] = [
  { nome: "2024/25", inicio: "2024-12-01", fim: "2025-11-30", status: "ENCERRADO" },
  { nome: "2025/26", inicio: "2025-12-01", fim: "2026-11-30", status: "EM_ANDAMENTO" },
];
export const NOVA: SafraExemplo = { nome: "2026/27", inicio: "2026-12-01", fim: "2027-11-30", status: "PLANEJADO" };

export const ALVOS = {
  lista: ["lista.nova", "lista.tabela", "lista.nova-safra", "lista.status-atual", "lista.editar-atual", "lista.inativar"],
  nova: ["form.nome", "form.inicio", "form.fim", "form.status", "form.salvar"],
  editar: ["form.nome", "form.inicio", "form.fim", "form.status", "form.salvar"],
} as const;

/** As safras no ponto do roteiro: `lista.nova-safra` = "sim" depois de salva; `lista.status-atual` = status da 2025/26. */
export function safrasDoRoteiro(valores: Valores) {
  const linhas = SAFRAS.map((s) =>
    s.nome === "2025/26" && valores["lista.status-atual"] ? { ...s, status: valores["lista.status-atual"] as Status } : s,
  );
  if (valores["lista.nova-safra"] === "sim") linhas.push(NOVA);
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome));
}

function formatarData(iso: string): string {
  return iso.split("-").reverse().join("/");
}

function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Safras</p>
          <p className="text-sm text-muted-foreground">Cadastro de safras da filial.</p>
        </div>
        <BotaoSimulado alvo="lista.nova">Nova safra</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {safrasDoRoteiro(valores).map((s) => {
              const nova = s.nome === NOVA.nome;
              const atual = s.nome === "2025/26";
              const antiga = s.nome === "2024/25";
              const status = ROTULOS_STATUS_SAFRA_PROJETO[s.status];
              return (
                <TableRow key={s.nome}>
                  <TableCell className="font-medium">
                    {nova ? (
                      <Alvo nome="lista.nova-safra" className="inline-block px-1">
                        {s.nome}
                      </Alvo>
                    ) : (
                      s.nome
                    )}
                  </TableCell>
                  <TableCell>{formatarData(s.inicio)}</TableCell>
                  <TableCell>{formatarData(s.fim)}</TableCell>
                  <TableCell>
                    {atual ? (
                      <Alvo nome="lista.status-atual" className="inline-block px-1">
                        {status}
                      </Alvo>
                    ) : (
                      status
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">Ativo</Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <BotaoSimulado alvo={atual ? "lista.editar-atual" : undefined} variant="outline" size="sm">
                      Editar
                    </BotaoSimulado>
                    <BotaoSimulado alvo={antiga ? "lista.inativar" : undefined} variant="outline" size="sm">
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
  const inicio = valores["form.inicio"];
  const fim = valores["form.fim"];
  const status = valores["form.status"] as Status | undefined;
  return (
    <JanelaSimulada titulo={titulo}>
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} />
      <CampoSimulado alvo="form.inicio" rotulo="Início" valor={inicio ? formatarData(inicio) : undefined} placeholder="dd/mm/aaaa" />
      <CampoSimulado alvo="form.fim" rotulo="Fim" valor={fim ? formatarData(fim) : undefined} placeholder="dd/mm/aaaa" />
      <SelectSimulado alvo="form.status" rotulo="Status" valor={ROTULOS_STATUS_SAFRA_PROJETO[status ?? "PLANEJADO"]} />
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

const CenaNova = (props: PropsCena) => <Formulario {...props} titulo="Nova safra" />;
const CenaEditar = (props: PropsCena) => <Formulario {...props} titulo="Editar safra" />;

const ATUAL = SAFRAS[1];
const roteiro = construtorDeRoteiros<typeof ALVOS>();
const QUEM_PODE =
  "Quem pode: perfis Administrador, Financeiro e Tesouraria, com permissão de alteração na filial. Os demais perfis " +
  "veem a lista, sem os botões.";

export const ajudaSafras: DefinicaoAjuda = {
  tituloTela: "Safras",
  resumo:
    "Os ciclos de produção da filial. Marcar títulos, lançamentos e recepções com a safra mostra quanto cada uma " +
    "gastou e rendeu, na Comparação entre safras e no Fluxo de caixa por dimensão.",
  cenas: { lista: CenaLista, nova: CenaNova, editar: CenaEditar },
  roteiros: [
    roteiro({
      id: "cadastrar-safra",
      titulo: "Cadastrar uma safra",
      quandoUsar: "Antes de começar a próxima safra, para já marcar nela as compras e os gastos de preparo.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.nova",
          instrucao: "Clique em “Nova safra”",
          explicacao: "A safra é da filial. No exemplo, a 2025/26 termina no fim de novembro e a 2026/27 começa em dezembro.",
        },
        {
          cena: "nova",
          alvo: "form.nome",
          instrucao: "Informe o nome",
          explicacao: "Como aparece no título, na Recepção e nos relatórios. A lista vem em ordem de nome.",
          dica: "O nome não pode repetir na filial: aparece “Já existe uma safra com este nome nesta filial”.",
          preenche: { "form.nome": NOVA.nome },
        },
        {
          cena: "nova",
          alvo: "form.inicio",
          instrucao: "Informe o início",
          explicacao: "O primeiro dia do ciclo.",
          preenche: { "form.inicio": NOVA.inicio },
        },
        {
          cena: "nova",
          alvo: "form.fim",
          instrucao: "Informe o fim",
          explicacao: "Pode cair no ano seguinte: a safra atravessa a virada do ano.",
          dica: "O fim precisa ser depois do início, senão aparece “Data de fim deve ser posterior à data de início”.",
          preenche: { "form.fim": NOVA.fim },
        },
        {
          cena: "nova",
          alvo: "form.status",
          instrucao: "Deixe o status em Planejado",
          explicacao:
            "Planejado, Em andamento ou Encerrado: mostra em que fase a safra está, aqui e na Comparação entre safras.",
          preenche: { "form.status": NOVA.status },
        },
        {
          cena: "nova",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "A 2026/27 entra na lista.",
        },
        {
          cena: "lista",
          alvo: "lista.nova-safra",
          instrucao: "Confira na lista",
          explicacao:
            "A safra já aparece para escolher nos títulos, na Tesouraria, na Conciliação e na Recepção, e ganha uma " +
            "linha na Comparação entre safras.",
          dica:
            "As datas não limitam o que entra na safra: uma compra de adubo de outubro pode ser marcada na 2026/27, e " +
            "conta para ela.",
          preenche: { "lista.nova-safra": "sim" },
        },
      ],
      eDepois: {
        texto:
          "Em Controladoria → Comparação entre safras, informe o orçado da safra. Nos títulos, nos lançamentos e nas " +
          "recepções, escolha a safra para o valor contar para ela.",
        proximoRoteiro: "encerrar-safra",
      },
    }),
    roteiro({
      id: "encerrar-safra",
      titulo: "Encerrar ou inativar uma safra",
      quandoUsar: "Quando a colheita termina, ou quando uma safra não deve mais aparecer.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.editar-atual",
          instrucao: "Na safra que terminou, clique em “Editar”",
          explicacao: "No exemplo, a 2025/26 termina em 30/11/2026.",
          preenche: {
            "lista.nova-safra": "sim",
            "form.nome": ATUAL.nome,
            "form.inicio": ATUAL.inicio,
            "form.fim": ATUAL.fim,
            "form.status": ATUAL.status,
          },
        },
        {
          cena: "editar",
          alvo: "form.status",
          instrucao: "Mude o status para Encerrado",
          explicacao: "Os outros campos ficam como estão.",
          preenche: { "form.status": "ENCERRADO" },
        },
        {
          cena: "editar",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "O novo status aparece na lista e na Comparação entre safras.",
        },
        {
          cena: "lista",
          alvo: "lista.status-atual",
          instrucao: "Confira o status",
          explicacao:
            "Encerrada, a safra sai da lista da Recepção: fruto novo não entra mais nela. Títulos e lançamentos ainda " +
            "aceitam, por exemplo uma venda que chega depois; nas listas deles ela aparece no fim, com “(encerrada)”.",
          preenche: { "lista.status-atual": "ENCERRADO" },
        },
        {
          cena: "lista",
          alvo: "lista.inativar",
          instrucao: "Para tirar a safra de uso, clique em “Inativar”",
          explicacao:
            "Não pede confirmação. A safra inativa sai da Recepção, dos títulos e lançamentos novos (Contas a pagar, " +
            "Contas a receber, Tesouraria e Conciliação) e da Comparação entre safras, mesmo tendo valores. No Fluxo " +
            "por dimensão, continua aparecendo enquanto tiver valores no período. O botão vira “Reativar”.",
          dica: "Ao editar um título ou lançamento antigo, a safra aparece como “(inativa)” e pode ficar.",
        },
      ],
      eDepois: {
        texto:
          "Inative só a safra que não deve mais aparecer na Comparação entre safras: para registrar que a colheita " +
          "terminou, basta o status Encerrado.",
      },
    }),
  ],
};
