"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada } from "@/components/ajuda/campos-simulados";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";

// Espelho de src/app/(dashboard)/cadastros/frutas/page.tsx e de fruta-dialog-form.tsx. Mudou um rótulo, campo ou
// coluna lá? Ajuste aqui também.

/**
 * Exemplo: o Açaí e a Acerola das ajudas de Produção (o açaí entra na Recepção a R$ 4,00/kg). Em 21/11/2026 a fazenda
 * começa a trabalhar cupuaçu, ainda sem custo conhecido, e o custo do açaí próprio sobe para R$ 4,20. Lista em ordem
 * de nome.
 */
export type FrutaExemplo = { nome: string; custoPadraoKg: number; exigeBranqueamento: boolean };

export const FRUTAS: readonly FrutaExemplo[] = [
  { nome: "Açaí", custoPadraoKg: 4, exigeBranqueamento: true },
  { nome: "Acerola", custoPadraoKg: 2.5, exigeBranqueamento: false },
];
export const CUPUACU: FrutaExemplo = { nome: "Cupuaçu", custoPadraoKg: 0, exigeBranqueamento: false };
export const NOVO_CUSTO_ACAI = 4.2;

export const ALVOS = {
  lista: ["lista.nova", "lista.tabela", "lista.cupuacu", "lista.custo-acai", "lista.editar-acai", "lista.inativar"],
  nova: ["form.nome", "form.custo", "form.branqueamento", "form.salvar"],
  editar: ["form.nome", "form.custo", "form.branqueamento", "form.salvar"],
} as const;

