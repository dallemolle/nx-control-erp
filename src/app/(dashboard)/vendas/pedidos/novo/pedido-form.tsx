"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CANAL_VENDA,
  FORMA_PAGAMENTO_VENDA,
  ROTULOS_CANAL_VENDA,
  ROTULOS_CLASSIFICACAO_FISCAL,
  ROTULOS_FORMA_PAGAMENTO_VENDA,
  SEM_VALOR,
} from "@/lib/schemas/enums";
import { calcularItem, calcularPedido } from "@/lib/producao/venda";
import { paraKg } from "@/lib/producao/unidade";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import type { LoteParaVenda } from "@/server/services/pedidoVenda";
import { criarPedidoAction, type FormState } from "../actions";

type FormaPagamento = (typeof FORMA_PAGAMENTO_VENDA)[number];
type Classificacao = "FISCAL" | "GERENCIAL";

export type OpcoesPedido = {
  hoje: string;
  clientes: {
    id: string;
    nome: string;
    canalVenda: (typeof CANAL_VENDA)[number] | null;
    classificacaoFiscalPadrao: Classificacao | null;
    enderecoEntrega: string | null;
    retiraNaPropriedade: boolean;
  }[];
  contas: { id: string; tipo: string; rotulo: string }[];
  /** `validade` em `AAAA-MM-DD`. */
  lotes: (Omit<LoteParaVenda, "validade"> & { validade: string })[];
  contaCaixaPadraoId: string | null;
  contaRecebimentoPadraoId: string | null;
  podeLiberarVencido: boolean;
};

type ItemForm = {
  chave: number;
  loteId: string;
  unidade: "KG" | "COMERCIAL";
  quantidade: string;
  precoKg: string;
  motivo: string;
};

const ESTADO_INICIAL: FormState = {};
const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

function numero(valor: string): number {
  return valor.trim() === "" ? NaN : Number(valor);
}

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  );
}

let proximaChave = 1;
const itemVazio = (): ItemForm => ({
  chave: proximaChave++,
  loteId: "",
  unidade: "KG",
  quantidade: "",
  precoKg: "",
  motivo: "",
});

