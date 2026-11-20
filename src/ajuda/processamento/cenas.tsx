"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Alvo,
  BotaoSimulado,
  CampoSimulado,
  JanelaSimulada,
  SelectSimulado,
} from "@/components/ajuda/campos-simulados";
import type { PropsCena } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import { ratearCustoOP, resumirOP } from "@/lib/producao/op";
import { cn } from "@/lib/utils";
import {
  CONFIGURACAO,
  CONSUMOS,
  INSUMOS,
  LOCAL_POLPA,
  LOTES_DISPONIVEIS,
  OP,
  OPS,
  POLPAS,
  PROCESSO,
  VALIDADE_POLPA,
  type LinhaOP,
} from "./exemplo";

// Espelho de src/app/(dashboard)/producao/processamento/* (lista, detalhe [numero] e diálogos). Mudou um rótulo,
// campo ou coluna lá? Ajuste aqui também.

const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export const ABAS_OP = [
  { id: "consumo", rotulo: "Consumo" },
  { id: "producao", rotulo: "Produção" },
  { id: "insumos", rotulo: "Insumos" },
  { id: "processo", rotulo: "Processo" },
] as const;

export const rotuloLoteDisponivel = (l: (typeof LOTES_DISPONIVEIS)[number]) =>
  `${l.codigo} · ${KG.format(l.saldoKg)} kg · vence ${l.validade}`;

function StatusBadge({ status }: { status: LinhaOP["status"] }) {
  const variante = status === "Aberta" ? "secondary" : status === "Encerrada" ? "default" : "outline";
  return <Badge variant={variante}>{status}</Badge>;
}

function Verificacao({ status }: { status: "OK" | "Verificar" | "Não se aplica" }) {
  if (status === "Não se aplica") return <span className="text-muted-foreground">{status}</span>;
  return <Badge variant={status === "OK" ? "secondary" : "destructive"}>{status}</Badge>;
}

