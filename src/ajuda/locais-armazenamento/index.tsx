"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada, SelectSimulado } from "@/components/ajuda/campos-simulados";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";
import { ROTULOS_TIPO_LOCAL, type TIPO_LOCAL_ARMAZENAMENTO } from "@/lib/schemas/enums";

// Espelho de src/app/(dashboard)/cadastros/locais-armazenamento/page.tsx e de local-dialog-form.tsx. Mudou um rótulo,
// campo ou coluna lá? Ajuste aqui também.

type Tipo = (typeof TIPO_LOCAL_ARMAZENAMENTO)[number];

/**
 * Exemplo: os quatro locais da ajuda do Estoque, com as mesmas capacidades. A loja ganha um freezer para a polpa que
 * vende a varejo. Lista em ordem de nome.
 */
export type LocalExemplo = { nome: string; tipo: Tipo; temperatura: string | null; capacidadeKg: number | null };

export const LOCAIS: readonly LocalExemplo[] = [
  { nome: "Câmara da loja", tipo: "CAMARA_FRIA", temperatura: "-18 °C", capacidadeKg: 1000 },
  { nome: "Câmara de resfriados", tipo: "CAMARA_FRIA", temperatura: "2 a 4 °C", capacidadeKg: 500 },
  { nome: "Câmara fria", tipo: "CAMARA_FRIA", temperatura: "-18 °C", capacidadeKg: 5000 },
  { nome: "Galpão de recepção", tipo: "RECEPCAO", temperatura: null, capacidadeKg: null },
];
export const FREEZER: LocalExemplo = { nome: "Freezer da loja", tipo: "FREEZER", temperatura: "-18 °C", capacidadeKg: 300 };

export const ALVOS = {
  lista: ["lista.novo", "lista.tabela", "lista.freezer", "lista.inativar"],
  novo: ["form.nome", "form.tipo", "form.temperatura", "form.capacidade", "form.salvar"],
} as const;

