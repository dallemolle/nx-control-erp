"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada, SelectSimulado } from "@/components/ajuda/campos-simulados";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";

// Espelho de src/app/(dashboard)/cadastros/talhoes/page.tsx e de talhao-dialog-form.tsx. Mudou um rótulo, campo ou
// coluna lá? Ajuste aqui também.

/**
 * Exemplo: os três talhões do Relatório de origem; depois de cadastrar o Cupuaçu (ajuda de Frutas), a fazenda registra
 * o cupuaçuzal plantado em 2024. Lista em ordem de nome. Hoje é 21/11/2026.
 */
export type TalhaoExemplo = {
  nome: string;
  fruta: string;
  areaHa: number;
  anoPlantio: number | null;
  espacamento?: string;
};

export const TALHOES: readonly TalhaoExemplo[] = [
  { nome: "Talhão 1 – Terra firme", fruta: "Açaí", areaHa: 2.5, anoPlantio: 2018 },
  { nome: "Talhão 2 – Acerolal", fruta: "Acerola", areaHa: 1.2, anoPlantio: 2021 },
  { nome: "Talhão 3 – Várzea", fruta: "Açaí", areaHa: 4, anoPlantio: null },
];
export const CUPUACUZAL: TalhaoExemplo = {
  nome: "Talhão 4 – Cupuaçuzal",
  fruta: "Cupuaçu",
  areaHa: 1.5,
  anoPlantio: 2024,
  espacamento: "6 x 6 m",
};

export const ALVOS = {
  lista: ["lista.novo", "lista.tabela", "lista.cupuacuzal", "lista.inativar"],
  novo: ["form.nome", "form.cultura", "form.area", "form.ano", "form.espacamento", "form.observacao", "form.salvar"],
} as const;

