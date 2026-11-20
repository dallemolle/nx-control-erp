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
import { formatarMoeda } from "@/lib/formatacao";
import { arredondar } from "@/lib/producao/arredondar";
import { ROTULOS_STATUS_LOTE, diasParaVencer, statusDoLote, type StatusLote } from "@/lib/producao/statusLote";
import { cn } from "@/lib/utils";
import {
  ALERTAS,
  HOJE,
  HOJE_ISO,
  LIBERACAO,
  LOCAIS,
  LOTES,
  TRANSFERENCIA,
  ZERADOS,
  type LoteExemplo,
} from "./exemplo";

// Espelho de src/app/(dashboard)/producao/estoque/*. Mudou um rótulo, coluna ou regra lá? Ajuste aqui também.

const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

const VARIANTE_STATUS: Record<StatusLote, "default" | "secondary" | "destructive" | "outline"> = {
  OK: "default",
  VENCENDO: "secondary",
  VENCIDO: "destructive",
  ZERADO: "outline",
};

const COR_CARTAO: Record<Exclude<StatusLote, "ZERADO">, string> = {
  OK: "border-l-muted-foreground/40",
  VENCENDO: "border-l-amber-500",
  VENCIDO: "border-l-destructive",
};

/** `dd/mm/aaaa` → data de calendário (UTC). */
function deData(texto: string): Date {
  const [dia, mes, ano] = texto.split("/").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const formatarIso = (iso: string) => iso.split("-").reverse().join("/");

const statusDoRotulo = (rotulo: string | undefined): StatusLote | undefined =>
  (Object.keys(ROTULOS_STATUS_LOTE) as StatusLote[]).find((s) => ROTULOS_STATUS_LOTE[s] === rotulo);

export type LinhaEstoque = LoteExemplo & {
  dias: number;
  status: StatusLote;
  valor: number;
  /** Vencido hoje (a liberação usa sempre o dia de hoje, não a data de referência). */
  vencidoHoje: boolean;
};

/** Os lotes do exemplo como a tela mostraria com estes valores (transferência, filtros, data de referência). */
export function lotesDaCena(valores: Valores): { todos: LinhaEstoque[]; visiveis: LinhaEstoque[]; referencia: Date } {
  const referencia = deData(valores["est.referencia"] ?? HOJE);
  const hoje = new Date(`${HOJE_ISO}T00:00:00.000Z`);
  const transferido = valores["est.filho"] === "transferido";
  const base: LoteExemplo[] = LOTES.flatMap((l) => {
    if (!transferido || l.codigo !== TRANSFERENCIA.lote) return [l];
    return [
      { ...l, saldoKg: l.saldoKg - TRANSFERENCIA.kg },
      { ...l, codigo: TRANSFERENCIA.filho, local: TRANSFERENCIA.destino, saldoKg: TRANSFERENCIA.kg },
    ];
  });
  const status = statusDoRotulo(valores["est.status"]);
  const comZerados = valores["est.zerados"] === "sim" || status === "ZERADO";
  const todos = [...base, ...ZERADOS]
    .map((l): LinhaEstoque => {
      const validade = new Date(`${l.validade}T00:00:00.000Z`);
      return {
        ...l,
        dias: diasParaVencer(validade, referencia),
        status: statusDoLote({ saldoKg: l.saldoKg, validade, conservacao: l.conservacao }, referencia, ALERTAS),
        valor: arredondar(Math.max(0, l.saldoKg) * l.custoKg, 2),
        vencidoHoje: validade.getTime() < hoje.getTime(),
      };
    })
    .sort((a, b) => a.validade.localeCompare(b.validade) || a.codigo.localeCompare(b.codigo));
  const visiveis = todos.filter((l) => (comZerados || l.saldoKg > 0) && (!status || l.status === status));
  return { todos, visiveis, referencia };
}

/** Cartões: lotes com saldo e kg por status (ignoram o filtro de status). */
export function resumoDosCartoes(todos: LinhaEstoque[]) {
  return (["OK", "VENCENDO", "VENCIDO"] as const).map((status) => {
    const lotes = todos.filter((l) => l.saldoKg > 0 && l.status === status);
    return { status, quantidade: lotes.length, kg: arredondar(lotes.reduce((s, l) => s + l.saldoKg, 0), 3) };
  });
}

/** Aba "Por produto e local": saldo e valor por produto × local, e a ocupação de cada local. */
export function resumoProdutoLocal(todos: LinhaEstoque[]) {
  const porChave = new Map<string, { produto: string; local: string; saldoKg: number; valor: number }>();
  for (const l of todos.filter((x) => x.saldoKg > 0)) {
    const produto = `${l.codigo.split("-")[0]} · ${l.produto}`;
    const chave = `${produto}|${l.local}`;
    const linha = porChave.get(chave) ?? { produto, local: l.local, saldoKg: 0, valor: 0 };
    linha.saldoKg += l.saldoKg;
    linha.valor += l.saldoKg * l.custoKg;
    porChave.set(chave, linha);
  }
  const linhas = [...porChave.values()]
    .map((l) => ({ ...l, saldoKg: arredondar(l.saldoKg, 3), valor: arredondar(l.valor, 2) }))
    .sort((a, b) => a.produto.localeCompare(b.produto) || a.local.localeCompare(b.local));
  const locais = LOCAIS.map((local) => {
    const saldoKg = arredondar(
      linhas.filter((l) => l.local === local.nome).reduce((s, l) => s + l.saldoKg, 0),
      3,
    );
    return { ...local, saldoKg, ocupacao: local.capacidadeKg ? saldoKg / local.capacidadeKg : null };
  });
  return { linhas, locais };
}

export function CenaEstoque({ valores }: PropsCena) {
  const visao = valores["est.abas"] === "resumo" ? "resumo" : "lotes";
  const { todos, visiveis } = lotesDaCena(valores);
  const cartoes = resumoDosCartoes(todos);
  const statusAtivo = visao === "lotes" ? statusDoRotulo(valores["est.status"]) : undefined;
  const liberado = valores["est.liberado"] === "sim";
  const totalKg = visiveis.reduce((s, l) => s + Math.max(0, l.saldoKg), 0);
  const totalValor = visiveis.reduce((s, l) => s + l.valor, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Estoque</p>
        <p className="text-sm text-muted-foreground">
          Saldo por lote, em ordem de validade (o que vence primeiro sai primeiro).
        </p>
      </div>

      <Alvo nome="est.cards" className="grid grid-cols-1 gap-3 p-1 sm:grid-cols-3">
        {cartoes.map(({ status, quantidade, kg }) => {
          const cartao = (
            <div
              className={cn(
                "rounded-lg border border-l-4 bg-card p-3",
                COR_CARTAO[status],
                statusAtivo === status && "ring-2 ring-primary",
              )}
            >
              <p className="text-sm text-muted-foreground">{ROTULOS_STATUS_LOTE[status]}</p>
              <p className="text-lg font-semibold tabular-nums">
                {quantidade} {quantidade === 1 ? "lote" : "lotes"}
              </p>
              <p className="text-sm tabular-nums text-muted-foreground">{KG.format(kg)} kg</p>
            </div>
          );
          return status === "VENCIDO" ? (
            <Alvo key={status} nome="est.cardVencido">
              {cartao}
            </Alvo>
          ) : (
            <div key={status}>{cartao}</div>
          );
        })}
      </Alvo>

      <Alvo nome="est.abas" className="flex flex-wrap gap-2 p-1">
        <BotaoSimulado variant={visao === "lotes" ? "default" : "outline"} size="sm">
          Por lote
        </BotaoSimulado>
        <BotaoSimulado variant={visao === "resumo" ? "default" : "outline"} size="sm">
          Por produto e local
        </BotaoSimulado>
      </Alvo>

      {visao === "lotes" ? (
        <>
          <Alvo nome="est.filtros" className="flex flex-wrap items-end gap-3 p-1">
            <SelectSimulado compacto rotulo="Produto" valor="Todos" className="w-48" />
            <SelectSimulado compacto rotulo="Local" valor="Todos" className="w-48" />
            <SelectSimulado
              compacto
              alvo="est.status"
              rotulo="Status"
              valor={valores["est.status"] ?? "Todos"}
              className="w-48"
            />
            <CampoSimulado
              compacto
              alvo="est.referencia"
              rotulo="Data de referência"
              valor={valores["est.referencia"] ?? HOJE}
              className="w-40"
            />
            <Alvo nome="est.zerados" className="flex h-9 items-center gap-2 px-1 text-sm">
              <span
                className={cn(
                  "size-4 rounded border border-input",
                  valores["est.zerados"] === "sim" && "border-primary bg-primary",
                )}
              />
              Mostrar zerados
            </Alvo>
            <BotaoSimulado variant="ghost" size="sm">
              Limpar filtros
            </BotaoSimulado>
          </Alvo>
          <Alvo nome="est.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
            <span>Exportar CSV</span>
            <span>Exportar Excel</span>
            <span>Exportar PDF</span>
          </Alvo>

          <Alvo nome="est.tabela" className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Saldo (kg)</TableHead>
                  <TableHead className="text-right">Custo/kg</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum lote com esses filtros.
                    </TableCell>
                  </TableRow>
                ) : null}
                {visiveis.map((l) => {
                  const ehLiberacao = l.codigo === LIBERACAO.lote;
                  const liberavel = l.saldoKg > 0 && l.vencidoHoje;
                  const linhaLiberada = ehLiberacao && liberado;
                  const codigo = <span className="underline decoration-dotted underline-offset-4">{l.codigo}</span>;
                  return (
                    <TableRow key={l.codigo}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {l.codigo === TRANSFERENCIA.lote ? (
                          <Alvo nome="est.lote" className="inline-block px-1">
                            {codigo}
                          </Alvo>
                        ) : l.codigo === TRANSFERENCIA.filho ? (
                          <Alvo nome="est.filho" className="inline-block px-1">
                            {codigo}
                          </Alvo>
                        ) : (
                          codigo
                        )}
                      </TableCell>
                      <TableCell>{l.produto}</TableCell>
                      <TableCell>{l.local}</TableCell>
                      <TableCell>{l.data}</TableCell>
                      <TableCell>{formatarIso(l.validade)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", l.dias < 0 && "text-destructive")}>
                        {ehLiberacao ? (
                          <Alvo nome="est.dias" className="inline-block px-1">
                            {l.dias}
                          </Alvo>
                        ) : (
                          l.dias
                        )}
                      </TableCell>
                      <TableCell>
                        {l.codigo.startsWith("AMR") ? (
                          <Alvo nome="est.statusLote" className="inline-flex p-0.5">
                            <Badge variant={VARIANTE_STATUS[l.status]}>{ROTULOS_STATUS_LOTE[l.status]}</Badge>
                          </Alvo>
                        ) : (
                          <Badge variant={VARIANTE_STATUS[l.status]}>{ROTULOS_STATUS_LOTE[l.status]}</Badge>
                        )}
                        {linhaLiberada ? (
                          <Alvo nome="est.liberado" className="mt-1 p-0.5">
                            <p className="text-xs text-muted-foreground">
                              Movimentação liberada até {LIBERACAO.liberadoAte}
                            </p>
                          </Alvo>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{KG.format(l.saldoKg)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(l.custoKg)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <BotaoSimulado variant="outline" size="sm">
                            Etiqueta
                          </BotaoSimulado>
                          {l.saldoKg > 0 ? (
                            <BotaoSimulado
                              alvo={l.codigo === TRANSFERENCIA.lote ? "est.transferir" : undefined}
                              variant="outline"
                              size="sm"
                            >
                              Transferir
                            </BotaoSimulado>
                          ) : null}
                          {liberavel && linhaLiberada ? (
                            <BotaoSimulado alvo="est.revogar" variant="outline" size="sm">
                              Revogar
                            </BotaoSimulado>
                          ) : null}
                          {liberavel && !linhaLiberada ? (
                            <BotaoSimulado alvo={ehLiberacao ? "est.liberar" : undefined} variant="outline" size="sm">
                              Liberar
                            </BotaoSimulado>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {visiveis.length > 0 ? (
                <tfoot>
                  <TableRow className="font-medium">
                    <TableCell colSpan={7}>Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Alvo nome="est.total" className="inline-block px-1">
                        {KG.format(totalKg)}
                      </Alvo>
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">{formatarMoeda(totalValor)}</TableCell>
                    <TableCell />
                  </TableRow>
                </tfoot>
              ) : null}
            </Table>
          </Alvo>
        </>
      ) : (
        <VisaoResumo todos={todos} />
      )}
    </div>
  );
}

function VisaoResumo({ todos }: { todos: LinhaEstoque[] }) {
  const { linhas, locais } = resumoProdutoLocal(todos);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-primary">
        <span>Exportar CSV</span>
        <span>Exportar Excel</span>
        <span>Exportar PDF</span>
      </div>
      <Alvo nome="est.produtoLocal" className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Local</TableHead>
              <TableHead className="text-right">Saldo (kg)</TableHead>
              <TableHead className="text-right">Valor a custo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={`${l.produto}-${l.local}`}>
                <TableCell>{l.produto}</TableCell>
                <TableCell>{l.local}</TableCell>
                <TableCell className="text-right tabular-nums">{KG.format(l.saldoKg)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Alvo>

      <Alvo nome="est.ocupacao" className="p-1">
        <p className="mb-2 text-sm font-semibold">Ocupação dos locais</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Local</TableHead>
                <TableHead className="text-right">Saldo (kg)</TableHead>
                <TableHead className="text-right">Capacidade (kg)</TableHead>
                <TableHead className="text-right">Ocupação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locais.map((l) => (
                <TableRow key={l.nome}>
                  <TableCell>{l.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{KG.format(l.saldoKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.capacidadeKg === null ? "—" : KG.format(l.capacidadeKg)}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", (l.ocupacao ?? 0) > 1 && "text-destructive")}>
                    {l.ocupacao === null ? "—" : PERCENTUAL.format(l.ocupacao)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Alvo>
    </div>
  );
}

export function CenaTransferir({ valores }: PropsCena) {
  const lote = LOTES.find((l) => l.codigo === TRANSFERENCIA.lote)!;
  return (
    <JanelaSimulada titulo={`Transferir lote ${lote.codigo}`}>
      <Alvo nome="transf.aviso" className="p-1">
        <p className="text-sm text-muted-foreground">
          Com o saldo inteiro, o lote só muda de local. Com parte dele, a parte vira o lote {lote.codigo}/N no novo
          local (ou soma no lote desta família que já estiver lá).
        </p>
      </Alvo>
      <SelectSimulado
        alvo="transf.local"
        rotulo="Novo local"
        valor={valores["transf.local"] ?? "Selecione o local"}
      />
      <Alvo nome="transf.kg" className="space-y-2">
        <CampoSimulado rotulo="Quantidade (kg)" valor={valores["transf.kg"] ?? String(lote.saldoKg)} />
        <p className="text-xs text-muted-foreground">Saldo do lote: {KG.format(lote.saldoKg)} kg</p>
      </Alvo>
      <BotaoSimulado alvo="transf.confirmar" largo>
        Transferir
      </BotaoSimulado>
    </JanelaSimulada>
  );
}

export function CenaLiberar({ valores }: PropsCena) {
  const situacao = valores["lib.prazo"];
  return (
    <JanelaSimulada titulo={`Liberar lote vencido ${LIBERACAO.lote}`}>
      {situacao === "sem-prazo" ? (
        <Alvo nome="lib.prazo" className="space-y-3 p-1 text-sm">
          <p>Configure os dias de liberação após vencimento no cadastro do produto.</p>
          <BotaoSimulado variant="outline" size="sm">
            Editar produto
          </BotaoSimulado>
        </Alvo>
      ) : situacao === "encerrado" ? (
        <Alvo nome="lib.prazo" className="p-1">
          <p className="text-sm">
            O prazo máximo de liberação deste lote terminou em {LIBERACAO.limiteEncerrado}.
          </p>
        </Alvo>
      ) : (
        <>
          <Alvo nome="lib.prazo" className="p-1">
            <p className="text-sm">
              A movimentação ficará liberada até <strong>{LIBERACAO.liberadoAte}</strong> (validade +{" "}
              {LIBERACAO.dias} dias).
            </p>
          </Alvo>
          <CampoSimulado alvo="lib.motivo" rotulo="Motivo" valor={valores["lib.motivo"]} />
          <BotaoSimulado alvo="lib.confirmar" largo>
            Liberar
          </BotaoSimulado>
        </>
      )}
    </JanelaSimulada>
  );
}
