"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Alvo,
  BotaoSimulado,
  CampoSimulado,
  JanelaSimulada,
  SelectSimulado,
} from "@/components/ajuda/campos-simulados";
import type { PropsCena, Valores } from "@/ajuda/tipos";
import type { CondicaoCartao } from "@/lib/producao/cartao";
import { MODALIDADE_CARTAO, ROTULOS_MODALIDADE_CARTAO } from "@/lib/schemas/enums";
import { cn } from "@/lib/utils";
import {
  CARTOES_RURAIS,
  CATEGORIA_TAXA,
  CONTA_BB,
  CONTA_SICREDI,
  PAGUE,
  PORTO,
  type OperadoraDaLista,
} from "./exemplo";

// Espelho de src/app/(dashboard)/cadastros/operadoras-cartao/page.tsx e de operadora-dialog-form.tsx. Mudou um
// rótulo, campo ou coluna lá? Ajuste aqui também.

const TAXA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** Como o banco devolve: por modalidade (na ordem do enum) e pela faixa. */
const ordenar = (condicoes: CondicaoCartao[]) =>
  [...condicoes].sort(
    (a, b) =>
      MODALIDADE_CARTAO.indexOf(a.modalidade) - MODALIDADE_CARTAO.indexOf(b.modalidade) || a.parcelasDe - b.parcelasDe,
  );

/** A linha da coluna Condições, como a tela formata. */
export function textoDaCondicao(c: CondicaoCartao): string {
  const faixa = c.modalidade === "CREDITO_PARCELADO" ? ` ${c.parcelasDe}–${c.parcelasAte}x` : "";
  const prazo = c.antecipado ? `antecipado em ${dias(c.prazoDias)}` : dias(c.prazoDias);
  return `${ROTULOS_MODALIDADE_CARTAO[c.modalidade]}${faixa} · ${TAXA.format(c.taxaPercentual)}% · ${prazo}`;
}

/** As condições da Pague Norte no ponto do roteiro (sem e com as faixas do parcelado). */
export function condicoesDaPague(valores: Valores): CondicaoCartao[] {
  const faixas = Number(valores["form.parcelado"] ?? "0");
  return ordenar([...PAGUE.condicoes, ...PAGUE.parcelado.slice(0, faixas)]);
}

/** As condições da Cartões Rurais, com a taxa do débito já mudada se o roteiro chegou lá. */
export function condicoesDaRurais(valores: Valores): CondicaoCartao[] {
  const debito = valores["form.taxaDebito"] ? Number(valores["form.taxaDebito"]) : null;
  return ordenar(
    CARTOES_RURAIS.condicoes.map((c) => (c.modalidade === "DEBITO" && debito !== null ? { ...c, taxaPercentual: debito } : c)),
  );
}

type Linha = OperadoraDaLista & { ativa: boolean };

