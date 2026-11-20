"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, BotaoSimulado, CampoSimulado } from "@/components/ajuda/campos-simulados";
import type { PropsCena, Valores } from "@/ajuda/tipos";
import { destinoDoLote, linhasDoDestino } from "@/lib/producao/destinoLote";
import { LOTES_DA_FILIAL, RASTREIOS, type Cliente, type OpResumo, type Rastreio } from "./exemplo";

// Espelho de src/app/(dashboard)/producao/rastreabilidade/*. Mudou um rótulo, cartão ou coluna lá? Ajuste aqui também.

const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

const VARIANTE_STATUS = { OK: "default", Vencendo: "secondary", Vencido: "destructive", Zerado: "outline" } as const;

const iso = (data: string) => data.split("/").reverse().join("-");

/** O que a tela mostra para o código digitado: o rastreio (código exato) ou a lista de lotes que contêm o trecho. */
export function resultadoDaBusca(valores: Valores) {
  const termo = (valores["busca.campo"] ?? "").trim().toUpperCase();
  if (!termo) return { termo, rastreio: null, encontrados: [] as typeof LOTES_DA_FILIAL[number][] };
  const rastreio = RASTREIOS.find((r) => r.codigo === termo) ?? null;
  const encontrados = rastreio ? [] : LOTES_DA_FILIAL.filter((l) => l.codigo.includes(termo)).slice(0, 20);
  return { termo, rastreio, encontrados };
}

/** Clientes como a tela lista: por data e nº do pedido; cancelados só com "Mostrar cancelados". */
export function clientesDoRastreio(rastreio: Rastreio, incluirCancelados: boolean) {
  const linhas = rastreio.clientes
    .filter((c) => incluirCancelados || !c.cancelado)
    .slice()
    .sort((a, b) => iso(a.data).localeCompare(iso(b.data)) || a.pedido - b.pedido);
  const validos = linhas.filter((c) => !c.cancelado);
  return {
    linhas,
    clientes: new Set(validos.map((c) => `${c.documento}|${c.cliente}`)).size,
    kg: validos.reduce((s, c) => s + c.kg, 0),
  };
}

export const linhasDeDestino = (r: Rastreio) =>
  linhasDoDestino(destinoDoLote([...r.movimentos], r.familia.length > 1 ? somaDaFamilia(r) : r.saldoKg));

const somaDaFamilia = (r: Rastreio) => r.familia.reduce((s, l) => s + l.saldoKg, 0);

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

const Codigo = ({ children }: { children: string }) => (
  <span className="underline decoration-dotted underline-offset-4">{children}</span>
);

function ResumoOP({ op }: { op: OpResumo }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <Dado rotulo="OP">
        <span className="flex flex-wrap items-center gap-1">
          {op.numero}
          <Badge variant="default">{op.status}</Badge>
        </span>
      </Dado>
      <Dado rotulo="Data">{op.data}</Dado>
      <Dado rotulo="Responsável">{op.responsavel}</Dado>
      <Dado rotulo="Branqueamento">
        <span className="flex flex-wrap items-center gap-1">
          {op.branqueamento}
          <Badge variant="secondary">OK</Badge>
        </span>
      </Dado>
      <Dado rotulo="Rendimento · balanço">
        <span className="flex flex-wrap items-center gap-1">
          {op.rendimentoBalanco}
          <Badge variant="secondary">OK</Badge>
        </span>
      </Dado>
    </dl>
  );
}

function LinhaCliente({ c, alvoCancelado }: { c: Cliente; alvoCancelado: boolean }) {
  const pedido = (
    <>
      {c.pedido}
      {c.cancelado ? (
        <Badge variant="destructive" className="ml-2">
          Cancelado
        </Badge>
      ) : null}
    </>
  );
  return (
    <TableRow className={c.cancelado ? "text-muted-foreground" : undefined}>
      <TableCell className="whitespace-nowrap">
        {alvoCancelado ? (
          <Alvo nome="clientes.cancelado" className="inline-block px-1">
            {pedido}
          </Alvo>
        ) : (
          pedido
        )}
      </TableCell>
      <TableCell>{c.data}</TableCell>
      <TableCell className="whitespace-nowrap">
        <Codigo>{c.loteVendido}</Codigo>
        {c.op ? <p className="text-xs text-muted-foreground">polpa da {c.op}</p> : null}
      </TableCell>
      <TableCell>
        {c.cliente}
        <p className="text-xs text-muted-foreground">{c.documento}</p>
      </TableCell>
      <TableCell className="text-sm">{c.contato}</TableCell>
      <TableCell className="text-sm">{c.endereco}</TableCell>
      <TableCell className="text-right tabular-nums">{KG.format(c.kg)}</TableCell>
      <TableCell className="whitespace-nowrap">
        {c.entrega}
        {c.entregaDetalhe ? <p className="text-xs text-muted-foreground">{c.entregaDetalhe}</p> : null}
      </TableCell>
    </TableRow>
  );
}

