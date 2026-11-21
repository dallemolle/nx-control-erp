"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Alvo,
  BotaoSimulado,
  CampoSimulado,
  JanelaSimulada,
  SelectSimulado,
} from "@/components/ajuda/campos-simulados";
import type { PropsCena, Valores } from "@/ajuda/tipos";
import { formatarMoeda } from "@/lib/formatacao";
import { calcularRepasses, condicaoParaVenda } from "@/lib/producao/cartao";
import {
  calcularItem,
  calcularPedido,
  gerarParcelasPorPrazos,
  interpretarPrazos,
  validarParcelasVenda,
} from "@/lib/producao/venda";
import { cn } from "@/lib/utils";
import {
  CLIENTES,
  CONTA_RECEBIMENTO,
  HOJE,
  LOTES,
  MOTORISTA,
  OPERADORA,
  PARCELAS_131,
  PEDIDOS,
  PERIODO,
  PRECO_REFERENCIA,
  VENDEDORA,
  pedido as pedidoDoExemplo,
  type ClienteExemplo,
  type LoteParaVenda,
  type PedidoExemplo,
} from "./exemplo";

// Espelho de src/app/(dashboard)/vendas/pedidos/* (lista, novo/pedido-form.tsx, [numero] e pedido-acoes.tsx) e de
// vendas/_shared/entrega-acoes.tsx. Mudou um rótulo, campo ou coluna lá? Ajuste aqui também.

const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** "DD/MM/AAAA" ↔ data de calendário em UTC, como o formulário trata as datas. */
export const deData = (texto: string) => {
  const [dia, mes, ano] = texto.split("/");
  return new Date(`${ano}-${mes}-${dia}T00:00:00.000Z`);
};
export const paraTexto = (data: Date) => data.toISOString().slice(0, 10).split("-").reverse().join("/");

const numero = (texto: string | undefined) =>
  texto === undefined || texto.trim() === "" ? NaN : Number(texto.replace(",", "."));

export const rotuloLote = (l: LoteParaVenda) =>
  `${l.codigo} · ${l.produto} · ${KG.format(l.saldoKg)} kg · vence ${l.validade}${l.vencido ? " · VENCIDO" : ""}`;

const loteDoCodigo = (codigo: string | undefined) => LOTES.find((l) => l.codigo === codigo);

/** Valor, custo e margem de um pedido do exemplo (um item só). */
export const totaisDoPedido = (p: PedidoExemplo) => calcularPedido([p.item]);

// ---------------------------------------------------------------- lista

type Situacao = "Pago" | "Em aberto" | "Cancelado";
const situacaoDe = (p: PedidoExemplo): Situacao =>
  p.cancelado ? "Cancelado" : p.forma === "A prazo" ? "Em aberto" : "Pago";

function SituacaoBadge({ situacao }: { situacao: Situacao }) {
  const variante = situacao === "Pago" ? "default" : situacao === "Em aberto" ? "secondary" : "outline";
  return <Badge variant={variante}>{situacao}</Badge>;
}

