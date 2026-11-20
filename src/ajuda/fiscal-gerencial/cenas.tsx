"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import {
  ANO,
  COMPARATIVO,
  EM_ABERTO,
  FILTROS_PENDENCIA,
  MESES_CURTOS,
  PARCEIROS_SEM_NOTA,
  PENDENCIAS,
  TOTAIS,
  percentualGerencial,
  type Movimento,
} from "./exemplo";

// Espelho de src/app/(dashboard)/controladoria/fiscal-gerencial/*. Mudou um rótulo ou coluna lá? Ajuste aqui também.

const formatarPercentual = (valor: number | null) => (valor === null ? "—" : `${valor.toFixed(1)}%`);

const CORES = {
  entradasFiscal: "var(--chart-2)",
  entradasGerencial: "var(--chart-3)",
  saidasFiscal: "var(--chart-4)",
  saidasGerencial: "var(--chart-5)",
} as const;

const LEGENDA = [
  { cor: CORES.entradasFiscal, rotulo: "Entradas fiscais" },
  { cor: CORES.entradasGerencial, rotulo: "Entradas gerenciais" },
  { cor: CORES.saidasFiscal, rotulo: "Saídas fiscais" },
  { cor: CORES.saidasGerencial, rotulo: "Saídas gerenciais" },
];

const MAXIMO = Math.max(
  ...COMPARATIVO.flatMap((l) => [l.entradasFiscal + l.entradasGerencial, l.saidasFiscal + l.saidasGerencial]),
);

const altura = (valor: number) => `${(valor / MAXIMO) * 100}%`;

/** Uma barra empilhada: a parte fiscal embaixo e a gerencial em cima. */
function Barra({ fiscal, gerencial, cores }: { fiscal: number; gerencial: number; cores: [string, string] }) {
  return (
    <div className="flex h-full w-2.5 flex-col justify-end sm:w-3">
      <div style={{ height: altura(gerencial), background: cores[1] }} />
      <div style={{ height: altura(fiscal), background: cores[0] }} />
    </div>
  );
}