/** Os locais no ponto do roteiro: `lista.freezer` = "sim" depois de salvo. */
export function locaisDoRoteiro(valores: Valores) {
  const linhas = [...LOCAIS];
  if (valores["lista.freezer"] === "sim") linhas.push(FREEZER);
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Locais de armazenamento</p>
          <p className="text-sm text-muted-foreground">Câmaras, freezers e áreas onde os lotes ficam guardados.</p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo local</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Temperatura</TableHead>
              <TableHead className="text-right">Capacidade (kg)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locaisDoRoteiro(valores).map((l) => {
              const freezer = l.nome === FREEZER.nome;
              return (
                <TableRow key={l.nome}>
                  <TableCell className="font-medium">
                    {freezer ? (
                      <Alvo nome="lista.freezer" className="inline-block px-1">
                        {l.nome}
                      </Alvo>
                    ) : (
                      l.nome
                    )}
                  </TableCell>
                  <TableCell>{ROTULOS_TIPO_LOCAL[l.tipo]}</TableCell>
                  <TableCell>{l.temperatura ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.capacidadeKg === null ? "—" : l.capacidadeKg.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">Ativo</Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <BotaoSimulado variant="outline" size="sm">
                      Editar
                    </BotaoSimulado>
                    <BotaoSimulado alvo={freezer ? "lista.inativar" : undefined} variant="outline" size="sm">
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

function CenaNovo({ valores }: PropsCena) {
  const tipo = (valores["form.tipo"] as Tipo | undefined) ?? "CAMARA_FRIA";
  return (
    <JanelaSimulada titulo="Novo local de armazenamento">
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} placeholder="Câmara fria 01" />
      <SelectSimulado alvo="form.tipo" rotulo="Tipo" valor={ROTULOS_TIPO_LOCAL[tipo]} />
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSimulado alvo="form.temperatura" rotulo="Temperatura" valor={valores["form.temperatura"]} placeholder="-18 °C" />
        <CampoSimulado alvo="form.capacidade" rotulo="Capacidade (kg)" valor={valores["form.capacidade"]} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        A capacidade é opcional e serve para mostrar a ocupação no relatório de estoque.
      </p>
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

const roteiro = construtorDeRoteiros<typeof ALVOS>();

export const ajudaLocaisArmazenamento: DefinicaoAjuda = {
  tituloTela: "Locais de armazenamento",
  resumo:
    "Onde os lotes ficam guardados: câmaras, freezers e a área de recepção. Cada lote está em um local, e o Estoque " +
    "mostra quanto cada local ocupa da capacidade.",
  cenas: { lista: CenaLista, novo: CenaNovo },
  roteiros: [
    roteiro({
      id: "cadastrar-local",
      titulo: "Cadastrar um local",
      quandoUsar: "Quando a filial ganha uma câmara, um freezer ou outra área onde guarda lotes.",
      quemPode:
        "Quem pode: perfis Administrador e Produção, com permissão de alteração na filial. Os demais perfis veem a " +
        "lista, sem os botões.",
      passos: [
        {
          cena: "lista",
          alvo: "lista.novo",
          instrucao: "Clique em “Novo local”",
          explicacao: "O local é da filial. No exemplo, a loja ganhou um freezer para a polpa vendida a varejo.",
        },
        {
          cena: "novo",
          alvo: "form.nome",
          instrucao: "Informe o nome",
          explicacao: "Como aparece na Recepção, na OP, na transferência e no Estoque.",
          dica: "O nome não pode repetir na filial: aparece “Já existe um local com este nome nesta filial”.",
          preenche: { "form.nome": FREEZER.nome },
        },
        {
          cena: "novo",
          alvo: "form.tipo",
          instrucao: "Escolha o tipo",
          explicacao: "Câmara fria, Freezer, Refrigerador, Recepção ou Outro. Serve para identificar o local.",
          preenche: { "form.tipo": FREEZER.tipo },
        },
        {
          cena: "novo",
          alvo: "form.temperatura",
          instrucao: "Informe a temperatura, se quiser",
          explicacao: "Texto livre, só para consulta: “-18 °C”, “2 a 4 °C”.",
          preenche: { "form.temperatura": FREEZER.temperatura ?? "" },
        },
        {
          cena: "novo",
          alvo: "form.capacidade",
          instrucao: "Informe a capacidade, em kg",
          explicacao:
            "Opcional. Com ela, o quadro “Ocupação dos locais” do Estoque mostra quanto do local está ocupado; acima " +
            "de 100% aparece em vermelho. Sem ela, a ocupação fica “—”, como no Galpão de recepção.",
          preenche: { "form.capacidade": String(FREEZER.capacidadeKg) },
        },
        {
          cena: "novo",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "O local entra na lista, em ordem de nome.",
        },
        {
          cena: "lista",
          alvo: "lista.freezer",
          instrucao: "Confira na lista",
          explicacao:
            "O Freezer da loja já pode receber lotes: na Recepção, no destino da polpa da OP e na transferência do " +
            "Estoque.",
          preenche: { "lista.freezer": "sim" },
        },
        {
          cena: "lista",
          alvo: "lista.inativar",
          instrucao: "O local saiu de uso? Esvazie antes de inativar",
          explicacao:
            "“Inativar” não pede confirmação. O local inativo não pode mais receber lotes e sai do quadro de ocupação " +
            "e do filtro de local do Estoque. O botão vira “Reativar”.",
          dica:
            "Com lote com saldo dentro, o Inativar é recusado e a mensagem diz quantos lotes e quantos kg: transfira " +
            "os lotes para outro local (Produção → Estoque) e inative depois.",
        },
      ],
      eDepois: {
        texto:
          "Para mudar a capacidade ou a temperatura, use o “Editar” da linha. Em Produção → Estoque, o quadro " +
          "“Ocupação dos locais” mostra o saldo de cada local.",
      },
    }),
  ],
};