export function CenaLista({ valores }: PropsCena) {
  const status = valores["lista.status"];
  const verificar = valores["lista.verificar"];
  // "A verificar": OPs não canceladas com o item escolhido (Balanço ou Branqueamento) fora do limite.
  const aVerificar = (op: LinhaOP) =>
    op.status !== "Cancelada" && (verificar === "Branqueamento" ? op.branqueamento : op.balanco) === "Verificar";
  const linhas = OPS.filter((op) => (!status || op.status === status) && (!verificar || aVerificar(op)));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Processamento</p>
          <p className="text-sm text-muted-foreground">
            Ordens de produção: fruto consumido, polpa produzida, insumos, rendimento e custo.
          </p>
        </div>
        <BotaoSimulado alvo="lista.nova">Nova OP</BotaoSimulado>
      </div>

      <Alvo nome="lista.filtros" className="flex flex-wrap items-end gap-3 p-1">
        <CampoSimulado compacto rotulo="De" valor="01/11/2026" className="w-40" />
        <CampoSimulado compacto rotulo="Até" valor="30/11/2026" className="w-40" />
        <SelectSimulado compacto rotulo="Fruta" valor="Todas" className="w-48" />
        <SelectSimulado compacto alvo="lista.status" rotulo="Status" valor={status ?? "Todos"} className="w-48" />
        <SelectSimulado
          compacto
          alvo="lista.verificar"
          rotulo="A verificar"
          valor={verificar ?? "Todas"}
          className="w-48"
        />
        <BotaoSimulado variant="ghost" size="sm">
          Limpar filtros
        </BotaoSimulado>
      </Alvo>
      <Alvo nome="lista.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
        <span>Exportar CSV</span>
        <span>Exportar Excel</span>
        <span>Exportar PDF</span>
      </Alvo>

      <Alvo nome="lista.tabela" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Fruta</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="text-right">Fruto (kg)</TableHead>
              <TableHead className="text-right">Polpa (kg)</TableHead>
              <TableHead className="text-right">Rendimento</TableHead>
              <TableHead>Balanço</TableHead>
              <TableHead>Branqueamento</TableHead>
              <TableHead className="text-right">Custo médio/kg</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((op) => {
              const primeira = op.numero === OP.numero;
              const custo = (
                <>
                  {formatarMoeda(op.custoKg)}
                  {op.status === "Aberta" ? <span className="ml-1 text-xs text-muted-foreground">(prov.)</span> : null}
                </>
              );
              return (
                <TableRow key={op.numero}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {primeira ? (
                      <Alvo nome="lista.numero" className="inline-block px-1 text-primary">
                        {op.numero}
                      </Alvo>
                    ) : (
                      <span className="text-primary">{op.numero}</span>
                    )}
                  </TableCell>
                  <TableCell>{op.data}</TableCell>
                  <TableCell>{op.fruta}</TableCell>
                  <TableCell>{op.responsavel}</TableCell>
                  <TableCell className="text-right tabular-nums">{op.frutoKg}</TableCell>
                  <TableCell className="text-right tabular-nums">{op.polpaKg}</TableCell>
                  <TableCell className="text-right tabular-nums">{op.rendimento}</TableCell>
                  <TableCell>
                    <Verificacao status={op.balanco} />
                  </TableCell>
                  <TableCell>
                    <Verificacao status={op.branqueamento} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {primeira ? (
                      <Alvo nome="lista.custo" className="inline-block px-1">
                        {custo}
                      </Alvo>
                    ) : (
                      custo
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={op.status} />
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

export function CenaNovaOp({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Nova ordem de produção">
      <div className="grid grid-cols-2 gap-4">
        <CampoSimulado alvo="nova.data" rotulo="Data" valor={valores["nova.data"] ?? OP.data} />
        <SelectSimulado alvo="nova.fruta" rotulo="Fruta" valor={valores["nova.fruta"] ?? "Selecione a fruta"} />
      </div>
      <CampoSimulado alvo="nova.responsavel" rotulo="Responsável (opcional)" valor={valores["nova.responsavel"]} />
      <BotaoSimulado alvo="nova.abrir" largo>
        Abrir OP
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function Vazio({ colunas, texto }: { colunas: number; texto: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colunas} className="py-6 text-center text-sm text-muted-foreground">
        {texto}
      </TableCell>
    </TableRow>
  );
}

/** Formulário de linha (consumo, polpa, insumo): campos e o botão de lançar, numa caixa com borda. */
function CaixaForm({ children, botao, alvoBotao }: { children: ReactNode; botao: string; alvoBotao: string }) {
  return (
    <div className="rounded-lg border p-3">
      {children}
      <BotaoSimulado alvo={alvoBotao}>{botao}</BotaoSimulado>
    </div>
  );
}

/** Estado da OP no exemplo, montado a partir do que o roteiro já lançou. */
function estadoDaOP(valores: PropsCena["valores"]) {
  const temConsumos = valores["op.consumos"] === "lancado";
  const temPolpa = valores["op.producoes"] === "lancado";
  const temInsumos = valores["op.insumos"] === "lancado";
  const processoSalvo = valores["op.processo"] === "salvo";
  const resumo = resumirOP(
    {
      exigeBranqueamento: true,
      branqueamentoTemperaturaC: processoSalvo ? PROCESSO.temperaturaC : null,
      branqueamentoTempoS: processoSalvo ? PROCESSO.tempoS : null,
      aguaLitros: processoSalvo ? PROCESSO.aguaLitros : 0,
      carocoResiduoKg: processoSalvo ? PROCESSO.carocoResiduoKg : 0,
      perdaKg: processoSalvo ? PROCESSO.perdaKg : 0,
      consumos: temConsumos ? CONSUMOS.map((c) => ({ quantidadeKg: c.kg, custoKg: c.custoKg })) : [],
      producoes: temPolpa ? POLPAS.map((p) => ({ quantidadeKg: p.kg })) : [],
      insumos: temInsumos ? INSUMOS.map((i) => ({ quantidade: i.quantidade, custoUnitario: i.custoUnitario })) : [],
    },
    CONFIGURACAO,
  );
  const rateio = ratearCustoOP(
    resumo.custo,
    temPolpa
      ? POLPAS.map((p) => ({
          produtoId: p.produtoId,
          descricao: p.descricao,
          quantidadeKg: p.kg,
          precoKg: p.precoReferenciaKg,
        }))
      : [],
  );
  return { temConsumos, temPolpa, temInsumos, processoSalvo, resumo, rateio };
}

export function CenaOP({ valores }: PropsCena) {
  const aba = valores["op.abas"] ?? "consumo";
  const encerrada = valores["op.status"] === "Encerrada";
  const bloqueado = valores["op.bloqueado"] === "sim";
  const aberta = !encerrada;
  const { temConsumos, temPolpa, temInsumos, processoSalvo, resumo, rateio } = estadoDaOP(valores);
  const contagem: Record<string, number | null> = {
    consumo: temConsumos ? CONSUMOS.length : 0,
    producao: temPolpa ? POLPAS.length : 0,
    insumos: temInsumos ? INSUMOS.length : 0,
    processo: null,
  };
  const branqueamento =
    resumo.branqueamento === "OK" ? "OK" : resumo.branqueamento === "VERIFICAR" ? "Verificar" : "Não se aplica";
  const motivoBloqueio = `O lote ${POLPAS[1].lote} já teve venda, ajuste ou transferência`;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Alvo nome="op.cabecalho" className="p-1">
          <p className="text-sm text-muted-foreground">Processamento</p>
          <div className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {OP.numero}
            <Alvo nome="op.status" className="inline-flex">
              <StatusBadge status={encerrada ? "Encerrada" : "Aberta"} />
            </Alvo>
          </div>
          <p className="text-sm text-muted-foreground">
            {OP.data} · {OP.fruta} · {OP.responsavel} · aberta por {OP.usuario}
          </p>
        </Alvo>
        <div className="flex flex-wrap items-center gap-2">
          {aberta ? (
            <>
              <BotaoSimulado alvo="op.editar" variant="outline" size="sm">
                Editar
              </BotaoSimulado>
              <BotaoSimulado alvo="op.encerrar">Encerrar OP</BotaoSimulado>
            </>
          ) : (
            <Alvo nome="op.reabrir" className="inline-flex">
              <span title={bloqueado ? motivoBloqueio : undefined}>
                <BotaoSimulado variant="outline" className={cn(bloqueado && "pointer-events-none opacity-50")}>
                  Reabrir
                </BotaoSimulado>
              </span>
            </Alvo>
          )}
          <Alvo nome="op.cancelar" className="inline-flex">
            <span title={bloqueado ? motivoBloqueio : undefined}>
              <BotaoSimulado variant="outline" className={cn(bloqueado && "pointer-events-none opacity-50")}>
                Cancelar OP
              </BotaoSimulado>
            </span>
          </Alvo>
        </div>
      </div>
      {bloqueado ? (
        <Alvo nome="op.bloqueado" className="-mt-3 p-1">
          <p className="text-xs text-muted-foreground">{motivoBloqueio}: não dá mais para reabrir nem cancelar.</p>
        </Alvo>
      ) : null}

      <Alvo nome="op.resumo">
        <Card>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Dado rotulo="Fruto consumido">{KG.format(resumo.frutoKg)} kg</Dado>
              <Dado rotulo="Polpa produzida">{KG.format(resumo.polpaKg)} kg</Dado>
              <Alvo nome="op.rendimento" className="p-1">
                <Dado rotulo="Rendimento">
                  {resumo.rendimento === null ? "—" : PERCENTUAL.format(resumo.rendimento)}
                </Dado>
              </Alvo>
              <Alvo nome="op.balanco" className="p-1">
                <Dado rotulo="Balanço de massa">
                  <span className="flex flex-wrap items-center gap-1">
                    {KG.format(resumo.balanco.diferencaKg)} kg
                    {resumo.balanco.percentual === null ? null : (
                      <span className="text-muted-foreground">({PERCENTUAL.format(resumo.balanco.percentual)})</span>
                    )}
                    <Verificacao status={resumo.balanco.status === "OK" ? "OK" : "Verificar"} />
                  </span>
                </Dado>
              </Alvo>
              <Alvo nome="op.branqueamento" className="p-1">
                <Dado rotulo="Branqueamento">
                  <Verificacao status={branqueamento} />
                </Dado>
              </Alvo>
              <Dado rotulo="Custo do fruto">{formatarMoeda(resumo.custo.custoFrutoTotal)}</Dado>
              <Dado rotulo="Custo dos insumos">{formatarMoeda(resumo.custo.custoInsumosTotal)}</Dado>
              <Alvo nome="op.custo" className="p-1">
                <Dado rotulo={encerrada ? "Custo médio/kg" : "Custo médio/kg (provisório)"}>
                  {formatarMoeda(resumo.custo.custoKgPolpa)}
                </Dado>
              </Alvo>
            </dl>
          </CardContent>
        </Card>
      </Alvo>

      <Alvo nome="op.abas" className="flex flex-wrap gap-2 p-1">
        {ABAS_OP.map((a) => (
          <BotaoSimulado key={a.id} size="sm" variant={a.id === aba ? "default" : "outline"}>
            {a.rotulo}
            {contagem[a.id] !== null ? (
              <span className={cn("tabular-nums", a.id !== aba && "text-muted-foreground")}>{contagem[a.id]}</span>
            ) : null}
          </BotaoSimulado>
        ))}
      </Alvo>

      {aba === "consumo" ? (
        <section className="space-y-4">
          {aberta ? (
            <CaixaForm botao="Lançar consumo" alvoBotao="op.lancarConsumo">
              <div className="mb-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
                <SelectSimulado
                  alvo="op.consumoLote"
                  rotulo="Lote de fruto"
                  valor={(!temConsumos && valores["op.consumoLote"]) || "Selecione o lote"}
                />
                <CampoSimulado
                  alvo="op.consumoKg"
                  rotulo="Quantidade (kg)"
                  valor={temConsumos ? undefined : valores["op.consumoKg"]}
                />
              </div>
            </CaixaForm>
          ) : null}
          <Alvo nome="op.consumos" className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead className="text-right">kg</TableHead>
                  <TableHead className="text-right">Custo/kg</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  {aberta ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {temConsumos ? null : <Vazio colunas={7} texto="Nenhum fruto consumido." />}
                {(temConsumos ? CONSUMOS : []).map((c, indice) => (
                  <TableRow key={c.lote}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <span className="underline decoration-dotted underline-offset-4">{c.lote}</span>
                    </TableCell>
                    <TableCell>{c.produto}</TableCell>
                    <TableCell>{c.validade}</TableCell>
                    <TableCell className="text-right tabular-nums">{KG.format(c.kg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(c.custoKg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(c.kg * c.custoKg)}</TableCell>
                    {aberta ? (
                      <TableCell>
                        <div className="flex justify-end">
                          <BotaoSimulado alvo={indice === 0 ? "op.remover" : undefined} variant="outline" size="sm">
                            Remover
                          </BotaoSimulado>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Alvo>
        </section>
      ) : null}

      {aba === "producao" ? (
        <section className="space-y-4">
          {aberta ? (
            <CaixaForm botao="Lançar polpa" alvoBotao="op.lancarPolpa">
              <div className="mb-3 grid gap-3 sm:grid-cols-2">
                <SelectSimulado
                  alvo="op.polpa"
                  rotulo="Polpa"
                  valor={(!temPolpa && valores["op.polpa"]) || "Selecione a polpa"}
                />
                <SelectSimulado
                  alvo="op.local"
                  rotulo="Local"
                  valor={(!temPolpa && valores["op.local"]) || "Selecione o local"}
                />
                <CampoSimulado
                  alvo="op.polpaKg"
                  rotulo="Quantidade (kg)"
                  valor={temPolpa ? undefined : valores["op.polpaKg"]}
                />
                <CampoSimulado
                  alvo="op.embalagens"
                  rotulo="Embalagens (opcional)"
                  valor={temPolpa ? undefined : valores["op.embalagens"]}
                />
              </div>
            </CaixaForm>
          ) : null}
          {aberta ? (
            <p className="text-xs text-muted-foreground">
              Cada linha cria um lote de polpa, bloqueado para venda e ajuste até a OP ser encerrada.
            </p>
          ) : null}
          <Alvo nome="op.producoes" className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Polpa</TableHead>
                  <TableHead className="text-right">kg</TableHead>
                  <TableHead className="text-right">Embalagens</TableHead>
                  <TableHead className="text-right">
                    <Alvo nome="op.custoLote" className="inline-block px-1">
                      Custo/kg
                    </Alvo>
                  </TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {temPolpa ? null : <Vazio colunas={8} texto="Nenhuma polpa lançada." />}
                {(temPolpa ? POLPAS : []).map((p, indice) => (
                  <TableRow key={p.lote}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <span className="underline decoration-dotted underline-offset-4">{p.lote}</span>
                    </TableCell>
                    <TableCell>{p.descricao}</TableCell>
                    <TableCell className="text-right tabular-nums">{KG.format(p.kg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.embalagens}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarMoeda(rateio.custoKgPorProduto.get(p.produtoId) ?? 0)}
                    </TableCell>
                    <TableCell>{LOCAL_POLPA}</TableCell>
                    <TableCell>{VALIDADE_POLPA}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {encerrada ? (
                          <BotaoSimulado alvo={indice === 0 ? "op.etiqueta" : undefined} variant="outline" size="sm">
                            Etiqueta
                          </BotaoSimulado>
                        ) : (
                          <BotaoSimulado variant="outline" size="sm">
                            Remover
                          </BotaoSimulado>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Alvo>
        </section>
      ) : null}

      {aba === "insumos" ? (
        <section className="space-y-4">
          {aberta ? (
            <CaixaForm botao="Lançar insumo" alvoBotao="op.lancarInsumo">
              <div className="mb-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
                <SelectSimulado
                  alvo="op.insumo"
                  rotulo="Insumo"
                  valor={(!temInsumos && valores["op.insumo"]) || "Selecione o insumo"}
                />
                <CampoSimulado
                  alvo="op.insumoQtd"
                  rotulo={!temInsumos && valores["op.insumo"] ? "Quantidade (un)" : "Quantidade"}
                  valor={temInsumos ? undefined : valores["op.insumoQtd"]}
                />
              </div>
            </CaixaForm>
          ) : null}
          <Alvo nome="op.insumos" className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Custo unitário</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  {aberta ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {temInsumos ? null : <Vazio colunas={5} texto="Nenhum insumo lançado." />}
                {(temInsumos ? INSUMOS : []).map((i) => (
                  <TableRow key={i.nome}>
                    <TableCell>{i.nome}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {KG.format(i.quantidade)} {i.unidade}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(i.custoUnitario)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarMoeda(i.quantidade * i.custoUnitario)}
                    </TableCell>
                    {aberta ? (
                      <TableCell>
                        <div className="flex justify-end">
                          <BotaoSimulado variant="outline" size="sm">
                            Remover
                          </BotaoSimulado>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Alvo>
        </section>
      ) : null}

      {aba === "processo" ? (
        <Alvo nome="op.processo" className="space-y-4 p-1">
          <div className="space-y-2">
            <p className="text-sm font-medium">Branqueamento</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoSimulado
                alvo="op.temperatura"
                rotulo="Temperatura (°C)"
                valor={valores["op.temperatura"] ?? (processoSalvo ? String(PROCESSO.temperaturaC) : undefined)}
              />
              <CampoSimulado
                alvo="op.tempo"
                rotulo="Tempo (s)"
                valor={valores["op.tempo"] ?? (processoSalvo ? String(PROCESSO.tempoS) : undefined)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Mínimos: {CONFIGURACAO.branqueamentoTemperaturaMinC} °C e {CONFIGURACAO.branqueamentoTempoMinS} s.
            </p>
          </div>
          <Alvo nome="op.massas" className="grid gap-3 p-1 sm:grid-cols-3">
            <CampoSimulado rotulo="Água (L)" valor={valores["op.massas"] ? String(PROCESSO.aguaLitros) : "0"} />
            <CampoSimulado
              rotulo="Caroço/resíduo (kg)"
              valor={valores["op.massas"] ? String(PROCESSO.carocoResiduoKg) : "0"}
            />
            <CampoSimulado rotulo="Perda (kg)" valor={valores["op.massas"] ? String(PROCESSO.perdaKg) : "0"} />
          </Alvo>
          <CampoSimulado rotulo="Observação" valor={valores["op.massas"] ? PROCESSO.observacao : undefined} />
          <div className="flex flex-wrap items-center gap-3">
            <BotaoSimulado alvo="op.salvarProcesso">Salvar processo</BotaoSimulado>
            {processoSalvo ? <span className="text-sm text-muted-foreground">Salvo.</span> : null}
          </div>
        </Alvo>
      ) : null}
    </div>
  );
}

export function CenaEncerrar({ valores }: PropsCena) {
  const comVerificar = valores["encerrar.verificar"] === "sim";
  return (
    <JanelaSimulada titulo={`Encerrar ${OP.numero}`}>
      <Alvo nome="encerrar.aviso" className="p-1">
        <p className="text-sm text-muted-foreground">
          O custo é gravado e a polpa fica liberada para venda e ajuste. Se precisar corrigir depois, a OP pode ser
          reaberta enquanto nenhum lote de polpa tiver saída.
        </p>
      </Alvo>
      {comVerificar ? (
        <Alvo nome="encerrar.verificar" className="space-y-2 rounded-lg border border-destructive/40 p-3">
          <p className="text-sm font-medium text-destructive">A verificar: Balanço de massa</p>
          <span className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 size-4 shrink-0 rounded border border-input" />
            Confirmo o encerramento com itens a verificar
          </span>
        </Alvo>
      ) : null}
      <BotaoSimulado alvo="encerrar.confirmar" largo>
        Encerrar
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaDesfazer({ valores }: PropsCena) {
  const cancelar = valores["desfazer.aviso"] === "cancelar";
  return (
    <JanelaSimulada titulo={`${cancelar ? "Cancelar" : "Reabrir"} ${OP.numero}`}>
      <Alvo nome="desfazer.aviso" className="p-1">
        <p className="text-sm text-muted-foreground">
          {cancelar
            ? "O fruto volta para os lotes de origem e os lotes de polpa são zerados. Não dá para desfazer."
            : "A OP volta para aberta: os custos gravados são limpos e a polpa fica bloqueada até encerrar de novo."}
        </p>
      </Alvo>
      <CampoSimulado alvo="desfazer.motivo" rotulo="Motivo" valor={valores["desfazer.motivo"]} />
      <BotaoSimulado alvo="desfazer.confirmar" variant={cancelar ? "destructive" : "default"} largo>
        {cancelar ? "Cancelar OP" : "Reabrir"}
      </BotaoSimulado>
    </JanelaSimulada>
  );
}
