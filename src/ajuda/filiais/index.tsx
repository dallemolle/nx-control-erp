"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, JanelaSimulada } from "@/components/ajuda/campos-simulados";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";
import { CNPJ_MATRIZ, FILIAL_ATIVA, OUTRA_FILIAL } from "@/ajuda/usuarios/exemplo";

// Espelho de src/app/(dashboard)/filiais/page.tsx e de filial-dialog-form.tsx. Mudou um rótulo, campo ou coluna lá?
// Ajuste aqui também.

/**
 * Exemplo: a Empresa Demonstração, com você na Matriz. A fazenda abre a unidade de Igarapé-Miri (a mesma filial da
 * ajuda de Usuários) e fecha o posto de compra de Cametá. Lista em ordem de nome.
 */
export type FilialExemplo = { chave: string; nome: string; cnpjCpf: string };

export const MATRIZ: FilialExemplo = { chave: "matriz", nome: FILIAL_ATIVA, cnpjCpf: CNPJ_MATRIZ };
export const CAMETA: FilialExemplo = { chave: "cameta", nome: "Posto de compra Cametá", cnpjCpf: "12.345.678/0003-52" };
export const IGARAPE: FilialExemplo & { cnpjDigitado: string } = {
  chave: "igarape",
  nome: OUTRA_FILIAL,
  cnpjDigitado: "12345678000271",
  cnpjCpf: "12.345.678/0002-71",
};

export const ALVOS = {
  lista: ["lista.nova", "lista.tabela", "lista.igarape", "lista.matriz", "lista.cameta", "lista.inativar-cameta"],
  nova: ["form.nome", "form.cnpj", "form.salvar"],
} as const;

