"use client";

import { useRef, useState } from "react";
import { useFormularioDaAcao } from "@/components/use-formulario-da-acao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CANAL_VENDA,
  FORMA_PAGAMENTO_VENDA,
  MODALIDADE_CARTAO,
  ROTULOS_CANAL_VENDA,
  ROTULOS_CLASSIFICACAO_FISCAL,
  ROTULOS_FORMA_PAGAMENTO_VENDA,
  ROTULOS_MODALIDADE_CARTAO,
  SEM_VALOR,
} from "@/lib/schemas/enums";
import {
  calcularRepasses,
  condicaoParaVenda,
  type CondicaoCartao,
  type ModalidadeCartaoValor,
} from "@/lib/producao/cartao";
import {
  calcularItem,
  calcularPedido,
  gerarParcelasPorPrazos,
  interpretarPrazos,
  validarParcelasVenda,
  vencimentoNaVenda,
} from "@/lib/producao/venda";
import { paraKg } from "@/lib/producao/unidade";
import { paraDataIso } from "@/lib/producao/periodo";
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
  /** `validade` e `liberadoAte` em `AAAA-MM-DD`. */
  lotes: (Omit<LoteParaVenda, "validade" | "liberadoAte"> & { validade: string; liberadoAte: string | null })[];
  contaCaixaPadraoId: string | null;
  contaRecebimentoPadraoId: string | null;
  /** Operadoras ativas da filial, para a venda na maquininha. */
  operadoras: { id: string; nome: string; condicoes: CondicaoCartao[] }[];
};

type ItemForm = {
  chave: number;
  loteId: string;
  unidade: "KG" | "COMERCIAL";
  quantidade: string;
  precoKg: string;
};

/** Parcela a prazo como está nos campos: `AAAA-MM-DD` e valor digitado. */
type ParcelaForm = { dataVencimento: string; valor: string };

const dataDeCalendario = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const ESTADO_INICIAL: FormState = {};
const KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** Final do rótulo do lote na lista: acompanha a data do pedido (a liberação vale por ela). */
function rotuloDoVencimento(lote: { validade: string; liberadoAte: string | null }, data: string): string {
  const situacao = vencimentoNaVenda(lote, data);
  if (situacao === "NO_PRAZO") return "";
  if (situacao === "LIBERADO") return ` · VENCIDO · liberado até ${formatarData(lote.liberadoAte!)}`;
  // Liberação que não cobre a data do pedido: diz até quando valia, para a pessoa entender.
  return lote.liberadoAte
    ? ` · VENCIDO · liberado só até ${formatarData(lote.liberadoAte)}`
    : " · VENCIDO · sem liberação";
}

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

const itemVazio = (chave: number): ItemForm => ({
  chave,
  loteId: "",
  unidade: "KG",
  quantidade: "",
  precoKg: "",
});