export function PedidoForm({ opcoes }: { opcoes: OpcoesPedido }) {
  const [state, formAction, pendente] = useActionState(criarPedidoAction, ESTADO_INICIAL);

  const [data, setData] = useState(opcoes.hoje);
  const [clienteId, setClienteId] = useState("");
  const [canal, setCanal] = useState<string>(SEM_VALOR);
  const [forma, setForma] = useState<FormaPagamento>("PIX");
  const [contaId, setContaId] = useState(opcoes.contaRecebimentoPadraoId ?? "");
  const [vencimento, setVencimento] = useState("");
  const [classificacao, setClassificacao] = useState<Classificacao>("GERENCIAL");
  const [retira, setRetira] = useState(true);
  const [endereco, setEndereco] = useState("");
  const [itens, setItens] = useState<ItemForm[]>(() => [itemVazio()]);

  const aVista = forma !== "A_PRAZO";
  const contasDaForma = opcoes.contas.filter((c) => (forma === "DINHEIRO" ? c.tipo === "CAIXA" : c.tipo !== "CAIXA"));
  const lotesPorId = new Map(opcoes.lotes.map((l) => [l.id, l]));

  function aoEscolherCliente(id: string) {
    setClienteId(id);
    const cliente = opcoes.clientes.find((c) => c.id === id);
    if (!cliente) return;
    setCanal(cliente.canalVenda ?? SEM_VALOR);
    setClassificacao(cliente.classificacaoFiscalPadrao ?? "GERENCIAL");
    setRetira(cliente.retiraNaPropriedade);
    setEndereco(cliente.enderecoEntrega ?? "");
  }

  function aoEscolherForma(nova: FormaPagamento) {
    setForma(nova);
    if (nova === "DINHEIRO") setContaId(opcoes.contaCaixaPadraoId ?? "");
    else if (nova !== "A_PRAZO") setContaId(opcoes.contaRecebimentoPadraoId ?? "");
  }

  function mudarItem(chave: number, mudanca: Partial<ItemForm>) {
    setItens((atuais) => atuais.map((item) => (item.chave === chave ? { ...item, ...mudanca } : item)));
  }

  function aoEscolherLote(chave: number, loteId: string) {
    const lote = lotesPorId.get(loteId);
    mudarItem(chave, {
      loteId,
      unidade: "KG",
      precoKg: lote?.produto.precoReferenciaKg ? String(lote.produto.precoReferenciaKg) : "",
      motivo: "",
    });
  }

  // Linhas já em kg, com o custo do lote, para o resumo e para o servidor.
  const linhas = itens.map((item) => {
    const lote = lotesPorId.get(item.loteId);
    const fator = item.unidade === "COMERCIAL" ? (lote?.produto.fatorUnidadeKg ?? null) : null;
    const quantidade = numero(item.quantidade);
    const quantidadeKg = Number.isFinite(quantidade) ? paraKg(quantidade, fator) : NaN;
    const precoKg = numero(item.precoKg);
    const calculo =
      lote && Number.isFinite(quantidadeKg) && Number.isFinite(precoKg)
        ? calcularItem({ quantidadeKg, precoKg, custoKg: lote.custoKg })
        : null;
    return { item, lote, quantidadeKg, precoKg, calculo, vencido: lote ? lote.validade < data : false };
  });
  const completas = linhas.filter((l) => l.calculo && l.lote);
  const totais = calcularPedido(
    completas.map((l) => ({ quantidadeKg: l.quantidadeKg, precoKg: l.precoKg, custoKg: l.lote!.custoKg })),
  );
  const itensJson = JSON.stringify(
    linhas
      .filter((l) => l.item.loteId)
      .map((l) => ({
        loteId: l.item.loteId,
        quantidadeKg: Number.isFinite(l.quantidadeKg) ? l.quantidadeKg : null,
        precoKg: Number.isFinite(l.precoKg) ? l.precoKg : null,
        motivoLiberacaoVencido: l.vencido ? l.item.motivo : "",
      })),
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="itens" value={itensJson} />
      <input type="hidden" name="retiraNaPropriedade" value={retira ? "true" : "false"} />
      <input type="hidden" name="formaPagamento" value={forma} />

      <section className="grid gap-4 sm:grid-cols-2">
        <Campo id="data" rotulo="Data">
          <Input id="data" name="data" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </Campo>
        <Campo id="clienteId" rotulo="Cliente">
          <Select name="clienteId" value={clienteId || null} onValueChange={(v) => aoEscolherCliente(v ?? "")}>
            <SelectTrigger id="clienteId" className="w-full">
              <SelectValue placeholder="Selecione o cliente" />
            </SelectTrigger>
            <SelectContent>
              {opcoes.clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <Campo id="canal" rotulo="Canal">
          <Select name="canal" value={canal} onValueChange={(v) => setCanal(v ?? SEM_VALOR)}>
            <SelectTrigger id="canal" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_VALOR}>Não informado</SelectItem>
              {CANAL_VENDA.map((c) => (
                <SelectItem key={c} value={c}>
                  {ROTULOS_CANAL_VENDA[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <Campo id="formaPagamentoSelect" rotulo="Forma de pagamento">
          <Select value={forma} onValueChange={(v) => v && aoEscolherForma(v as FormaPagamento)}>
            <SelectTrigger id="formaPagamentoSelect" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMA_PAGAMENTO_VENDA.map((f) => (
                <SelectItem key={f} value={f}>
                  {ROTULOS_FORMA_PAGAMENTO_VENDA[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        {aVista ? (
          <Campo id="contaBancariaId" rotulo={forma === "DINHEIRO" ? "Conta Caixa" : "Conta de recebimento"}>
            <Select name="contaBancariaId" value={contaId || null} onValueChange={(v) => setContaId(v ?? "")}>
              <SelectTrigger id="contaBancariaId" className="w-full">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {contasDaForma.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        ) : (
          <Campo id="vencimento" rotulo="Vencimento">
            <Input
              id="vencimento"
              name="vencimento"
              type="date"
              value={vencimento}
              min={data}
              onChange={(e) => setVencimento(e.target.value)}
              required
            />
          </Campo>
        )}
        <Campo id="classificacaoFiscal" rotulo="Classificação">
          <Select
            name="classificacaoFiscal"
            value={classificacao}
            onValueChange={(v) => v && setClassificacao(v as Classificacao)}
          >
            <SelectTrigger id="classificacaoFiscal" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GERENCIAL">{ROTULOS_CLASSIFICACAO_FISCAL.GERENCIAL}</SelectItem>
              <SelectItem value="FISCAL">{ROTULOS_CLASSIFICACAO_FISCAL.FISCAL}</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        {classificacao === "FISCAL" ? (
          <Campo id="numeroDocumentoFiscal" rotulo="Nº da nota fiscal">
            <Input id="numeroDocumentoFiscal" name="numeroDocumentoFiscal" placeholder="Opcional" />
          </Campo>
        ) : null}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="size-4"
            checked={retira}
            onChange={(e) => setRetira(e.target.checked)}
          />
          Retira na propriedade
        </label>
        {!retira ? (
          <>
            <Campo id="entregaDataPrevista" rotulo="Entrega prevista para">
              <Input id="entregaDataPrevista" name="entregaDataPrevista" type="date" defaultValue={data} min={data} />
            </Campo>
            <Campo id="entregaEndereco" rotulo="Endereço da entrega">
              <Input
                id="entregaEndereco"
                name="entregaEndereco"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
              />
            </Campo>
          </>
        ) : null}
        <div className="sm:col-span-2">
          <Campo id="observacao" rotulo="Observação">
            <Input id="observacao" name="observacao" />
          </Campo>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Itens</h2>
        {linhas.map(({ item, lote, quantidadeKg, calculo, vencido }, indice) => {
          const usados = new Set(itens.filter((i) => i.chave !== item.chave).map((i) => i.loteId));
          const temUnidade = Boolean(lote?.produto.unidadeComercial && lote.produto.fatorUnidadeKg);
          const acimaDoSaldo = lote && Number.isFinite(quantidadeKg) && quantidadeKg > lote.saldoKg;
          return (
            <div key={item.chave} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Item {indice + 1}</span>
                {itens.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setItens((atuais) => atuais.filter((i) => i.chave !== item.chave))}
                  >
                    Remover
                  </Button>
                ) : null}
              </div>
              <Campo id={`lote-${item.chave}`} rotulo="Lote">
                <Select value={item.loteId || null} onValueChange={(v) => aoEscolherLote(item.chave, v ?? "")}>
                  <SelectTrigger id={`lote-${item.chave}`} className="w-full">
                    <SelectValue placeholder="Selecione o lote" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoes.lotes
                      .filter((l) => !usados.has(l.id))
                      .map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.codigo} · {l.produto.descricao} · {KG.format(l.saldoKg)} kg · vence{" "}
                          {formatarData(l.validade)}
                          {l.validade < data ? " · VENCIDO" : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Campo>
              <div className="grid gap-3 sm:grid-cols-3">
                {temUnidade ? (
                  <Campo id={`unidade-${item.chave}`} rotulo="Unidade">
                    <Select
                      value={item.unidade}
                      onValueChange={(v) => v && mudarItem(item.chave, { unidade: v as ItemForm["unidade"] })}
                    >
                      <SelectTrigger id={`unidade-${item.chave}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="KG">kg</SelectItem>
                        <SelectItem value="COMERCIAL">{lote?.produto.unidadeComercial}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Campo>
                ) : null}
                <Campo id={`quantidade-${item.chave}`} rotulo="Quantidade">
                  <Input
                    id={`quantidade-${item.chave}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={item.quantidade}
                    onChange={(e) => mudarItem(item.chave, { quantidade: e.target.value })}
                  />
                </Campo>
                <Campo id={`preco-${item.chave}`} rotulo="Preço (R$/kg)">
                  <Input
                    id={`preco-${item.chave}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.0001"
                    value={item.precoKg}
                    onChange={(e) => mudarItem(item.chave, { precoKg: e.target.value })}
                  />
                </Campo>
              </div>
              {item.unidade === "COMERCIAL" && Number.isFinite(quantidadeKg) ? (
                <p className="text-xs text-muted-foreground">= {KG.format(quantidadeKg)} kg</p>
              ) : null}
              {acimaDoSaldo ? (
                <p className="text-sm text-destructive">Acima do saldo do lote ({KG.format(lote.saldoKg)} kg).</p>
              ) : null}
              {vencido && opcoes.podeLiberarVencido ? (
                <Campo id={`motivo-${item.chave}`} rotulo="Motivo da liberação do lote vencido">
                  <Input
                    id={`motivo-${item.chave}`}
                    value={item.motivo}
                    onChange={(e) => mudarItem(item.chave, { motivo: e.target.value })}
                    required
                  />
                </Campo>
              ) : null}
              {vencido && !opcoes.podeLiberarVencido ? (
                <p className="text-sm text-destructive">Lote vencido: só gestor ou administrador libera.</p>
              ) : null}
              {calculo ? (
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <div>
                    <dt className="inline text-muted-foreground">Valor </dt>
                    <dd className="inline font-medium tabular-nums">{formatarMoeda(calculo.valor)}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted-foreground">Custo </dt>
                    <dd className="inline tabular-nums">{formatarMoeda(calculo.custo)}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted-foreground">Margem </dt>
                    <dd className="inline tabular-nums">{formatarMoeda(calculo.margem)}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          );
        })}
        <Button type="button" variant="outline" onClick={() => setItens((atuais) => [...atuais, itemVazio()])}>
          Adicionar item
        </Button>
      </section>

      <section className="rounded-lg border bg-muted/40 p-3">
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="text-base font-semibold tabular-nums">{formatarMoeda(totais.valor)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Custo</dt>
            <dd className="tabular-nums">{formatarMoeda(totais.custo)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Margem</dt>
            <dd className="tabular-nums">{formatarMoeda(totais.margem)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Margem %</dt>
            <dd className="tabular-nums">{PERCENTUAL.format(totais.margemPercentual)}</dd>
          </div>
        </dl>
      </section>

      {state.erro ? <p className="text-sm text-destructive">{state.erro}</p> : null}
      <Button type="submit" className="w-full sm:w-auto" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar pedido"}
      </Button>
    </form>
  );
}
