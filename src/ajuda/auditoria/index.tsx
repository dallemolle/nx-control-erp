"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, SelectSimulado } from "@/components/ajuda/campos-simulados";
import { rotuloAcaoAuditoria, rotuloEntidadeAuditoria } from "@/lib/auditoria/rotulos";
import { construtorDeRoteiros, type DefinicaoAjuda, type PropsCena, type Valores } from "@/ajuda/tipos";
import { NOVO_CUSTO_ACAI } from "@/ajuda/frutas";
import { NOVO_CUSTO_ENERGIA } from "@/ajuda/insumos";
import { FILIAL_ATIVA, LUCIA, OUTRA_FILIAL, VOCE } from "@/ajuda/usuarios/exemplo";

// Espelho de src/app/(dashboard)/auditoria/page.tsx, barra-de-filtros.tsx e paginacao.tsx. Mudou um filtro, coluna ou
// rótulo lá? Ajuste aqui também.

/**
 * Exemplo: em 22/11/2026, a Lúcia Martins (a contadora, perfil Auditor, da ajuda de Usuários) confere o que mudou na
 * Empresa Demonstração. Os registros são as alterações que as outras ajudas contaram: o custo do açaí e da energia,
 * a taxa de débito da Cartões Rurais, a categoria Taxas de cartão, a Rita e o Pedro em Usuários, a Configuração de
 * produção e uma baixa aprovada pelo Carlos na outra filial. Como o banco grava: só os campos que mudaram, em JSON.
 * Mais recentes primeiro. Fictício e fixo.
 */
export type RegistroExemplo = {
  chave: string;
  dia: string;
  hora: string;
  usuario: string;
  filial: string;
  entidade: string;
  acao: string;
  anterior: Record<string, unknown> | null;
  novo: Record<string, unknown> | null;
};

const MARIA = "Maria Souza";
const CARLOS = "Carlos Lima";

export const REGISTROS: readonly RegistroExemplo[] = [
  {
    chave: "rita",
    dia: "21/11/2026",
    hora: "21:40:12",
    usuario: VOCE.nome,
    filial: FILIAL_ATIVA,
    entidade: "UsuarioEmpresa",
    acao: "ATUALIZAR",
    anterior: { perfil: "VENDAS" },
    novo: { perfil: "FINANCEIRO" },
  },
  {
    chave: "pedro",
    dia: "21/11/2026",
    hora: "16:05:31",
    usuario: VOCE.nome,
    filial: FILIAL_ATIVA,
    entidade: "UsuarioEmpresa",
    acao: "INATIVAR",
    anterior: { ativo: true },
    novo: { ativo: false },
  },
  {
    chave: "operadora",
    dia: "21/11/2026",
    hora: "14:22:09",
    usuario: MARIA,
    filial: FILIAL_ATIVA,
    entidade: "OperadoraCartao",
    acao: "ATUALIZAR",
    anterior: {
      condicoes: [{ modalidade: "DEBITO", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 1.5, prazoDias: 1 }],
    },
    novo: { condicoes: [{ modalidade: "DEBITO", parcelasDe: 1, parcelasAte: 1, taxaPercentual: 1.4, prazoDias: 1 }] },
  },
  {
    chave: "categoria",
    dia: "21/11/2026",
    hora: "11:47:55",
    usuario: MARIA,
    filial: FILIAL_ATIVA,
    entidade: "CategoriaFinanceira",
    acao: "CRIAR",
    anterior: null,
    novo: { nome: "Taxas de cartão", tipo: "DESPESA", parentId: "cmh7q2x0a0004l8v3d9k1p6sz" },
  },
  {
    chave: "acai",
    dia: "21/11/2026",
    hora: "09:15:40",
    usuario: VOCE.nome,
    filial: FILIAL_ATIVA,
    entidade: "Fruta",
    acao: "ATUALIZAR",
    anterior: { custoPadraoKg: 4 },
    novo: { custoPadraoKg: NOVO_CUSTO_ACAI },
  },
  {
    chave: "energia",
    dia: "21/11/2026",
    hora: "09:10:03",
    usuario: VOCE.nome,
    filial: FILIAL_ATIVA,
    entidade: "Insumo",
    acao: "ATUALIZAR",
    anterior: { custoUnitario: 0.9 },
    novo: { custoUnitario: NOVO_CUSTO_ENERGIA },
  },
  {
    chave: "baixa",
    dia: "20/11/2026",
    hora: "17:30:48",
    usuario: CARLOS,
    filial: OUTRA_FILIAL,
    entidade: "Baixa",
    acao: "APROVAR",
    anterior: { statusAprovacao: "PENDENTE" },
    novo: { statusAprovacao: "APROVADO", lancamentoBancarioId: "cmi3v8r1t0012m5w7b2n4c9qe" },
  },
  {
    chave: "configuracao",
    dia: "19/11/2026",
    hora: "08:02:27",
    usuario: VOCE.nome,
    filial: FILIAL_ATIVA,
    entidade: "ConfiguracaoProducao",
    acao: "ATUALIZAR",
    anterior: { categoriaCompraFrutoId: null, prazoPagamentoProdutorDias: 0 },
    novo: { categoriaCompraFrutoId: "cmh7q2x0a0002l8v3f5j8w1ty", prazoPagamentoProdutorDias: 7 },
  },
];