export function PedidoForm({ opcoes }: { opcoes: OpcoesPedido }) {
  const [state, formAction, pendente] = useFormularioDaAcao(criarPedidoAction, ESTADO_INICIAL);

  const [data, setData] = useState(opcoes.hoje);
  const [clienteId, setClienteId] = useState("");
  const [canal, setCanal] = useState<string>(SEM_VALOR);
  const [forma, setForma] = useState<FormaPagamento>("PIX");
  const [contaId, setContaId] = useState(opcoes.contaRecebimentoPadraoId ?? "");
  const [operadoraId, setOperadoraId] = useState(opcoes.operadoras.length === 1 ? opcoes.operadoras[0].id : "");
  const [modalidade, setModalidade] = useState<ModalidadeCartaoValor | "">("");
  const [parcelasCartao, setParcelasCartao] = useState("2");
  const [prazos, setPrazos] = useState("");
  // Ajuste manual das parcelas: vale só enquanto prazos, data e total forem os de quando foi feito.
  const [ajuste, setAjuste] = useState<{ chave: string; linhas: ParcelaForm[] } | null>(null);
  const [classificacao, setClassificacao] = useState<Classificacao>("GERENCIAL");
  const [retira, setRetira] = useState(true);
  const [endereco, setEndereco] = useState("");
  // A chave da primeira linha é fixa: servidor e navegador precisam gerar o mesmo HTML.
  const [itens, setItens] = useState<ItemForm[]>(() => [itemVazio(1)]);
  const proximaChave = useRef(2);

  const naMaquininha = forma === "CARTAO";
  const aPrazo = forma === "A_PRAZO";
  const aVista = !aPrazo && !naMaquininha;
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
    const situacao = lote ? vencimentoNaVenda(lote, data) : "NO_PRAZO";
    const vencido = situacao !== "NO_PRAZO";
    const liberadoAte = situacao === "LIBERADO" ? lote!.liberadoAte : null;
    return { item, lote, quantidadeKg, precoKg, calculo, vencido, liberadoAte };
  });
  const completas = linhas.filter((l) => l.calculo && l.lote);
  const totais = calcularPedido(
    completas.map((l) => ({ quantidadeKg: l.quantidadeKg, precoKg: l.precoKg, custoKg: l.lote!.custoKg })),
  );
  // Maquininha: a prévia usa o mesmo cálculo do servidor (RN-35).
  const operadora = opcoes.operadoras.find((o) => o.id === operadoraId);
  const modalidadesDaOperadora = MODALIDADE_CARTAO.filter((m) => operadora?.condicoes.some((c) => c.modalidade === m));
  const nParcelasCartao = modalidade === "CREDITO_PARCELADO" ? Number(parcelasCartao) : 1;
  const condicaoCartao =
    operadora && modalidade ? condicaoParaVenda(operadora.condicoes, modalidade, nParcelasCartao) : null;
  const repassesPrevia =
    naMaquininha && condicaoCartao && totais.valor > 0 && data
      ? calcularRepasses(dataDeCalendario(data), totais.valor, condicaoCartao, nParcelasCartao)
      : [];
  const opcoesParcelasCartao = (operadora?.condicoes ?? [])
    .filter((c) => c.modalidade === "CREDITO_PARCELADO")
    .flatMap((c) => Array.from({ length: c.parcelasAte - c.parcelasDe + 1 }, (_, i) => c.parcelasDe + i));

  const leituraPrazos = interpretarPrazos(prazos);
  const chaveParcelas = `${prazos}|${data}|${totais.valor}`;
  const geradas: ParcelaForm[] =
    aPrazo && leituraPrazos.ok && totais.valor > 0 && data
      ? gerarParcelasPorPrazos(dataDeCalendario(data), totais.valor, leituraPrazos.prazos).map((p) => ({
          dataVencimento: paraDataIso(p.dataVencimento),
          valor: p.valor.toFixed(2),
        }))
      : [];
  const parcelas = ajuste?.chave === chaveParcelas ? ajuste.linhas : geradas;
  const somaParcelas = parcelas.reduce((acc, p) => acc + Math.round((numero(p.valor) || 0) * 100), 0) / 100;
  const erroParcelas =
    !aPrazo || parcelas.length === 0
      ? null
      : validarParcelasVenda(
          dataDeCalendario(data),
          totais.valor,
          parcelas.map((p) => ({ dataVencimento: dataDeCalendario(p.dataVencimento), valor: numero(p.valor) })),
        );

  // A soma já aparece no rodapé: para a soma errada basta dizer quanto falta ou sobra.
  const diferencaParcelas = Math.round((totais.valor - somaParcelas) * 100) / 100;
  const avisoParcelas =
    erroParcelas && diferencaParcelas !== 0 && erroParcelas.startsWith("A soma")
      ? `${diferencaParcelas > 0 ? "faltam" : "sobram"} ${formatarMoeda(Math.abs(diferencaParcelas))}`
      : erroParcelas;

  function mudarParcela(indice: number, mudanca: Partial<ParcelaForm>) {
    setAjuste({ chave: chaveParcelas, linhas: parcelas.map((p, i) => (i === indice ? { ...p, ...mudanca } : p)) });
  }

  const itensJson = JSON.stringify(
    linhas
      .filter((l) => l.item.loteId)
      .map((l) => ({
        loteId: l.item.loteId,
        quantidadeKg: Number.isFinite(l.quantidadeKg) ? l.quantidadeKg : null,
        precoKg: Number.isFinite(l.precoKg) ? l.precoKg : null,
      })),
  );

  return (
    <form onSubmit={formAction} className="space-y-6">
      <input type="hidden" name="itens" value={itensJson} />
      <input type="hidden" name="retiraNaPropriedade" value={retira ? "true" : "false"} />
      <input type="hidden" name="formaPagamento" value={forma} />
      {aPrazo ? (
        <input
          type="hidden"
          name="parcelas"
          value={JSON.stringify(parcelas.map((p) => ({ dataVencimento: p.dataVencimento, valor: numero(p.valor) })))}
        />
      ) : null}
      {naMaquininha ? (
        <>
          <input type="hidden" name="operadoraCartaoId" value={operadoraId} />
          <input type="hidden" name="modalidadeCartao" value={modalidade} />
          <input type="hidden" name="parcelasCartao" value={modalidade === "CREDITO_PARCELADO" ? parcelasCartao : ""} />
        </>
      ) : null}

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
        ) : aPrazo ? (
          <Campo id="prazos" rotulo="Prazos (dias)">
            <Input
              id="prazos"
              value={prazos}
              placeholder="28/56"
              inputMode="numeric"
              onChange={(e) => setPrazos(e.target.value)}
              aria-describedby="prazos-ajuda"
              required
            />
            {prazos.trim() !== "" && !leituraPrazos.ok ? (
              <p id="prazos-ajuda" className="text-xs text-destructive">
                {leituraPrazos.erro}
              </p>
            ) : (
              <p id="prazos-ajuda" className="text-xs text-muted-foreground">
                Dias desde a data do pedido, separados por barra. 0 = no dia.
              </p>
            )}
          </Campo>
        ) : (
          <>
            <Campo id="operadoraCartao" rotulo="Operadora">
              <Select
                value={operadoraId || null}
                onValueChange={(v) => {
                  setOperadoraId(v ?? "");
                  setModalidade("");
                }}
              >
                <SelectTrigger id="operadoraCartao" className="w-full">
                  <SelectValue placeholder="Selecione a operadora" />
                </SelectTrigger>
                <SelectContent>
                  {opcoes.operadoras.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo id="modalidadeCartao" rotulo="Modalidade">
              <Select
                value={modalidade || null}
                onValueChange={(v) => setModalidade((v ?? "") as ModalidadeCartaoValor | "")}
              >
                <SelectTrigger id="modalidadeCartao" className="w-full">
                  <SelectValue placeholder="Selecione a modalidade" />
                </SelectTrigger>
                <SelectContent>
                  {modalidadesDaOperadora.map((m) => (
                    <SelectItem key={m} value={m}>
                      {ROTULOS_MODALIDADE_CARTAO[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            {modalidade === "CREDITO_PARCELADO" ? (
              <Campo id="parcelasCartao" rotulo="Parcelas">
                <Select value={parcelasCartao} onValueChange={(v) => v && setParcelasCartao(v)}>
                  <SelectTrigger id="parcelasCartao" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesParcelasCartao.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}x
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            ) : null}
            {opcoes.operadoras.length === 0 ? (
              <p className="text-sm text-destructive sm:col-span-2">
                Nenhuma operadora ativa: cadastre em Cadastros → Operadoras de cartão.
              </p>
            ) : null}
          </>
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
        {linhas.map(({ item, lote, quantidadeKg, calculo, vencido, liberadoAte }, indice) => {
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
                          {rotuloDoVencimento(l, data)}
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
              {vencido && liberadoAte ? (
                <p className="text-sm text-muted-foreground">Liberado até {formatarData(liberadoAte)}</p>
              ) : null}
              {vencido && !liberadoAte ? (
                <p className="text-sm text-destructive">Lote vencido: peça a liberação ao gestor na tela de Estoque.</p>
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
        <Button type="button" variant="outline" onClick={() => setItens((atuais) => [...atuais, itemVazio(proximaChave.current++)])}>
          Adicionar item
        </Button>
      </section>

      {aPrazo && parcelas.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Parcelas</h2>
          {parcelas.map((parcela, indice) => (
            <div key={indice} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2">
              <span className="text-sm text-muted-foreground tabular-nums">{indice + 1}</span>
              <Input
                type="date"
                aria-label={`Vencimento da parcela ${indice + 1}`}
                value={parcela.dataVencimento}
                min={data}
                onChange={(e) => mudarParcela(indice, { dataVencimento: e.target.value })}
              />
              <Input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                aria-label={`Valor da parcela ${indice + 1}`}
                value={parcela.valor}
                onChange={(e) => mudarParcela(indice, { valor: e.target.value })}
              />
            </div>
          ))}
          <p className={`text-sm tabular-nums ${erroParcelas ? "text-destructive" : "text-muted-foreground"}`}>
            Soma {formatarMoeda(somaParcelas)} de {formatarMoeda(totais.valor)}
            {avisoParcelas ? ` · ${avisoParcelas}` : ""}
          </p>
        </section>
      ) : null}

      {repassesPrevia.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Repasses previstos</h2>
          {repassesPrevia.map((r) => (
            <p key={r.numero} className="text-sm tabular-nums">
              {repassesPrevia.length > 1 ? `${r.numero}º · ` : ""}
              {formatarData(r.data)} · bruto {formatarMoeda(r.bruto)} · taxa {formatarMoeda(r.taxa)} · líquido{" "}
              {formatarMoeda(r.liquido)}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">
            A operadora deposita o líquido. Confirme cada repasse em Financeiro → Repasses de cartão.
          </p>
        </section>
      ) : naMaquininha && operadora && modalidade && !condicaoCartao ? (
        <p className="text-sm text-destructive">
          A {operadora.nome} não tem condição para {ROTULOS_MODALIDADE_CARTAO[modalidade]}
          {modalidade === "CREDITO_PARCELADO" ? ` em ${nParcelasCartao}x` : ""}.
        </p>
      ) : null}

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
      <Button
        type="submit"
        className="w-full sm:w-auto"
        disabled={
          pendente || (aPrazo && (parcelas.length === 0 || erroParcelas !== null)) || (naMaquininha && !condicaoCartao)
        }
      >
        {pendente ? "Salvando..." : "Salvar pedido"}
      </Button>
    </form>
  );
}