export function CenaLista({ valores }: PropsCena) {
  const cliente = valores["lista.cliente"];
  const status = valores["lista.status"];
  const situacao = valores["lista.situacao"];
  const linhas = PEDIDOS.filter(
    (p) =>
      (!cliente || p.cliente.nome === cliente) &&
      (!status || (status === "Cancelado") === p.cancelado) &&
      (!situacao || situacaoDe(p) === situacao),
  );
  const confirmados = linhas.filter((p) => !p.cancelado);
  const totais = calcularPedido(confirmados.map((p) => p.item));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Pedidos de venda</p>
          <p className="text-sm text-muted-foreground">
            Cada pedido baixa o estoque por lote e cria a conta a receber; à vista, já recebida.
          </p>
        </div>
        <BotaoSimulado alvo="lista.novo">Novo pedido</BotaoSimulado>
      </div>

      <Alvo nome="lista.filtros" className="flex flex-wrap items-end gap-3 p-1">
        <CampoSimulado compacto rotulo="De" valor={PERIODO.inicio} className="w-36" />
        <CampoSimulado compacto rotulo="Até" valor={PERIODO.fim} className="w-36" />
        <SelectSimulado compacto alvo="lista.cliente" rotulo="Cliente" valor={cliente ?? "Todos"} className="w-44" />
        <SelectSimulado compacto alvo="lista.status" rotulo="Status" valor={status ?? "Todos"} className="w-36" />
        <SelectSimulado
          compacto
          alvo="lista.situacao"
          rotulo="Pagamento"
          valor={situacao ?? "Todas"}
          className="w-36"
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
              <TableHead>Cliente</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Entrega</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum pedido no período.
                </TableCell>
              </TableRow>
            ) : null}
            {linhas.map((p) => {
              const t = totaisDoPedido(p);
              const numeroLink = <span className="text-primary">{p.numero}</span>;
              return (
                <TableRow key={p.numero} className={p.cancelado ? "text-muted-foreground" : undefined}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {p.numero === 127 ? (
                      <Alvo nome="lista.cancelado" className="inline-flex items-center px-1">
                        {numeroLink}
                        <Badge variant="destructive" className="ml-2">
                          Cancelado
                        </Badge>
                      </Alvo>
                    ) : p.numero === 128 ? (
                      <Alvo nome="lista.numero" className="inline-block px-1">
                        {numeroLink}
                      </Alvo>
                    ) : (
                      numeroLink
                    )}
                  </TableCell>
                  <TableCell>{p.data}</TableCell>
                  <TableCell>{p.cliente.nome}</TableCell>
                  <TableCell>{p.cliente.canal}</TableCell>
                  <TableCell>{p.forma}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(t.valor)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatarMoeda(t.margem)}{" "}
                    <span className="text-muted-foreground">({PERCENTUAL.format(t.margemPercentual)})</span>
                  </TableCell>
                  <TableCell>
                    {p.numero === 131 ? (
                      <Alvo nome="lista.pagamento" className="inline-block px-1">
                        <SituacaoBadge situacao={situacaoDe(p)} />
                      </Alvo>
                    ) : (
                      <SituacaoBadge situacao={situacaoDe(p)} />
                    )}
                  </TableCell>
                  <TableCell>
                    {p.numero === 131 ? (
                      <Alvo nome="lista.entrega" className="inline-block px-1">
                        {p.entrega}
                      </Alvo>
                    ) : (
                      (p.entrega ?? "Retira")
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {confirmados.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>
                  <Alvo nome="lista.rodape" className="inline-block px-1">
                    Total dos confirmados ({confirmados.length}) · custo {formatarMoeda(totais.custo)}
                  </Alvo>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(totais.valor)}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {formatarMoeda(totais.margem)}{" "}
                  <span className="text-muted-foreground">({PERCENTUAL.format(totais.margemPercentual)})</span>
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </Alvo>
    </div>
  );
}

// ---------------------------------------------------------------- novo pedido

const clienteDoNome = (nome: string | undefined): ClienteExemplo | undefined =>
  Object.values(CLIENTES).find((c) => c.nome === nome);

/** Estado do formulário montado a partir do que o roteiro já preencheu, com os mesmos cálculos do sistema. */
export function estadoDoFormulario(valores: Valores) {
  const data = valores["novo.data"] ?? HOJE;
  const cliente = clienteDoNome(valores["novo.cliente"]);
  const forma = valores["novo.forma"] ?? "Pix";
  const aPrazo = forma === "A prazo";
  const naMaquininha = forma.startsWith("Maquininha");
  const retira = valores["novo.retira"] ? valores["novo.retira"] === "sim" : (cliente?.retira ?? true);

  const lote = loteDoCodigo(valores["novo.lote"]);
  const preco =
    valores["novo.preco"] ?? (lote && PRECO_REFERENCIA[lote.produto] ? String(PRECO_REFERENCIA[lote.produto]) : "");
  const quantidadeKg = numero(valores["novo.quantidade"]);
  const precoKg = numero(preco);
  const item =
    lote && Number.isFinite(quantidadeKg) && Number.isFinite(precoKg)
      ? { quantidadeKg, precoKg, custoKg: lote.custoKg }
      : null;
  const calculo = item ? calcularItem(item) : null;
  const totais = calcularPedido(item ? [item] : []);

  const leitura = interpretarPrazos(valores["novo.prazos"] ?? "");
  const geradas =
    aPrazo && leitura.ok && totais.valor > 0
      ? gerarParcelasPorPrazos(deData(data), totais.valor, leitura.prazos).map((p) => ({
          vencimento: paraTexto(p.dataVencimento),
          valor: p.valor.toFixed(2),
        }))
      : [];
  const ajustes = [valores["novo.parcela1"], valores["novo.parcela2"]];
  const parcelas = geradas.map((p, i) => ({ ...p, valor: ajustes[i] ?? p.valor }));
  const soma = parcelas.reduce((acc, p) => acc + Math.round(numero(p.valor) * 100), 0) / 100;
  const erroParcelas =
    parcelas.length === 0
      ? null
      : validarParcelasVenda(
          deData(data),
          totais.valor,
          parcelas.map((p) => ({ dataVencimento: deData(p.vencimento), valor: numero(p.valor) })),
        );
  const diferenca = Math.round((totais.valor - soma) * 100) / 100;
  const aviso =
    erroParcelas && diferenca !== 0 && erroParcelas.startsWith("A soma")
      ? `${diferenca > 0 ? "faltam" : "sobram"} ${formatarMoeda(Math.abs(diferenca))}`
      : erroParcelas;

  const nParcelasCartao =
    valores["novo.modalidade"] === "Crédito parcelado" ? numero((valores["novo.parcelasCartao"] ?? "2x").replace("x", "")) : 1;
  const modalidade = (
    { "Débito": "DEBITO", "Crédito à vista": "CREDITO_VISTA", "Crédito parcelado": "CREDITO_PARCELADO" } as const
  )[valores["novo.modalidade"] ?? ""];
  const condicao =
    naMaquininha && valores["novo.operadora"] && modalidade
      ? condicaoParaVenda(OPERADORA.condicoes, modalidade, nParcelasCartao)
      : null;
  const repasses =
    condicao && totais.valor > 0 ? calcularRepasses(deData(data), totais.valor, condicao, nParcelasCartao) : [];

  return {
    data,
    cliente,
    forma,
    aPrazo,
    naMaquininha,
    retira,
    lote,
    preco,
    calculo,
    totais,
    leitura,
    parcelas,
    soma,
    erroParcelas,
    aviso,
    repasses,
  };
}

function Dl({ itens }: { itens: readonly [string, string][] }) {
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {itens.map(([rotulo, valor], i) => (
        <div key={rotulo}>
          <dt className="inline text-muted-foreground">{rotulo} </dt>
          <dd className={cn("inline tabular-nums", i === 0 && "font-medium")}>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CenaNovo({ valores }: PropsCena) {
  const f = estadoDoFormulario(valores);
  const prazos = valores["novo.prazos"] ?? "";
  const vencido = f.lote?.vencido ?? false;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold">Novo pedido</p>
        <p className="text-sm text-muted-foreground">Os lotes aparecem na ordem de saída (vence primeiro, sai primeiro).</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <CampoSimulado alvo="novo.data" rotulo="Data" valor={f.data} />
        <SelectSimulado alvo="novo.cliente" rotulo="Cliente" valor={f.cliente?.nome ?? "Selecione o cliente"} />
        <SelectSimulado alvo="novo.canal" rotulo="Canal" valor={f.cliente?.canal ?? "Não informado"} />
        <SelectSimulado alvo="novo.forma" rotulo="Forma de pagamento" valor={f.forma} />
        {f.aPrazo ? (
          <Alvo nome="novo.prazos" className="space-y-2">
            <span className="text-sm leading-none font-medium">Prazos (dias)</span>
            <CampoSimulado valor={prazos} placeholder="28/56" />
            {prazos.trim() !== "" && !f.leitura.ok ? (
              <p className="text-xs text-destructive">{f.leitura.erro}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Dias desde a data do pedido, separados por barra. 0 = no dia.</p>
            )}
          </Alvo>
        ) : f.naMaquininha ? (
          <>
            <SelectSimulado
              alvo="novo.operadora"
              rotulo="Operadora"
              valor={valores["novo.operadora"] ?? "Selecione a operadora"}
            />
            <SelectSimulado
              alvo="novo.modalidade"
              rotulo="Modalidade"
              valor={valores["novo.modalidade"] ?? "Selecione a modalidade"}
            />
            {valores["novo.modalidade"] === "Crédito parcelado" ? (
              <SelectSimulado alvo="novo.parcelasCartao" rotulo="Parcelas" valor={valores["novo.parcelasCartao"] ?? "2x"} />
            ) : null}
          </>
        ) : (
          <SelectSimulado
            alvo="novo.conta"
            rotulo={f.forma === "Dinheiro" ? "Conta Caixa" : "Conta de recebimento"}
            valor={valores["novo.conta"] ?? CONTA_RECEBIMENTO}
          />
        )}
        <SelectSimulado alvo="novo.classificacao" rotulo="Classificação" valor={valores["novo.classificacao"] ?? "Gerencial"} />
        <Alvo nome="novo.retira" className="flex items-center gap-2 p-1 text-sm sm:col-span-2">
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-sm border border-input text-[10px]",
              f.retira && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {f.retira ? "✓" : ""}
          </span>
          Retira na propriedade
        </Alvo>
        {!f.retira ? (
          <Alvo nome="novo.entrega" className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <CampoSimulado rotulo="Entrega prevista para" valor={f.data} />
            <CampoSimulado rotulo="Endereço da entrega" valor={f.cliente?.endereco ?? ""} />
          </Alvo>
        ) : null}
        <CampoSimulado rotulo="Observação" className="sm:col-span-2" />
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold">Itens</p>
        <div className="space-y-3 rounded-lg border p-3">
          <span className="text-xs text-muted-foreground">Item 1</span>
          <SelectSimulado alvo="novo.lote" rotulo="Lote" valor={f.lote ? rotuloLote(f.lote) : "Selecione o lote"} />
          <div className="grid gap-3 sm:grid-cols-3">
            <CampoSimulado alvo="novo.quantidade" rotulo="Quantidade" valor={valores["novo.quantidade"]} />
            <CampoSimulado alvo="novo.preco" rotulo="Preço (R$/kg)" valor={f.preco} />
          </div>
          {vencido && f.lote?.liberadoAte ? (
            <p className="text-sm text-muted-foreground">Liberado até {f.lote.liberadoAte}</p>
          ) : null}
          {vencido && !f.lote?.liberadoAte ? (
            <p className="text-sm text-destructive">Lote vencido: peça a liberação ao gestor na tela de Estoque.</p>
          ) : null}
          {f.calculo ? (
            <Alvo nome="novo.calculo" className="p-1">
              <Dl
                itens={[
                  ["Valor", formatarMoeda(f.calculo.valor)],
                  ["Custo", formatarMoeda(f.calculo.custo)],
                  ["Margem", formatarMoeda(f.calculo.margem)],
                ]}
              />
            </Alvo>
          ) : null}
        </div>
        <BotaoSimulado alvo="novo.adicionar" variant="outline">
          Adicionar item
        </BotaoSimulado>
      </section>

      {f.aPrazo && f.parcelas.length > 0 ? (
        <Alvo nome="novo.parcelas" className="space-y-2 p-1">
          <p className="text-sm font-semibold">Parcelas</p>
          {f.parcelas.map((p, i) => (
            <div key={i} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2">
              <span className="text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <CampoSimulado valor={p.vencimento} />
              <CampoSimulado alvo={i === 0 ? "novo.parcela1" : i === 1 ? "novo.parcela2" : undefined} valor={p.valor} />
            </div>
          ))}
          <Alvo nome="novo.somaParcelas" className="inline-block px-1">
            <p className={cn("text-sm tabular-nums", f.erroParcelas ? "text-destructive" : "text-muted-foreground")}>
              Soma {formatarMoeda(f.soma)} de {formatarMoeda(f.totais.valor)}
              {f.aviso ? ` · ${f.aviso}` : ""}
            </p>
          </Alvo>
        </Alvo>
      ) : null}

      {f.repasses.length > 0 ? (
        <Alvo nome="novo.repasses" className="space-y-2 p-1">
          <p className="text-sm font-semibold">Repasses previstos</p>
          {f.repasses.map((r) => (
            <p key={r.numero} className="text-sm tabular-nums">
              {f.repasses.length > 1 ? `${r.numero}º · ` : ""}
              {paraTexto(r.data)} · bruto {formatarMoeda(r.bruto)} · taxa {formatarMoeda(r.taxa)} · líquido{" "}
              {formatarMoeda(r.liquido)}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">
            A operadora deposita o líquido. Confirme cada repasse em Financeiro → Repasses de cartão.
          </p>
        </Alvo>
      ) : null}

      <Alvo nome="novo.totais" className="rounded-lg border bg-muted/40 p-3">
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="text-base font-semibold tabular-nums">{formatarMoeda(f.totais.valor)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Custo</dt>
            <dd className="tabular-nums">{formatarMoeda(f.totais.custo)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Margem</dt>
            <dd className="tabular-nums">{formatarMoeda(f.totais.margem)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Margem %</dt>
            <dd className="tabular-nums">{PERCENTUAL.format(f.totais.margemPercentual)}</dd>
          </div>
        </dl>
      </Alvo>

      <BotaoSimulado alvo="novo.salvar" className={cn(f.aPrazo && f.erroParcelas && "opacity-50")}>
        Salvar pedido
      </BotaoSimulado>
    </div>
  );
}

/** A lista do campo Lote aberta, para mostrar a ordem e os lotes vencidos. */
export function CenaLotes() {
  return (
    <div className="mx-auto max-w-2xl space-y-2">
      <SelectSimulado rotulo="Lote" valor="Selecione o lote" />
      <Alvo nome="lotes.lista" className="rounded-lg bg-popover p-1 text-sm shadow-md ring-1 ring-foreground/10">
        {LOTES.map((l) => {
          const linha = <p className="rounded-md px-2 py-1.5">{rotuloLote(l)}</p>;
          if (l.codigo === "FC-261117-01") return <Alvo key={l.codigo} nome="lotes.liberado">{linha}</Alvo>;
          if (l.codigo === "AMR-261118-01") return <Alvo key={l.codigo} nome="lotes.vencido">{linha}</Alvo>;
          return <div key={l.codigo}>{linha}</div>;
        })}
      </Alvo>
    </div>
  );
}

// ---------------------------------------------------------------- detalhe do pedido

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export const MOTIVO_BLOQUEIO = "O recebimento já foi conciliado com o extrato. Desconcilie na Conciliação antes de cancelar";

export function CenaPedido({ valores }: PropsCena) {
  const p = pedidoDoExemplo(Number(valores["pedido.cabecalho"] ?? 128));
  // O 127 aparece confirmado até o roteiro cancelá-lo (aviso = "cancelado").
  const cancelado = p.numero === 127 ? valores["pedido.aviso"] === "cancelado" : p.cancelado;
  const bloqueado = valores["pedido.cancelar"] === "bloqueado";
  const t = totaisDoPedido(p);
  const situacao: Situacao = cancelado ? "Cancelado" : p.forma === "A prazo" ? "Em aberto" : "Pago";
  // Logo depois de salvar, a entrega ainda está pendente (o roteiro passa "Pendente").
  const entrega =
    p.numero === 127 ? (cancelado ? "Cancelada" : "Pendente") : p.entrega && (valores["pedido.entrega"] ?? p.entrega);
  const entregue = entrega === "Entregue";
  const parcelas =
    p.forma === "A prazo"
      ? PARCELAS_131.map((x) => ({ ...x, status: "Em aberto" }))
      : [{ vencimento: p.data, valor: t.valor, status: cancelado ? "Cancelada" : "Paga" }];
  const motivoDesabilitado = cancelado ? "O pedido já está cancelado" : bloqueado ? MOTIVO_BLOQUEIO : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Alvo nome="pedido.cabecalho" className="p-1">
          <p className="text-sm text-muted-foreground">Pedidos</p>
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            Pedido {p.numero}
            {cancelado ? <Badge variant="destructive">Cancelado</Badge> : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {p.data} · {p.cliente.nome}
          </p>
        </Alvo>
        <div className="flex flex-wrap items-center gap-2">
          <BotaoSimulado alvo="pedido.recibo" variant="outline">
            Recibo (PDF)
          </BotaoSimulado>
          {motivoDesabilitado ? (
            <Alvo nome="pedido.cancelar" className="flex flex-wrap items-center gap-2 p-1">
              <BotaoSimulado variant="outline" className="opacity-50">
                Cancelar pedido
              </BotaoSimulado>
              <span className="max-w-60 text-xs text-muted-foreground">{motivoDesabilitado}</span>
            </Alvo>
          ) : (
            <BotaoSimulado alvo="pedido.cancelar" variant="outline">
              Cancelar pedido
            </BotaoSimulado>
          )}
        </div>
      </div>

      {cancelado ? (
        <Alvo nome="pedido.aviso" className="rounded-lg border border-destructive/40 p-3 text-sm">
          Cancelado em {p.data}: {p.motivoCancelamento}
        </Alvo>
      ) : null}

      <Card>
        <CardContent>
          <Alvo nome="pedido.dados" className="p-1">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Dado rotulo="Canal">{p.cliente.canal}</Dado>
              <Dado rotulo="Forma de pagamento">{p.forma}</Dado>
              {p.forma === "A prazo" ? (
                <Dado rotulo="Condição">{p.condicao} dias</Dado>
              ) : (
                <Dado rotulo="Conta">{CONTA_RECEBIMENTO}</Dado>
              )}
              <Dado rotulo="Classificação">Gerencial</Dado>
              <Dado rotulo="Lançado por">{VENDEDORA}</Dado>
            </dl>
          </Alvo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Alvo nome="pedido.itens">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-right">kg</TableHead>
                  <TableHead className="text-right">R$/kg</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>{p.item.produto}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Alvo nome="pedido.lote" className="inline-block px-1 text-primary">
                      {p.item.lote}
                    </Alvo>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{KG.format(p.item.quantidadeKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(p.item.precoKg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(t.valor)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(t.custo)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(t.margem)}</TableCell>
                </TableRow>
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(t.valor)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(t.custo)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatarMoeda(t.margem)} ({PERCENTUAL.format(t.margemPercentual)})
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Alvo>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <Alvo nome="pedido.pagamento" className="space-y-3 p-1">
              <div className="flex items-center gap-2">
                <SituacaoBadge situacao={situacao} />
                <span className="text-sm text-muted-foreground">Conta a receber PV-{p.numero}</span>
              </div>
              {parcelas.map((x, i) => (
                <p key={i} className="text-sm tabular-nums">
                  {parcelas.length > 1 ? `${i + 1}ª · ` : ""}
                  Vence {x.vencimento} · {formatarMoeda(x.valor)}
                  {" · "}
                  <span className="whitespace-nowrap text-muted-foreground">{x.status}</span>
                </p>
              ))}
            </Alvo>
            <Alvo nome="pedido.verReceber" className="mt-2 inline-block px-1 text-sm text-primary">
              Ver em Contas a receber
            </Alvo>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entrega</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entrega ? (
              <>
                <Alvo nome="pedido.entrega" className="p-1">
                  <dl className="grid grid-cols-2 gap-3">
                    <Dado rotulo="Status">{entrega}</Dado>
                    <Dado rotulo="Prevista">{p.entregaPrevista}</Dado>
                    {entregue && p.entregueEm ? <Dado rotulo="Entregue em">{p.entregueEm}</Dado> : null}
                    <Dado rotulo="Endereço">{p.cliente.endereco ?? "—"}</Dado>
                    <Dado rotulo="Responsável">{entrega === "Pendente" || entrega === "Cancelada" ? "—" : MOTORISTA}</Dado>
                    {entregue && p.recebidoPor ? <Dado rotulo="Recebido por">{p.recebidoPor}</Dado> : null}
                  </dl>
                </Alvo>
                {entrega !== "Cancelada" ? (
                  <Alvo nome="pedido.acoesEntrega" className="flex flex-wrap justify-end gap-2 p-1">
                    {entrega === "Pendente" ? (
                      <BotaoSimulado variant="outline" size="sm">
                        Em rota
                      </BotaoSimulado>
                    ) : null}
                    {entrega !== "Entregue" ? (
                      <BotaoSimulado variant="outline" size="sm">
                        Entregue
                      </BotaoSimulado>
                    ) : null}
                    <BotaoSimulado variant="outline" size="sm">
                      Editar
                    </BotaoSimulado>
                  </Alvo>
                ) : null}
              </>
            ) : (
              <Alvo nome="pedido.entrega" className="p-1">
                <p className="text-sm text-muted-foreground">O cliente retira na propriedade.</p>
              </Alvo>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Observação</CardTitle>
        </CardHeader>
        <CardContent>
          <Alvo nome="pedido.observacao" className="space-y-2 p-1">
            <div className="min-h-16 w-full rounded-lg border border-input px-2.5 py-1.5 text-sm">
              {valores["pedido.observacao"] ?? ""}
            </div>
            <BotaoSimulado variant="outline" size="sm">
              Salvar observação
            </BotaoSimulado>
          </Alvo>
        </CardContent>
      </Card>
    </div>
  );
}

export function CenaCancelar({ valores }: PropsCena) {
  return (
    <JanelaSimulada titulo="Cancelar pedido 127">
      <Alvo nome="cancelar.aviso" className="p-1">
        <p className="text-sm text-muted-foreground">
          O estoque volta para os lotes, a conta a receber é cancelada e, se a venda foi à vista, o recebimento é
          desfeito. Para corrigir um pedido, cancele e lance de novo.
        </p>
      </Alvo>
      <CampoSimulado alvo="cancelar.motivo" rotulo="Motivo" valor={valores["cancelar.motivo"]} />
      <BotaoSimulado alvo="cancelar.confirmar" variant="destructive" largo>
        Cancelar pedido
      </BotaoSimulado>
    </JanelaSimulada>
  );
}