/** As filiais no ponto do roteiro: `lista.igarape` = "sim" depois de salva; `lista.cameta` = Ativa ou Inativa. */
export function filiaisDoRoteiro(valores: Valores) {
  const linhas = [MATRIZ, CAMETA].map((f) => ({ ...f, ativa: f.chave !== "cameta" || valores["lista.cameta"] !== "Inativa" }));
  if (valores["lista.igarape"] === "sim") linhas.push({ ...IGARAPE, ativa: true });
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const ALVO_DO_NOME: Readonly<Record<string, string>> = { igarape: "lista.igarape", matriz: "lista.matriz" };

function CenaLista({ valores }: PropsCena) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Filiais</p>
          <p className="text-sm text-muted-foreground">
            Cadastro de filiais da empresa ativa. Cada filial é um contexto operacional dentro da empresa.
          </p>
        </div>
        <BotaoSimulado alvo="lista.nova">Nova filial</BotaoSimulado>
      </div>
      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CNPJ/CPF</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filiaisDoRoteiro(valores).map((f) => {
              const alvoNome = ALVO_DO_NOME[f.chave];
              const status = <Badge variant={f.ativa ? "default" : "secondary"}>{f.ativa ? "Ativa" : "Inativa"}</Badge>;
              return (
                <TableRow key={f.chave}>
                  <TableCell className="font-medium">
                    {alvoNome ? (
                      <Alvo nome={alvoNome} className="inline-block px-1">
                        {f.nome}
                      </Alvo>
                    ) : (
                      f.nome
                    )}
                  </TableCell>
                  <TableCell>{f.cnpjCpf}</TableCell>
                  <TableCell>
                    {f.chave === "cameta" ? (
                      <Alvo nome="lista.cameta" className="inline-block px-1">
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
                    {f.chave === MATRIZ.chave ? null : (
                      <BotaoSimulado
                        alvo={f.chave === "cameta" ? "lista.inativar-cameta" : undefined}
                        variant="outline"
                        size="sm"
                      >
                        {f.ativa ? "Inativar" : "Reativar"}
                      </BotaoSimulado>
                    )}
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
    <JanelaSimulada titulo="Nova filial">
      <CampoSimulado alvo="form.nome" rotulo="Nome" valor={valores["form.nome"]} />
      <CampoSimulado alvo="form.cnpj" rotulo="CNPJ/CPF" valor={valores["form.cnpj"]} />
      <BotaoSimulado alvo="form.salvar" largo>
        Salvar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

const roteiro = construtorDeRoteiros<typeof ALVOS>();

export const ajudaFiliais: DefinicaoAjuda = {
  tituloTela: "Filiais",
  resumo:
    "As unidades da empresa. Cada filial tem os próprios cadastros financeiros, contas, títulos, estoque e produção; " +
    "clientes, fornecedores, frutas, produtos e insumos são da empresa e valem para todas.",
  cenas: { lista: CenaLista, nova: CenaNova },
  roteiros: [
    roteiro({
      id: "cadastrar-filial",
      titulo: "Cadastrar uma filial",
      quandoUsar: "Quando a empresa abre uma unidade com CNPJ próprio, cujo caixa e estoque devem ficar separados.",
      quemPode: "Quem pode: só o perfil Administrador. A lista mostra as filiais da empresa em que você está.",
      passos: [
        {
          cena: "lista",
          alvo: "lista.nova",
          instrucao: "Clique em “Nova filial”",
          explicacao: `A filial é da empresa em que você está. No exemplo, a fazenda abre a unidade de Igarapé-Miri.`,
        },
        {
          cena: "nova",
          alvo: "form.nome",
          instrucao: "Informe o nome",
          explicacao: "Como aparece no topo da tela, em “Trocar filial” e no acesso por filial dos usuários.",
          preenche: { "form.nome": IGARAPE.nome },
        },
        {
          cena: "nova",
          alvo: "form.cnpj",
          instrucao: "Informe o CNPJ ou CPF da filial",
          explicacao:
            "Pode digitar só os números. É por este CNPJ que a API sabe a filial (cabeçalho X-Filial-CnpjCpf).",
          dica: "Não pode repetir: aparece “Já existe uma filial com este CNPJ/CPF”.",
          preenche: { "form.cnpj": IGARAPE.cnpjDigitado },
        },
        {
          cena: "nova",
          alvo: "form.salvar",
          instrucao: "Clique em “Salvar”",
          explicacao: "A filial entra na lista, ativa.",
        },
        {
          cena: "lista",
          alvo: "lista.igarape",
          instrucao: "Agora, dê acesso a ela",
          explicacao:
            "A filial nasce sem ninguém com acesso, nem você. Em Administração → Usuários, marque Leitura (e Alteração) " +
            "para quem vai trabalhar nela; só então ela aparece em “Trocar filial”.",
          dica:
            "A filial nova também começa sem categorias, centros, contas bancárias e configuração de produção: " +
            "cadastre dentro dela.",
          preenche: { "lista.igarape": "sim" },
        },
        {
          cena: "lista",
          alvo: "lista.matriz",
          instrucao: "A filial em que você está não tem “Inativar”",
          explicacao:
            "Inativá-la tiraria você dela na hora. Para inativar a Matriz, troque de filial antes.",
        },
        {
          cena: "lista",
          alvo: "lista.inativar-cameta",
          instrucao: "Unidade fechada? Clique em “Inativar”",
          explicacao: "O posto de compra de Cametá fechou. Não pede confirmação.",
        },
        {
          cena: "lista",
          alvo: "lista.cameta",
          instrucao: "Confira o status",
          explicacao:
            "Inativa: ninguém entra mais nela, e ela some de “Trocar filial” e do acesso por filial. Os títulos e " +
            "lançamentos dela ficam guardados; “Reativar” devolve tudo.",
          preenche: { "lista.cameta": "Inativa" },
        },
      ],
      eDepois: {
        texto:
          "Para mudar nome ou CNPJ, use o “Editar” da linha. Criar, editar, inativar e reativar ficam na Auditoria.",
      },
    }),
  ],
};