/** Imitação simplificada do gráfico de barras empilhadas da tela (sem eixos nem dica ao passar o mouse). */
function GraficoSimulado() {
  return (
    <div className="space-y-2 rounded-lg border p-3" aria-hidden>
      <div className="flex h-36 items-end justify-between gap-1">
        {COMPARATIVO.map((l) => (
          <div key={l.mes} className="flex h-full flex-col items-center justify-end gap-1">
            <div className="flex h-full items-end gap-0.5">
              <Barra
                fiscal={l.entradasFiscal}
                gerencial={l.entradasGerencial}
                cores={[CORES.entradasFiscal, CORES.entradasGerencial]}
              />
              <Barra
                fiscal={l.saidasFiscal}
                gerencial={l.saidasGerencial}
                cores={[CORES.saidasFiscal, CORES.saidasGerencial]}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{MESES_CURTOS[l.mes - 1]}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
        {LEGENDA.map((item) => (
          <span key={item.rotulo} className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm" style={{ background: item.cor }} />
            {item.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

function Exportar({ alvo }: { alvo: string }) {
  return (
    <Alvo nome={alvo} className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
      <span>Exportar CSV</span>
      <span>Exportar Excel</span>
      <span>Exportar PDF</span>
    </Alvo>
  );
}

function CelulasDoMes({ l }: { l: Movimento }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{formatarMoeda(l.entradasFiscal)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatarMoeda(l.entradasGerencial)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatarPercentual(percentualGerencial(l.entradasFiscal, l.entradasGerencial))}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatarMoeda(l.saidasFiscal)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatarMoeda(l.saidasGerencial)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatarPercentual(percentualGerencial(l.saidasFiscal, l.saidasGerencial))}
      </TableCell>
    </>
  );
}

export function CenaPainel({ valores }: PropsCena) {
  const filtroChave = valores["pend.filtro-chave"] !== undefined;
  const pendencias = filtroChave ? PENDENCIAS.filter((p) => p.pendencias.includes("Sem chave de acesso")) : PENDENCIAS;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-lg font-semibold">Fiscal × gerencial</p>
        <p className="text-sm text-muted-foreground">
          Quanto do movimento da filial ativa tem documento fiscal e quanto é negociado sem nota. Realizado usa
          movimentações conciliadas (transferências entre contas ficam de fora); em aberto usa os títulos ainda não
          liquidados.
        </p>
      </div>

      <Alvo nome="painel.ano" className="flex w-fit flex-wrap items-center gap-2 p-1">
        <BotaoSimulado variant="outline" size="sm">
          Ano anterior
        </BotaoSimulado>
        <span className="text-sm font-medium">{ANO}</span>
        <BotaoSimulado variant="outline" size="sm">
          Próximo ano
        </BotaoSimulado>
      </Alvo>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-base font-semibold">Realizado por mês — {ANO}</p>
          <Exportar alvo="comp.exportar" />
        </div>
        <Alvo nome="comp.grafico">
          <GraficoSimulado />
        </Alvo>
        <Alvo nome="comp.tabela">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Entradas fiscais</TableHead>
                <TableHead className="text-right">Entradas gerenciais</TableHead>
                <TableHead className="text-right">% gerencial</TableHead>
                <TableHead className="text-right">Saídas fiscais</TableHead>
                <TableHead className="text-right">Saídas gerenciais</TableHead>
                <TableHead className="text-right">% gerencial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COMPARATIVO.map((l) => (
                <TableRow key={l.mes}>
                  <TableCell>
                    {l.mes === 11 ? (
                      <Alvo nome="comp.nov" className="inline-block px-1">
                        {MESES_CURTOS[l.mes - 1]}
                      </Alvo>
                    ) : (
                      MESES_CURTOS[l.mes - 1]
                    )}
                  </TableCell>
                  <CelulasDoMes l={l} />
                </TableRow>
              ))}
              <TableRow className="font-medium">
                <TableCell>
                  <Alvo nome="comp.total" className="inline-block px-1">
                    Total
                  </Alvo>
                </TableCell>
                <CelulasDoMes l={TOTAIS} />
              </TableRow>
            </TableBody>
          </Table>
        </Alvo>
      </section>

      <section className="space-y-3">
        <p className="text-base font-semibold">Em aberto hoje</p>
        <Alvo nome="aberto.cards" className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {EM_ABERTO.map((card) => (
            <Card key={card.rotulo}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.rotulo}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(card.valor)}</p>
              </CardContent>
            </Card>
          ))}
        </Alvo>
      </section>

      <section className="space-y-3">
        <p className="text-base font-semibold">Maiores parceiros sem nota — {ANO}</p>
        <Alvo nome="parceiros.tabela">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parceiro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Títulos</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PARCEIROS_SEM_NOTA.map((p) => (
                <TableRow key={p.nome}>
                  <TableCell>{p.nome}</TableCell>
                  <TableCell>{p.tipo}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.titulos}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(p.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Alvo>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Alvo nome="pend.titulo" className="inline-block px-1">
            <p className="text-base font-semibold">Pendências fiscais ({pendencias.length})</p>
          </Alvo>
          <Exportar alvo="pend.exportar" />
        </div>
        <p className="text-sm text-muted-foreground">
          Títulos fiscais ainda sem tipo de documento, número da nota, chave de acesso ou anexo. Não bloqueiam nada —
          servem para completar o cadastro quando a nota chegar. Títulos lançados antes deste recurso aparecem aqui até
          serem revisados.
        </p>
        <Alvo nome="pend.filtros" className="flex flex-wrap gap-2 p-1">
          <BotaoSimulado size="sm" variant={filtroChave ? "outline" : "default"}>
            Todas
          </BotaoSimulado>
          {FILTROS_PENDENCIA.map((rotulo) => {
            const ativo = filtroChave && rotulo === "Sem chave de acesso";
            return (
              <BotaoSimulado
                key={rotulo}
                size="sm"
                variant={ativo ? "default" : "outline"}
                alvo={rotulo === "Sem chave de acesso" ? "pend.filtro-chave" : undefined}
              >
                {rotulo}
              </BotaoSimulado>
            );
          })}
        </Alvo>
        <Alvo nome="pend.tabela">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Parceiro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Pendências</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendencias.map((p) => (
                <TableRow key={p.chave}>
                  <TableCell>
                    {p.chave === "nfe-2210" ? (
                      <Alvo nome="pend.documento" className="inline-block px-1">
                        <span className="font-medium text-primary">{p.documento}</span>
                      </Alvo>
                    ) : (
                      <span className="font-medium text-primary">{p.documento}</span>
                    )}
                  </TableCell>
                  <TableCell>{p.parceiro}</TableCell>
                  <TableCell>{p.tipo}</TableCell>
                  <TableCell>{p.emissao}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(p.valor)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.pendencias.map((item) => (
                        <Badge key={item} variant="outline">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Alvo>
      </section>
    </div>
  );
}
