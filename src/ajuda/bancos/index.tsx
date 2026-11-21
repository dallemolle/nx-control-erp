"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada } from "@/components/ajuda/campos-simulados";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";

// Espelho de src/app/(dashboard)/cadastros/bancos/page.tsx e de banco-dialog-form.tsx. Mudou um rótulo, campo ou
// coluna lá? Ajuste aqui também.

/**
 * Exemplo: a lista de bancos (em ordem de nome; o banco interno das contas Caixa não aparece). A Maria cadastra o
 * Sicredi, que a conta nova da filial vai usar, e corrige o nome do Itaú. Hoje é 21/11/2026.
 */
export const BANCOS = [
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "104", nome: "Caixa Econômica Federal" },
  { codigo: "341", nome: "Itau" },
  { codigo: "033", nome: "Santander" },
] as const;
export const SICREDI = { codigo: "748", nome: "Sicredi" } as const;
export const ITAU_CORRIGIDO = "Itaú Unibanco";

export const ALVOS = {
  lista: ["lista.novo", "lista.tabela", "lista.sicredi", "lista.itau", "lista.editar"],
  novo: ["form.codigo", "form.nome", "form.salvar"],
  editar: ["form.codigo", "form.nome", "form.salvar"],
} as const;

/** Os bancos no ponto do roteiro, em ordem de nome. `lista.sicredi` = "sim" depois de salvo; `form.nome` na edição. */
export function bancosDoRoteiro(valores: Valores) {
  const nomeItau = valores["lista.itau"] ?? "Itau";
  const linhas: { codigo: string; nome: string }[] = BANCOS.map((b) => (b.codigo === "341" ? { ...b, nome: nomeItau } : b));
  if (valores["lista.sicredi"] === "sim") linhas.push(SICREDI);
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Bancos</p>
          <p className="text-sm text-muted-foreground">Cadastro global de bancos.</p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo banco</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bancosDoRoteiro(valores).map((b) => (
              <TableRow key={b.codigo}>
                <TableCell>{b.codigo}</TableCell>
                <TableCell className="font-medium">
                  {b.codigo === "748" || b.codigo === "341" ? (
                    <Alvo nome={b.codigo === "748" ? "lista.sicredi" : "lista.itau"} className="inline-block px-1">
                      {b.nome}
                    </Alvo>
                  ) : (
                    b.nome
                  )}
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <BotaoSimulado alvo={b.codigo === "341" ? "lista.editar" : undefined} variant="outline" size="sm">
                    Editar
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

function Formulario({ titulo, codigo, nome }: { titulo: string; codigo?: string; nome?: string }) {
  return (
    <JanelaSimulada titulo={titulo}>
      <CampoSimulado alvo="form.codigo" rotulo="Código" valor={codigo} />
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={nome} />
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

const CenaNovo = ({ valores }: PropsCena) => (
  <Formulario titulo="Novo banco" codigo={valores["form.codigo"]} nome={valores["form.nome"]} />
);
const CenaEditar = ({ valores }: PropsCena) => (
  <Formulario titulo="Editar banco" codigo="341" nome={valores["form.nome"] ?? "Itau"} />
);

const roteiro = construtorDeRoteiros<typeof ALVOS>();
const QUEM_PODE =
  "Quem pode: perfis Administrador, Financeiro e Tesouraria. Os demais perfis veem a lista, sem os botões.";

export const ajudaBancos: DefinicaoAjuda = {
  tituloTela: "Bancos",
  resumo:
    "A lista de bancos usada nas contas bancárias e nos dados bancários de clientes e fornecedores. É uma lista só, " +
    "a mesma para todas as empresas do sistema.",
  cenas: { lista: CenaLista, novo: CenaNovo, editar: CenaEditar },
  roteiros: [
    roteiro({
      id: "cadastrar-banco",
      titulo: "Cadastrar um banco",
      quandoUsar: "Quando o banco de uma conta nova (ou dos dados bancários de um parceiro) não está na lista.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.tabela",
          instrucao: "Procure o banco na lista",
          explicacao:
            "A lista vem em ordem de nome e vale para todas as empresas: quem cadastrou antes já deixou o banco aqui. " +
            "No exemplo, falta o Sicredi, da conta nova da filial.",
        },
        {
          cena: "lista",
          alvo: "lista.novo",
          instrucao: "Clique em “Novo banco”",
          explicacao: "Abre o formulário com código e nome.",
        },
        {
          cena: "novo",
          alvo: "form.codigo",
          instrucao: "Informe o código do banco",
          explicacao: "O número do banco no sistema de pagamentos, como está no extrato ou no cheque: 748 é o Sicredi.",
          dica: "O código não pode repetir, e CX é reservado ao caixa (dinheiro em espécie).",
          preenche: { "form.codigo": SICREDI.codigo },
        },
        {
          cena: "novo",
          alvo: "form.nome",
          instrucao: "Informe o nome",
          explicacao: "Como o banco aparece nas contas bancárias: “Sicredi - Ag 0812/CC 40123-7”.",
          preenche: { "form.nome": SICREDI.nome },
        },
        {
          cena: "novo",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "Se o código já existir, a mensagem aparece acima do botão.",
        },
        {
          cena: "lista",
          alvo: "lista.sicredi",
          instrucao: "Confira na lista",
          explicacao: "O Sicredi entra em ordem de nome e já aparece no cadastro de contas bancárias.",
          preenche: { "lista.sicredi": "sim" },
        },
      ],
      eDepois: {
        texto: "Agora cadastre a conta em Cadastros → Contas bancárias, escolhendo o banco 748 · Sicredi.",
        proximoRoteiro: "corrigir-banco",
      },
    }),
    roteiro({
      id: "corrigir-banco",
      titulo: "Corrigir o nome de um banco",
      quandoUsar: "Quando um banco foi cadastrado com o nome ou o código errado.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "lista.itau",
          instrucao: "Ache o banco",
          explicacao: "No exemplo, o Itaú foi cadastrado sem acento e com o nome incompleto.",
          preenche: { "lista.sicredi": "sim" },
        },
        {
          cena: "lista",
          alvo: "lista.editar",
          instrucao: "Clique em “Editar”",
          explicacao: "Abre o mesmo formulário, preenchido.",
        },
        {
          cena: "editar",
          alvo: "form.nome",
          instrucao: "Corrija o nome",
          explicacao:
            "A correção aparece em todas as contas e cadastros que usam o banco, em todas as empresas. A Auditoria " +
            "registra o antes e o depois.",
          preenche: { "form.nome": ITAU_CORRIGIDO },
        },
        {
          cena: "editar",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "A lista volta para a ordem de nome.",
        },
        {
          cena: "lista",
          alvo: "lista.itau",
          instrucao: "Confira na lista",
          explicacao: "Banco não tem Inativar nem Excluir: um banco a mais na lista não atrapalha.",
          preenche: { "lista.itau": ITAU_CORRIGIDO },
        },
      ],
      eDepois: { texto: "As contas da filial ficam em Cadastros → Contas bancárias." },
    }),
  ],
};