export const ALVOS = {
  lista: [
    "filtro.entidade",
    "filtro.usuario",
    "filtro.de",
    "filtro.ate",
    "filtro.limpar",
    "export.links",
    "export.limites",
    "tabela",
    "linha.quem",
    "linha.acao",
    "linha.anterior",
    "linha.novo",
    "linha.rita",
    "paginacao",
  ],
} as const;

const TODAS = "Todas";
const TODOS = "Todos";

/** "21/11/2026" → 20261121, para comparar dias. */
function diaComoNumero(dia: string): number {
  const [d, m, a] = dia.split("/").map(Number);
  return a * 10000 + m * 100 + d;
}

/** Os registros que a lista mostra com os filtros do ponto do roteiro (o dia é o de Brasília, como a coluna). */
export function registrosDoRoteiro(valores: Valores): RegistroExemplo[] {
  const entidade = valores["filtro.entidade"];
  const usuario = valores["filtro.usuario"];
  const de = valores["filtro.de"];
  const ate = valores["filtro.ate"];
  return REGISTROS.filter(
    (r) =>
      (!entidade || rotuloEntidadeAuditoria(r.entidade) === entidade) &&
      (!usuario || r.usuario === usuario) &&
      (!de || diaComoNumero(r.dia) >= diaComoNumero(de)) &&
      (!ate || diaComoNumero(r.dia) <= diaComoNumero(ate)),
  );
}

function json(valor: Record<string, unknown> | null): string {
  return valor ? JSON.stringify(valor) : "—";
}

function Filtro({ alvo, rotulo, valor }: { alvo?: string; rotulo: string; valor: string }) {
  return <SelectSimulado alvo={alvo} rotulo={rotulo} valor={valor} compacto className="w-48" />;
}

/** Destaca uma célula da linha do açaí (ou a linha das 21h40) sem mudar o desenho da tabela. */
function Celula({ alvo, children, className }: { alvo?: string; children: ReactNode; className?: string }) {
  return (
    <TableCell className={className}>
      {alvo ? (
        <Alvo nome={alvo} className="-mx-1 inline-block max-w-full truncate px-1 align-top">
          {children}
        </Alvo>
      ) : (
        children
      )}
    </TableCell>
  );
}