/** As frutas no ponto do roteiro: `lista.cupuacu` = "sim" depois de salva; `lista.custo-acai` = custo novo do açaí. */
export function frutasDoRoteiro(valores: Valores) {
  const custoAcai = valores["lista.custo-acai"];
  const linhas = FRUTAS.map((f) => (f.nome === "Açaí" && custoAcai ? { ...f, custoPadraoKg: Number(custoAcai) } : f));
  if (valores["lista.cupuacu"] === "sim") linhas.push(CUPUACU);
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Frutas</p>
          <p className="text-sm text-muted-foreground">
            Frutas trabalhadas pela empresa. O custo-padrão é usado no fruto colhido nos talhões próprios.
          </p>
        </div>
        <BotaoSimulado alvo="lista.nova">Nova fruta</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="text-right">Custo-padrão (R$/kg)</TableHead>
              <TableHead>Branqueamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {frutasDoRoteiro(valores).map((f) => {
              const acai = f.nome === "Açaí";
              const custo = formatarMoeda(f.custoPadraoKg);
              return (
                <TableRow key={f.nome}>
                  <TableCell className="font-medium">
                    {f.nome === CUPUACU.nome ? (
                      <Alvo nome="lista.cupuacu" className="inline-block px-1">
                        {f.nome}
                      </Alvo>
                    ) : (
                      f.nome
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {acai ? (
                      <Alvo nome="lista.custo-acai" className="inline-block px-1">
                        {custo}
                      </Alvo>
                    ) : (
                      custo
                    )}
                  </TableCell>
                  <TableCell>{f.exigeBranqueamento ? "Exige" : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="default">Ativo</Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <BotaoSimulado alvo={acai ? "lista.editar-acai" : undefined} variant="outline" size="sm">
                      Editar
                    </BotaoSimulado>
                    <BotaoSimulado alvo={f.nome === "Acerola" ? "lista.inativar" : undefined} variant="outline" size="sm">
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
  const custo = valores["form.custo"];
  const marcado = valores["form.branqueamento"] === "sim";
  return (
    <JanelaSimulada titulo={titulo}>
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} />
      <div className="space-y-1">
        <CampoSimulado
          alvo="form.custo"
          rotulo="Custo-padrão do fruto próprio (R$/kg)"
          valor={custo === undefined ? "0" : custo.replace(".", ",")}
        />
        <p className="text-xs text-muted-foreground">
          Usado no custo e na margem do fruto colhido nos talhões próprios. Deixe 0 se ainda não souber.
        </p>
      </div>
      <Alvo nome="form.branqueamento" className="flex items-center gap-2 px-1 text-sm">
        <span aria-hidden className="flex size-4 items-center justify-center rounded border text-[10px]">
          {marcado ? "✓" : ""}
        </span>
        Exige branqueamento no processamento
      </Alvo>
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

const CenaNova = (props: PropsCena) => <Formulario {...props} titulo="Nova fruta" />;
const CenaEditar = (props: PropsCena) => <Formulario {...props} titulo="Editar fruta" />;

const roteiro = construtorDeRoteiros<typeof ALVOS>();
const QUEM_PODE =
  "Quem pode: perfis Administrador e Produção, com permissão de alteração na filial. Os demais perfis veem a lista, " +
  "sem os botões. A fruta é da empresa: vale para todas as filiais.";

export const ajudaFrutas: DefinicaoAjuda = {
  tituloTela: "Frutas",
  resumo:
    "As frutas que a empresa trabalha. Cada produto e cada talhão é de uma fruta, e o custo-padrão dá o custo do fruto " +
    "colhido nos talhões próprios.",
  cenas: { lista: CenaLista, nova: CenaNova, editar: CenaEditar },
  roteiros: [
    roteiro({
      id: "cadastrar-fruta",
      titulo: "Cadastrar uma fruta",
      quandoUsar: "Antes de cadastrar os produtos e os talhões de uma fruta nova. É o primeiro cadastro da produção.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.nova",
          instrucao: "Clique em “Nova fruta”",
          explicacao: "No exemplo, a fazenda começa a trabalhar cupuaçu.",
        },
        {
          cena: "nova",
          alvo: "form.nome",
          instrucao: "Informe o nome",
          explicacao: "Como aparece em Produtos, Talhões e nos relatórios da produção.",
          dica: "O nome não pode repetir na empresa: aparece “Já existe uma fruta com este nome”.",
          preenche: { "form.nome": CUPUACU.nome },
        },
        {
          cena: "nova",
          alvo: "form.custo",
          instrucao: "Informe o custo-padrão, ou deixe 0",
          explicacao:
            "Quanto custa, por kg, o fruto colhido nos talhões próprios: é o custo do lote na Recepção. O fruto comprado " +
            "usa o preço da compra, não este.",
          dica: "Ainda não sabe? Deixe 0 e ajuste depois; só os lotes recebidos depois da mudança usam o custo novo.",
          preenche: { "form.custo": String(CUPUACU.custoPadraoKg) },
        },
        {
          cena: "nova",
          alvo: "form.branqueamento",
          instrucao: "Exige branqueamento? Marque só se sim",
          explicacao:
            "Com a caixa marcada, a aba Processo da OP pede a temperatura e o tempo do branqueamento, como no açaí. O " +
            "cupuaçu não passa por branqueamento: fica desmarcado.",
        },
        {
          cena: "nova",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "O Cupuaçu entra na lista, em ordem de nome.",
        },
        {
          cena: "lista",
          alvo: "lista.cupuacu",
          instrucao: "Confira na lista",
          explicacao: "A fruta já pode ser escolhida em Produtos e em Talhões.",
          preenche: { "lista.cupuacu": "sim" },
        },
      ],
      eDepois: {
        texto:
          "Cadastre os produtos da fruta (Cadastros → Produtos) e, se ela vem de área própria, o talhão (Cadastros → " +
          "Talhões).",
        proximoRoteiro: "mudar-custo-fruta",
      },
    }),
    roteiro({
      id: "mudar-custo-fruta",
      titulo: "Mudar o custo-padrão ou inativar",
      quandoUsar: "Quando o custo de produzir o fruto próprio muda, ou quando a empresa deixa de trabalhar a fruta.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.editar-acai",
          instrucao: "Na fruta, clique em “Editar”",
          explicacao: "No exemplo, o custo de colher o açaí próprio subiu de R$ 4,00 para R$ 4,20 por kg.",
          preenche: {
            "lista.cupuacu": "sim",
            "form.nome": "Açaí",
            "form.custo": "4",
            "form.branqueamento": "sim",
          },
        },
        {
          cena: "editar",
          alvo: "form.custo",
          instrucao: "Informe o custo novo",
          explicacao: "Aceita até 4 casas decimais.",
          preenche: { "form.custo": String(NOVO_CUSTO_ACAI) },
        },
        {
          cena: "editar",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "O custo novo aparece na lista.",
        },
        {
          cena: "lista",
          alvo: "lista.custo-acai",
          instrucao: "Confira: vale daqui em diante",
          explicacao:
            "As próximas colheitas entram a R$ 4,20/kg. Os lotes já recebidos, como o FA-261120-02 do Talhão 3, ficam " +
            "com o custo do dia em que entraram (R$ 4,00).",
          preenche: { "lista.custo-acai": String(NOVO_CUSTO_ACAI) },
        },
        {
          cena: "lista",
          alvo: "lista.inativar",
          instrucao: "Deixou de trabalhar a fruta? Clique em “Inativar”",
          explicacao:
            "Não pede confirmação. A fruta inativa não aparece mais para escolher em Produtos e Talhões; os lotes e " +
            "relatórios antigos ficam como estão. O botão vira “Reativar”.",
          dica:
            "Inativar a fruta não inativa os produtos e talhões dela: inative-os também, nas telas deles, para que " +
            "sumam da Recepção.",
        },
      ],
      eDepois: {
        texto:
          "Para mudar o branqueamento, use o mesmo “Editar”. A OP lê essa marcação da fruta na hora: a mudança vale " +
          "também para as OPs já abertas.",
      },
    }),
  ],
};