/** Os talhões no ponto do roteiro: `lista.cupuacuzal` = "sim" depois de salvo. */
export function talhoesDoRoteiro(valores: Valores) {
  const linhas = [...TALHOES];
  if (valores["lista.cupuacuzal"] === "sim") linhas.push(CUPUACUZAL);
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const AREA = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Talhões</p>
          <p className="text-sm text-muted-foreground">Áreas de cultivo próprias da filial. Origem do fruto colhido.</p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo talhão</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cultura</TableHead>
              <TableHead className="text-right">Área (ha)</TableHead>
              <TableHead className="text-right">Plantio</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {talhoesDoRoteiro(valores).map((t) => (
              <TableRow key={t.nome}>
                <TableCell className="font-medium">
                  {t.nome === CUPUACUZAL.nome ? (
                    <Alvo nome="lista.cupuacuzal" className="inline-block px-1">
                      {t.nome}
                    </Alvo>
                  ) : (
                    t.nome
                  )}
                </TableCell>
                <TableCell>{t.fruta}</TableCell>
                <TableCell className="text-right tabular-nums">{AREA.format(t.areaHa)}</TableCell>
                <TableCell className="text-right tabular-nums">{t.anoPlantio ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="default">Ativo</Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <BotaoSimulado variant="outline" size="sm">
                    Editar
                  </BotaoSimulado>
                  <BotaoSimulado
                    alvo={t.nome === CUPUACUZAL.nome ? "lista.inativar" : undefined}
                    variant="outline"
                    size="sm"
                  >
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
  const area = valores["form.area"];
  return (
    <JanelaSimulada titulo="Novo talhão">
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} />
      <SelectSimulado alvo="form.cultura" rotulo="Cultura" valor={valores["form.cultura"] ?? "Selecione a fruta"} />
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSimulado alvo="form.area" rotulo="Área (ha)" valor={area?.replace(".", ",")} />
        <CampoSimulado alvo="form.ano" rotulo="Ano de plantio" valor={valores["form.ano"]} />
      </div>
      <CampoSimulado alvo="form.espacamento" rotulo="Espaçamento" valor={valores["form.espacamento"]} placeholder="5 x 5 m" />
      <CampoSimulado alvo="form.observacao" rotulo="Observação" valor={valores["form.observacao"]} />
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

const roteiro = construtorDeRoteiros<typeof ALVOS>();

export const ajudaTalhoes: DefinicaoAjuda = {
  tituloTela: "Talhões",
  resumo:
    "As áreas de cultivo próprias da filial. Na Recepção, o fruto colhido entra pelo talhão de onde veio, e o Relatório " +
    "de origem mostra quanto cada talhão produziu por hectare.",
  cenas: { lista: CenaLista, novo: CenaNovo },
  roteiros: [
    roteiro({
      id: "cadastrar-talhao",
      titulo: "Cadastrar um talhão",
      quandoUsar: "Quando uma área própria passa a ser colhida: antes da primeira recepção de fruto dela.",
      quemPode:
        "Quem pode: perfis Administrador e Produção, com permissão de alteração na filial. Os demais perfis veem a " +
        "lista, sem os botões.",
      passos: [
        {
          cena: "lista",
          alvo: "lista.novo",
          instrucao: "Clique em “Novo talhão”",
          explicacao: "O talhão é da filial. No exemplo, o cupuaçuzal plantado em 2024 começa a produzir.",
        },
        {
          cena: "novo",
          alvo: "form.nome",
          instrucao: "Informe o nome",
          explicacao: "Como aparece na Recepção e no Relatório de origem. Um número e um apelido ajudam a achar no campo.",
          dica: "O nome não pode repetir na filial: aparece “Já existe um talhão com este nome nesta filial”.",
          preenche: { "form.nome": CUPUACUZAL.nome },
        },
        {
          cena: "novo",
          alvo: "form.cultura",
          instrucao: "Escolha a cultura",
          explicacao:
            "A fruta plantada. Só aparecem frutas ativas: o Cupuaçu foi cadastrado antes, em Cadastros → Frutas. Na " +
            "Recepção, o talhão só aparece para os produtos dessa fruta.",
          preenche: { "form.cultura": CUPUACUZAL.fruta },
        },
        {
          cena: "novo",
          alvo: "form.area",
          instrucao: "Informe a área, em hectares",
          explicacao: "Precisa ser maior que zero. O Relatório de origem divide a colheita pela área (t/ha).",
          preenche: { "form.area": String(CUPUACUZAL.areaHa) },
        },
        {
          cena: "novo",
          alvo: "form.ano",
          instrucao: "Informe o ano de plantio, se souber",
          explicacao: "Opcional. A partir de 1950, e não pode ser um ano futuro.",
          preenche: { "form.ano": String(CUPUACUZAL.anoPlantio) },
        },
        {
          cena: "novo",
          alvo: "form.espacamento",
          instrucao: "Espaçamento e observação são opcionais",
          explicacao: "Texto livre, só para consulta.",
          preenche: { "form.espacamento": CUPUACUZAL.espacamento ?? "" },
        },
        {
          cena: "novo",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "O talhão entra na lista, em ordem de nome.",
        },
        {
          cena: "lista",
          alvo: "lista.cupuacuzal",
          instrucao: "Confira na lista",
          explicacao: "Já pode ser escolhido na recepção da colheita própria de cupuaçu.",
          preenche: { "lista.cupuacuzal": "sim" },
        },
        {
          cena: "lista",
          alvo: "lista.inativar",
          instrucao: "A área deixou de ser colhida? Use “Inativar”",
          explicacao:
            "Não pede confirmação. O talhão inativo sai da Recepção; no Relatório de origem, continua aparecendo " +
            "enquanto tiver colheita no período ou no ano. O botão vira “Reativar”.",
        },
      ],
      eDepois: {
        texto:
          "Na Recepção, escolha a origem Própria e o talhão: o lote entra pelo custo-padrão da fruta. O Relatório de " +
          "origem mostra a colheita e a produtividade de cada talhão.",
      },
    }),
  ],
};