function CenaLista({ valores }: PropsCena) {
  const registros = registrosDoRoteiro(valores);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Auditoria</p>
        <p className="text-sm text-muted-foreground">Alterações registradas nesta empresa.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Filtro alvo="filtro.entidade" rotulo="Entidade" valor={valores["filtro.entidade"] ?? TODAS} />
        <Filtro rotulo="Ação" valor={TODAS} />
        <Filtro alvo="filtro.usuario" rotulo="Usuário" valor={valores["filtro.usuario"] ?? TODOS} />
        <Filtro rotulo="Filial" valor={TODAS} />
        <CampoSimulado
          alvo="filtro.de"
          rotulo="Data de"
          valor={valores["filtro.de"]}
          placeholder="dd/mm/aaaa"
          compacto
          className="w-40"
        />
        <CampoSimulado
          alvo="filtro.ate"
          rotulo="Data até"
          valor={valores["filtro.ate"]}
          placeholder="dd/mm/aaaa"
          compacto
          className="w-40"
        />
        <BotaoSimulado alvo="filtro.limpar" variant="outline" size="sm">
          Limpar filtros
        </BotaoSimulado>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Alvo nome="export.links" className="inline-flex flex-wrap gap-x-3 px-1 text-sm">
          <span className="text-primary">Exportar CSV</span>
          <span className="text-primary">Exportar Excel</span>
          <span className="text-primary">Exportar PDF</span>
        </Alvo>
        <Alvo nome="export.limites" className="inline-block px-1">
          <p className="text-xs text-muted-foreground">
            PDF: até 2.000 registros mais recentes · CSV e Excel: até 10.000
          </p>
        </Alvo>
      </div>

      <Alvo nome="tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Valor anterior</TableHead>
              <TableHead>Valor novo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.map((r) => {
              const acai = r.chave === "acai";
              return (
                <TableRow key={r.chave}>
                  <Celula alvo={r.chave === "rita" ? "linha.rita" : undefined} className="whitespace-nowrap text-xs">
                    {r.dia}, {r.hora}
                  </Celula>
                  <Celula alvo={acai ? "linha.quem" : undefined} className="text-xs">
                    {r.usuario}
                  </Celula>
                  <TableCell className="text-xs">{r.filial}</TableCell>
                  <TableCell className="text-xs">{rotuloEntidadeAuditoria(r.entidade)}</TableCell>
                  <Celula alvo={acai ? "linha.acao" : undefined} className="text-xs">
                    {rotuloAcaoAuditoria(r.acao)}
                  </Celula>
                  <Celula
                    alvo={acai ? "linha.anterior" : undefined}
                    className="max-w-56 truncate text-xs text-muted-foreground"
                  >
                    {json(r.anterior)}
                  </Celula>
                  <Celula
                    alvo={acai ? "linha.novo" : undefined}
                    className="max-w-56 truncate text-xs text-muted-foreground"
                  >
                    {json(r.novo)}
                  </Celula>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Alvo>

      <Alvo nome="paginacao" className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Página 1 de 1</span>
        <BotaoSimulado variant="outline" size="sm" className="opacity-50">
          Anterior
        </BotaoSimulado>
        <BotaoSimulado variant="outline" size="sm" className="opacity-50">
          Próximo
        </BotaoSimulado>
      </Alvo>
    </div>
  );
}

const roteiro = construtorDeRoteiros<typeof ALVOS>();

const QUEM_PODE =
  "Quem pode: os perfis Administrador, Gestor e Auditor. A tela é da empresa: mostra todas as filiais, também as " +
  "em que a pessoa não tem acesso. Ninguém altera nem apaga um registro.";

const ACAI = REGISTROS.find((r) => r.chave === "acai")!;
const RITA = REGISTROS.find((r) => r.chave === "rita")!;

export const ajudaAuditoria: DefinicaoAjuda = {
  tituloTela: "Auditoria",
  resumo:
    "O registro automático de cada alteração feita na empresa: quem, quando, em qual filial, em quê e o que mudou. " +
    "Serve para descobrir quem mexeu num cadastro ou num lançamento e para entregar o histórico ao contador.",
  cenas: { lista: CenaLista },
  roteiros: [
    roteiro({
      id: "quem-alterou",
      titulo: "Descobrir quem alterou um registro",
      quandoUsar: "Quando um valor mudou e você quer saber quem mudou, quando e o que era antes.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "tabela",
          instrucao: "Veja a lista",
          explicacao:
            `Cada linha é uma alteração, das mais recentes para as mais antigas. No exemplo, a ${LUCIA.nome}, ` +
            "contadora, quer saber por que o custo do açaí colhido subiu.",
        },
        {
          cena: "lista",
          alvo: "filtro.entidade",
          instrucao: "Em “Entidade”, escolha o tipo de registro",
          explicacao:
            "Entidade é o que foi alterado: Título, Baixa, Cliente, Fruta… A lista traz só os tipos que já têm " +
            "registro na empresa. No exemplo, Fruta.",
          preenche: { "filtro.entidade": rotuloEntidadeAuditoria(ACAI.entidade) },
        },
        {
          cena: "lista",
          alvo: "linha.quem",
          instrucao: "Veja quem e quando",
          explicacao:
            `${ACAI.usuario}, em ${ACAI.dia} às ${ACAI.hora.slice(0, 5)}, horário de Brasília. A coluna Filial diz ` +
            "em qual filial a pessoa estava.",
        },
        {
          cena: "lista",
          alvo: "linha.acao",
          instrucao: "Veja a ação",
          explicacao: "Criar, Atualizar, Inativar, Aprovar, Conciliar… No exemplo, Atualizar: o cadastro foi editado.",
        },
        {
          cena: "lista",
          alvo: "linha.anterior",
          instrucao: "Leia o valor anterior",
          explicacao:
            "Só os campos que mudaram, com o nome interno do campo. Aqui, custoPadraoKg: 4, ou seja, R$ 4,00/kg. " +
            "Num registro criado, o anterior fica “—”.",
          dica:
            "Texto longo aparece cortado na tela. Para ler inteiro, exporte (próximo roteiro). Campos que guardam " +
            "outro registro mostram o código dele, não o nome.",
        },
        {
          cena: "lista",
          alvo: "linha.novo",
          instrucao: "Leia o valor novo",
          explicacao: `custoPadraoKg: ${NOVO_CUSTO_ACAI}, ou seja, R$ 4,20/kg. Mistério resolvido.`,
        },
        {
          cena: "lista",
          alvo: "filtro.limpar",
          instrucao: "Clique em “Limpar filtros”",
          explicacao: "Volta a mostrar tudo. Os filtros ficam no endereço da página: dá para mandar o link a alguém.",
          preenche: { "filtro.entidade": "" },
        },
      ],
      eDepois: {
        texto: "Para ver tudo o que uma pessoa fez num período, combine os filtros de Usuário e de data.",
        proximoRoteiro: "o-que-fez",
      },
    }),
    roteiro({
      id: "o-que-fez",
      titulo: "Ver o que uma pessoa fez num período",
      quandoUsar: "Para revisar o dia de alguém, ou quando uma pessoa sai e você quer ver o que ela mexeu por último.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "filtro.usuario",
          instrucao: "Em “Usuário”, escolha a pessoa",
          explicacao: `A lista traz quem já tem registro na empresa. No exemplo, ${VOCE.nome}, o Administrador.`,
          preenche: { "filtro.usuario": VOCE.nome },
        },
        {
          cena: "lista",
          alvo: "filtro.de",
          instrucao: "Informe a data inicial",
          explicacao: "A lista muda na hora, sem botão de buscar.",
          preenche: { "filtro.de": RITA.dia },
        },
        {
          cena: "lista",
          alvo: "filtro.ate",
          instrucao: "Informe a data final",
          explicacao: `Para um dia só, a mesma data nos dois campos. No exemplo, ${RITA.dia}.`,
          preenche: { "filtro.ate": RITA.dia },
        },
        {
          cena: "lista",
          alvo: "linha.rita",
          instrucao: "Confira as alterações do dia",
          explicacao:
            `A troca de perfil da Rita, às ${RITA.hora.slice(0, 5)}, entra no dia ${RITA.dia}: o dia do filtro é ` +
            "o de Brasília, o mesmo da coluna Data/hora.",
        },
        {
          cena: "lista",
          alvo: "paginacao",
          instrucao: "Muitas linhas? Use a paginação",
          explicacao: "São 50 registros por página. Trocar um filtro volta para a página 1.",
        },
      ],
      eDepois: {
        texto: "Para guardar ou mandar o resultado, exporte com os mesmos filtros.",
        proximoRoteiro: "exportar",
      },
    }),
    roteiro({
      id: "exportar",
      titulo: "Exportar para o contador",
      quandoUsar: "Para entregar o histórico a alguém de fora, ou para ler os valores inteiros.",
      quemPode: QUEM_PODE,
      passos: [
        {
          cena: "lista",
          alvo: "filtro.de",
          instrucao: "Filtre o que vai exportar",
          explicacao: "O arquivo sai com os filtros da tela. No exemplo, a Lúcia quer novembro inteiro.",
          preenche: { "filtro.de": "01/11/2026", "filtro.ate": "30/11/2026" },
        },
        {
          cena: "lista",
          alvo: "export.links",
          instrucao: "Escolha o formato",
          explicacao:
            "Excel e CSV trazem a coluna “ID do registro” (o código do título, da fruta…) e os valores anterior e " +
            "novo inteiros. O PDF traz os filtros usados no cabeçalho.",
          dica: "Para conferir valores com cuidado, prefira o Excel: no PDF o texto longo quebra em várias linhas.",
        },
        {
          cena: "lista",
          alvo: "export.limites",
          instrucao: "Atenção aos limites",
          explicacao:
            "O arquivo traz os registros mais recentes até o limite. Se o filtro casar com mais, o PDF avisa no " +
            "topo; para o resto, filtre um período menor.",
        },
      ],
      eDepois: {
        texto:
          "A Auditoria só mostra: ninguém, nem o Administrador, apaga ou altera um registro. Se algo foi mudado por " +
          "engano, corrija na tela de origem; a correção também fica registrada.",
      },
    }),
  ],
};