/** As operadoras no ponto do roteiro, em ordem de nome, como a tela lista. */
export function operadorasDoRoteiro(valores: Valores): Linha[] {
  const linhas: Linha[] = [
    { ...CARTOES_RURAIS, condicoes: condicoesDaRurais(valores), ativa: true },
    { ...PORTO, condicoes: ordenar(PORTO.condicoes), ativa: valores["lista.porto"] !== "Inativa" },
  ];
  if (valores["lista.pague"] === "sim") {
    linhas.push({ chave: "pague", nome: PAGUE.nome, conta: CONTA_SICREDI, condicoes: condicoesDaPague(valores), ativa: true });
  }
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function Condicoes({ linha }: { linha: Linha }) {
  const textos = linha.condicoes.map((c, i) => (
    <p key={i} className="whitespace-nowrap">
      {textoDaCondicao(c)}
    </p>
  ));
  const alvo = { pague: "lista.condicoesPague", rurais: "lista.condicoesRurais" }[linha.chave as string];
  return alvo ? (
    <Alvo nome={alvo} className="inline-block px-1">
      {textos}
    </Alvo>
  ) : (
    <>{textos}</>
  );
}

export function CenaLista({ valores }: PropsCena) {
  const linhas = operadorasDoRoteiro(valores);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Operadoras de cartão</p>
          <p className="text-sm text-muted-foreground">
            Maquininhas da filial: onde depositam e a taxa e o prazo de cada modalidade.
          </p>
        </div>
        <BotaoSimulado alvo="lista.nova">Nova operadora</BotaoSimulado>
      </div>

      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Conta de depósito</TableHead>
              <TableHead>Condições</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => {
              const badge = (
                <Badge variant={linha.ativa ? "default" : "secondary"}>{linha.ativa ? "Ativa" : "Inativa"}</Badge>
              );
              return (
                <TableRow key={linha.chave}>
                  <TableCell className="font-medium">
                    {linha.chave === "pague" ? (
                      <Alvo nome="lista.pague" className="inline-block px-1">
                        {linha.nome}
                      </Alvo>
                    ) : (
                      linha.nome
                    )}
                  </TableCell>
                  <TableCell>{linha.conta}</TableCell>
                  <TableCell className="text-sm">
                    <Condicoes linha={linha} />
                  </TableCell>
                  <TableCell>
                    {linha.chave === "porto" ? (
                      <Alvo nome="lista.porto" className="inline-block px-1">
                        {badge}
                      </Alvo>
                    ) : (
                      badge
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <BotaoSimulado
                        alvo={{ pague: "lista.editarPague", rurais: "lista.editarRurais" }[linha.chave as string]}
                        variant="outline"
                        size="sm"
                      >
                        Editar
                      </BotaoSimulado>
                      <BotaoSimulado alvo={linha.chave === "porto" ? "lista.inativar" : undefined} variant="outline" size="sm">
                        {linha.ativa ? "Inativar" : "Reativar"}
                      </BotaoSimulado>
                    </div>
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

function Caixinha({ marcada }: { marcada: boolean }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm border border-input text-[10px]",
        marcada && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {marcada ? "✓" : ""}
    </span>
  );
}

/** Uma linha de condição do formulário. `alvos` marca a linha (ou o campo da taxa) para o roteiro. */
function LinhaCondicao({
  c,
  removivel,
  alvoLinha,
  alvoTaxa,
  alvoAntecipado,
}: {
  c: Partial<CondicaoCartao> & { modalidade: CondicaoCartao["modalidade"] };
  removivel: boolean;
  alvoLinha?: string;
  alvoTaxa?: string;
  alvoAntecipado?: string;
}) {
  const parcelado = c.modalidade === "CREDITO_PARCELADO";
  const conteudo = (
    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-6">
      <SelectSimulado valor={ROTULOS_MODALIDADE_CARTAO[c.modalidade]} className="sm:col-span-2" />
      {parcelado ? (
        <>
          <CampoSimulado valor={String(c.parcelasDe)} />
          <CampoSimulado valor={String(c.parcelasAte)} />
        </>
      ) : (
        <span className="self-center text-xs text-muted-foreground sm:col-span-2">1 parcela</span>
      )}
      <CampoSimulado
        alvo={alvoTaxa}
        valor={c.taxaPercentual === undefined ? undefined : TAXA.format(c.taxaPercentual)}
        placeholder="Taxa %"
      />
      <CampoSimulado valor={c.prazoDias === undefined ? undefined : String(c.prazoDias)} placeholder="Dias" />
      <div className="flex items-center justify-between gap-2 sm:col-span-6">
        {parcelado ? (
          alvoAntecipado ? (
            <Alvo nome={alvoAntecipado} className="flex items-center gap-2 p-1 text-sm">
              <Caixinha marcada={Boolean(c.antecipado)} />
              Antecipado (um repasse só, no prazo)
            </Alvo>
          ) : (
            <span className="flex items-center gap-2 text-sm">
              <Caixinha marcada={Boolean(c.antecipado)} />
              Antecipado (um repasse só, no prazo)
            </span>
          )
        ) : (
          <span />
        )}
        {removivel ? (
          <BotaoSimulado variant="ghost" size="sm">
            Remover
          </BotaoSimulado>
        ) : null}
      </div>
    </div>
  );
  return alvoLinha ? (
    <Alvo nome={alvoLinha} className="p-1">
      {conteudo}
    </Alvo>
  ) : (
    conteudo
  );
}

function Rodape() {
  return (
    <>
      <BotaoSimulado alvo="form.adicionar" variant="outline" size="sm">
        Adicionar condição
      </BotaoSimulado>
      <p className="text-xs text-muted-foreground">
        Taxa sobre o valor bruto. Prazo em dias corridos até o 1º repasse; no parcelado sem antecipação, os repasses
        seguintes vêm de 30 em 30 dias.
      </p>
    </>
  );
}

function Cabecalho({ nome, cnpj, conta, categoria, alvos }: {
  nome?: string;
  cnpj?: string;
  conta?: string;
  categoria?: string;
  alvos: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSimulado alvo={alvos ? "form.nome" : undefined} rotulo="Nome" valor={nome} />
        <CampoSimulado alvo={alvos ? "form.cnpj" : undefined} rotulo="CNPJ" valor={cnpj} />
        <SelectSimulado alvo={alvos ? "form.conta" : undefined} rotulo="Conta de depósito" valor={conta ?? "Selecione a conta"} />
        <SelectSimulado
          alvo={alvos ? "form.categoria" : undefined}
          rotulo="Categoria da taxa"
          valor={categoria ?? "Selecione a categoria"}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        O sistema usa (ou cria) o fornecedor e o cliente com este CNPJ: a taxa sai em nome do fornecedor e os repasses
        em nome do cliente.
      </p>
    </>
  );
}

export function CenaNova({ valores }: PropsCena) {
  const preenchidas = valores["form.condicoes"] === "sim";
  const linhas = preenchidas ? PAGUE.condicoes : [{ modalidade: "DEBITO" as const, prazoDias: 1 }];
  return (
    <JanelaSimulada titulo="Nova operadora" className="max-w-2xl">
      <Cabecalho
        alvos
        nome={valores["form.nome"]}
        cnpj={valores["form.cnpj"]}
        conta={valores["form.conta"]}
        categoria={valores["form.categoria"]}
      />
      <div className="grid gap-2">
        <p className="text-sm font-medium">Condições</p>
        <Alvo nome="form.condicoes" className="grid gap-2 p-1">
          {linhas.map((c, i) => (
            <LinhaCondicao key={i} c={c} removivel={linhas.length > 1} />
          ))}
        </Alvo>
        <Rodape />
      </div>
      <BotaoSimulado alvo="form.salvar">Salvar</BotaoSimulado>
    </JanelaSimulada>
  );
}

/** O “Editar” da Pague Norte (faixas do parcelado) ou da Cartões Rurais (taxa do débito). */
export function CenaEditar({ valores }: PropsCena) {
  const ehPague = (valores["editar.operadora"] ?? "pague") === "pague";
  const condicoes = ehPague
    ? [...PAGUE.condicoes, ...PAGUE.parcelado.slice(0, Number(valores["form.parcelado"] ?? "0"))]
    : condicoesDaRurais(valores);
  return (
    <JanelaSimulada titulo="Editar operadora" className="max-w-2xl">
      <Alvo nome="editar.operadora" className="p-1">
        <Cabecalho
          alvos={false}
          nome={ehPague ? PAGUE.nome : CARTOES_RURAIS.nome}
          cnpj={ehPague ? "27.561.904/0001-33" : "61.205.774/0001-30"}
          conta={ehPague ? CONTA_SICREDI : CONTA_BB}
          categoria={CATEGORIA_TAXA}
        />
      </Alvo>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Condições</p>
        {condicoes.map((c, i) => {
          const parcelado = c.modalidade === "CREDITO_PARCELADO";
          return (
            <LinhaCondicao
              key={i}
              c={c}
              removivel={condicoes.length > 1}
              alvoLinha={ehPague && parcelado && !c.antecipado ? "form.parcelado" : undefined}
              alvoAntecipado={ehPague && c.antecipado ? "form.antecipado" : undefined}
              alvoTaxa={!ehPague && c.modalidade === "DEBITO" ? "form.taxaDebito" : undefined}
            />
          );
        })}
        <Rodape />
      </div>
      <BotaoSimulado alvo="form.salvar">Salvar</BotaoSimulado>
    </JanelaSimulada>
  );
}