function Resultado({ r, incluirCancelados }: { r: Rastreio; incluirCancelados: boolean }) {
  const clientes = clientesDoRastreio(r, incluirCancelados);
  const familia = r.familia.length > 1;
  const destino = linhasDeDestino(r);
  return (
    <>
      <Alvo nome="lote.cartao">
        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                {r.codigo}
                <Badge variant={VARIANTE_STATUS[r.status]}>{r.status}</Badge>
              </CardTitle>
              <CardDescription>
                {r.categoria} · {r.produto}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BotaoSimulado alvo="lote.cancelados" variant="outline" size="sm">
                {incluirCancelados ? "Ocultar cancelados" : "Mostrar cancelados"}
              </BotaoSimulado>
              <BotaoSimulado alvo="lote.etiqueta" variant="outline" size="sm">
                Etiqueta
              </BotaoSimulado>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Dado rotulo={r.categoria === "Fruto" ? "Recepção" : "Fabricação"}>{r.data}</Dado>
              <Dado rotulo="Validade">{r.validade}</Dado>
              <Dado rotulo="Local">{r.local}</Dado>
              <Dado rotulo="Quantidade inicial">{KG.format(r.inicialKg)} kg</Dado>
              <Dado rotulo="Saldo">{KG.format(r.saldoKg)} kg</Dado>
            </dl>
          </CardContent>
        </Card>
      </Alvo>
      <Alvo nome="lote.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
        <span>Exportar CSV</span>
        <span>Exportar Excel</span>
        <span>Exportar PDF</span>
      </Alvo>

      {familia ? (
        <Alvo nome="familia.cartao">
          <Card>
            <CardHeader>
              <CardTitle>Lotes da família</CardTitle>
              <CardDescription>
                O lote foi dividido em transferências entre locais. A origem, as OPs, os clientes e o destino abaixo
                somam todos eles.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead className="text-right">Saldo (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.familia.map((l) => {
                    const consultado = l.codigo === r.codigo;
                    return (
                      <TableRow key={l.codigo} className={consultado ? "font-medium" : undefined}>
                        <TableCell className="whitespace-nowrap">
                          {consultado ? l.codigo : <Codigo>{l.codigo}</Codigo>}
                          {consultado ? (
                            <Badge variant="outline" className="ml-2">
                              Consultado
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>{l.local}</TableCell>
                        <TableCell>{l.validade}</TableCell>
                        <TableCell className="text-right tabular-nums">{KG.format(l.saldoKg)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Alvo>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Origem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {r.recepcao ? (
            <Alvo nome="origem.recepcao" className="p-1">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <Dado rotulo="Recepção">{r.recepcao.data}</Dado>
                <Dado rotulo="Origem">{r.recepcao.origem}</Dado>
                <Dado rotulo="Qualidade">{r.recepcao.qualidade}</Dado>
                <Dado rotulo="Peso bruto · descarte">
                  {KG.format(r.recepcao.brutoKg)} kg · {KG.format(r.recepcao.descarteKg)} kg
                </Dado>
                <Dado rotulo="Documento">{r.recepcao.documento}</Dado>
              </dl>
            </Alvo>
          ) : null}
          {r.opOrigem ? (
            <>
              <Alvo nome="origem.op" className="p-1">
                <ResumoOP op={r.opOrigem} />
              </Alvo>
              <Alvo nome="origem.frutos" className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lote de fruto</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">kg consumido</TableHead>
                      <TableHead>Recepção</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Qualidade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.frutos.map((f) => (
                      <TableRow key={f.codigo}>
                        <TableCell className="font-medium whitespace-nowrap">
                          <Codigo>{f.codigo}</Codigo>
                        </TableCell>
                        <TableCell>{f.produto}</TableCell>
                        <TableCell className="text-right tabular-nums">{KG.format(f.kg)}</TableCell>
                        <TableCell>{f.recepcao}</TableCell>
                        <TableCell>{f.origem}</TableCell>
                        <TableCell>{f.qualidade}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Alvo>
            </>
          ) : null}
        </CardContent>
      </Card>

      {r.categoria === "Fruto" ? (
        <Alvo nome="frente.cartao">
          <Card>
            <CardHeader>
              <CardTitle>Para frente</CardTitle>
              <CardDescription>OPs que usaram este fruto e os lotes de polpa que elas geraram.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {r.paraFrente.map((p) => (
                <section key={p.op.numero} className="space-y-3">
                  <ResumoOP op={p.op} />
                  <p className="text-sm">
                    Usou <span className="font-medium tabular-nums">{KG.format(p.kgDesteLote)} kg</span> deste lote
                  </p>
                  <Alvo nome="frente.polpas" className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Lote de polpa</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-right">kg produzido</TableHead>
                          <TableHead className="text-right">Saldo (kg)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {p.polpas.map((polpa) => (
                          <TableRow key={polpa.codigo}>
                            <TableCell className="font-medium whitespace-nowrap">
                              <Codigo>{polpa.codigo}</Codigo>
                            </TableCell>
                            <TableCell>{polpa.produto}</TableCell>
                            <TableCell className="text-right tabular-nums">{KG.format(polpa.kg)}</TableCell>
                            <TableCell className="text-right tabular-nums">{KG.format(polpa.saldoKg)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Alvo>
                </section>
              ))}
            </CardContent>
          </Card>
        </Alvo>
      ) : null}

      <Alvo nome="destino.cartao">
        <Card>
          <CardHeader>
            <CardTitle>{familia ? "Destino da família" : "Destino do lote"}</CardTitle>
            <CardDescription>Para onde foi cada kg, pelos movimentos de estoque.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table className="max-w-md">
              <TableBody>
                {destino.map((l, n) => (
                  <TableRow key={l.rotulo} className={n === destino.length - 1 ? "font-medium" : undefined}>
                    <TableCell>{l.rotulo}</TableCell>
                    <TableCell className="text-right tabular-nums">{KG.format(l.kg)} kg</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Alvo>

      <Alvo nome="clientes.cartao">
        <Card>
          <CardHeader>
            <CardTitle>Clientes que receberam</CardTitle>
            <Alvo nome="clientes.resumo" className="inline-block px-1">
              <CardDescription>
                {clientes.clientes} {clientes.clientes === 1 ? "cliente" : "clientes"} · {KG.format(clientes.kg)} kg
                {incluirCancelados ? " (sem contar pedidos cancelados)" : ""}
              </CardDescription>
            </Alvo>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Lote vendido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead className="text-right">kg</TableHead>
                  <TableHead>Entrega</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.linhas.map((c) => (
                  <LinhaCliente key={c.pedido} c={c} alvoCancelado={Boolean(c.cancelado)} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Alvo>
    </>
  );
}

export function CenaRastreio({ valores }: PropsCena) {
  const { termo, rastreio, encontrados } = resultadoDaBusca(valores);
  const incluirCancelados = valores["lote.cancelados"] === "sim";
  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <p className="text-lg font-semibold">Rastreabilidade</p>
        <p className="text-sm text-muted-foreground">
          De onde veio um lote e para quem foi, até os clientes da polpa feita com o fruto. Use no recall e na
          fiscalização.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <CampoSimulado
          alvo="busca.campo"
          rotulo="Código do lote"
          valor={valores["busca.campo"]}
          placeholder="Ex.: FA-261110-01 ou FA-2611"
          className="w-64"
        />
        <BotaoSimulado alvo="busca.rastrear">Rastrear</BotaoSimulado>
      </div>

      {termo && !rastreio ? (
        <Alvo nome="busca.lista">
          <Card>
            <CardHeader>
              <CardTitle>
                {encontrados.length === 0 ? "Nenhum lote encontrado" : `Lotes com "${termo}" no código`}
              </CardTitle>
            </CardHeader>
            {encontrados.length > 0 ? (
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lote</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Saldo (kg)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {encontrados.map((l) => (
                      <TableRow key={l.codigo}>
                        <TableCell className="font-medium">
                          <Codigo>{l.codigo}</Codigo>
                        </TableCell>
                        <TableCell>{l.produto}</TableCell>
                        <TableCell>{l.data}</TableCell>
                        <TableCell className="text-right tabular-nums">{KG.format(l.saldoKg)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            ) : null}
          </Card>
        </Alvo>
      ) : null}

      {rastreio ? <Resultado r={rastreio} incluirCancelados={incluirCancelados} /> : null}
    </div>
  );
}
