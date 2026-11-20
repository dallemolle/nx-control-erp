"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado, SelectSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { ANO_BASE, ANO_BASE_FISCAL, PREMISSAS, projetar, type AnoProjetado, type Cenario, type Premissas } from "./exemplo";

// Espelho de src/app/(dashboard)/financeiro/fluxo-de-caixa-estrategico/*. Mudou um rótulo lá? Ajuste aqui também.

const ROTULO: Record<Cenario, string> = { BASE: "Base", OTIMISTA: "Otimista", PESSIMISTA: "Pessimista" };

const moeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

/** Como o formulário real mostra as premissas: percentual com duas casas e ponto decimal. */
const percentual = (fracao: number) => (fracao * 100).toFixed(2);

/** Premissas do cenário, com o que o roteiro digitou por cima (percentuais como no campo, "8.00"). */
function premissasDe(cenario: Cenario, valores: PropsCena["valores"]): Premissas {
  const base = PREMISSAS[cenario];
  const lido = (campo: string) => valores[`${cenario}.${campo}`];
  const pct = (campo: string, padrao: number) => (lido(campo) !== undefined ? Number(lido(campo)) / 100 : padrao);
  return {
    crescimentoReceita: pct("receita", base.crescimentoReceita),
    crescimentoCustos: pct("custos", base.crescimentoCustos),
    capexPercentualReceita: pct("capex", base.capexPercentualReceita),
    novoEndividamentoAnual:
      lido("endividamento") !== undefined ? Number(lido("endividamento")) : base.novoEndividamentoAnual,
    taxaJurosAnual: pct("juros", base.taxaJurosAnual),
  };
}

type Metrica = { chave: string; rotulo: string; valor: (ano: AnoProjetado) => string; vermelho?: (ano: AnoProjetado) => boolean };

function Secao({ cenario, valores }: { cenario: Cenario; valores: PropsCena["valores"] }) {
  const filtro = valores["painel.classificacao"];
  const p = premissasDe(cenario, valores);
  const base = filtro ? ANO_BASE_FISCAL : ANO_BASE;
  const anos = projetar(p, base.receita, base.custo, base.saldoCaixa);
  const alvo = (nome: string) => `${cenario}.${nome}`;
  const metricas: Metrica[] = [
    { chave: "receita", rotulo: "Receita", valor: (a) => moeda(a.receita) },
    { chave: "custo", rotulo: "Custo operacional", valor: (a) => moeda(a.custoOperacional) },
    { chave: "capex", rotulo: "CAPEX", valor: (a) => moeda(a.capex) },
    { chave: "juros", rotulo: "Juros", valor: (a) => moeda(a.jurosSobreDivida) },
    { chave: "geracao", rotulo: "Geração líquida", valor: (a) => moeda(a.geracaoLiquida) },
    {
      chave: "saldo",
      rotulo: filtro ? "Acumulado de caixa" : "Saldo de caixa",
      valor: (a) => moeda(a.saldoCaixa),
      vermelho: (a) => a.saldoCaixa < 0,
    },
    { chave: "margem", rotulo: "Margem líquida", valor: (a) => `${(a.margemLiquida * 100).toFixed(1)}%` },
  ];
  // Só estes têm alvo nos roteiros; os demais desenham sem destaque.
  const comAlvo = new Set(
    cenario === "BASE" ? ["receita", "capex", "juros", "saldo", "margem"] : cenario === "PESSIMISTA" ? ["saldo"] : [],
  );
  const campos = [
    { campo: "receita", rotulo: "Crescimento de receita (% a.a.)", valor: percentual(p.crescimentoReceita) },
    { campo: "custos", rotulo: "Crescimento de custos/despesas (% a.a.)", valor: percentual(p.crescimentoCustos) },
    { campo: "capex", rotulo: "CAPEX (% da receita)", valor: percentual(p.capexPercentualReceita) },
    { campo: "endividamento", rotulo: "Novo endividamento anual (R$)", valor: String(p.novoEndividamentoAnual) },
    { campo: "juros", rotulo: "Taxa de juros anual (% a.a.)", valor: percentual(p.taxaJurosAnual) },
  ];

  const tabela = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Métrica</TableHead>
          {anos.map((a) => (
            <TableHead key={a.ano}>Ano {a.ano}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {metricas.map((m) => (
          <TableRow key={m.chave}>
            <TableCell className="font-medium">
              {comAlvo.has(m.chave) ? (
                <Alvo nome={alvo(`linha.${m.chave}`)} className="inline-block px-1">
                  {m.rotulo}
                </Alvo>
              ) : (
                m.rotulo
              )}
            </TableCell>
            {anos.map((a) => (
              <TableCell key={a.ano} className={m.vermelho?.(a) ? "font-medium text-destructive" : undefined}>
                {m.valor(a)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const conteudo = (
    <section className="space-y-4 rounded-lg border p-4">
      <p className="text-base font-semibold">Cenário {ROTULO[cenario]}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {campos.map((c) => (
          <CampoSimulado
            key={c.campo}
            alvo={cenario === "BASE" ? alvo(c.campo) : undefined}
            rotulo={c.rotulo}
            valor={c.valor}
          />
        ))}
        <div className="flex items-end">
          <BotaoSimulado alvo={cenario === "BASE" ? alvo("salvar") : undefined}>Salvar premissas</BotaoSimulado>
        </div>
      </div>
      {cenario === "BASE" ? <Alvo nome={alvo("tabela")}>{tabela}</Alvo> : tabela}
    </section>
  );

  return cenario === "BASE" ? conteudo : <Alvo nome={alvo("secao")}>{conteudo}</Alvo>;
}

export function CenaPainel({ valores }: PropsCena) {
  const filtro = valores["painel.classificacao"];
  return (
    <div className="space-y-8">
      <div>
        <p className="text-lg font-semibold">Fluxo de caixa estratégico</p>
        <p className="text-sm text-muted-foreground">
          Projeção de 5 anos por cenário, consolidando as filiais ativas da empresa a partir do fluxo de caixa
          realizado dos últimos 12 meses. Não considera prazo de recebimento/pagamento, capital de giro nem
          amortização de dívida (juros incidem sobre o saldo devedor acumulado, que nunca é amortizado).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SelectSimulado alvo="painel.classificacao" valor={filtro || "Todos"} className="w-40" />
        <Alvo nome="painel.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Exportar CSV</span>
          <span>Exportar Excel</span>
          <span>Exportar PDF</span>
        </Alvo>
      </div>

      {filtro && (
        <Alvo nome="painel.aviso">
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Visão filtrada: mostra apenas o movimento classificado como{" "}
            <span className="font-medium text-foreground">{filtro}</span>, acumulado a partir de zero. O saldo
            bancário é único e aparece só na visão &quot;Todos&quot;; transferências entre contas também ficam de
            fora.
          </p>
        </Alvo>
      )}

      {(["BASE", "OTIMISTA", "PESSIMISTA"] as const).map((cenario) => (
        <Secao key={cenario} cenario={cenario} valores={valores} />
      ))}
    </div>
  );
}
