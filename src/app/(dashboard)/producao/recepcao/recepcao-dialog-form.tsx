"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  QUALIDADE_FRUTO,
  ROTULOS_CLASSIFICACAO_FISCAL,
  SEM_VALOR,
} from "@/lib/schemas/enums";
import { calcularRecepcao } from "@/lib/producao/recepcao";
import { calcularValidade } from "@/lib/producao/lote";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { paraDataIso } from "@/lib/producao/periodo";
import { criarRecepcaoAction, type EstadoNovaRecepcao } from "./actions";
import { useAcaoDoDialogo } from "../../_shared/use-acao-do-dialogo";

export type ProdutoRecepcao = {
  id: string;
  codigo: string;
  descricao: string;
  frutaId: string;
  validadeDias: number;
  unidadeComercial: string | null;
  fatorUnidadeKg: number | null;
  custoPadraoKg: number;
};

export type OpcoesRecepcao = {
  produtos: ProdutoRecepcao[];
  talhoes: { id: string; nome: string; frutaId: string }[];
  fornecedores: {
    id: string;
    nome: string;
    classificacaoFiscalPadrao: "FISCAL" | "GERENCIAL" | null;
  }[];
  locais: { id: string; nome: string; tipo: string }[];
  safras: { id: string; nome: string }[];
  prazoPagamentoProdutorDias: number;
  hoje: string;
};

const ESTADO_INICIAL: EstadoNovaRecepcao = {};
const UM_DIA_MS = 86_400_000;
const KG = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});
const PERCENTUAL = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

function numero(valor: string): number {
  return valor.trim() === "" ? NaN : Number(valor);
}

function somarDias(dataIso: string, dias: number): string {
  return paraDataIso(
    new Date(new Date(`${dataIso}T00:00:00.000Z`).getTime() + dias * UM_DIA_MS),
  );
}

function Campo({
  id,
  rotulo,
  children,
}: {
  id: string;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  );
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium tabular-nums">{valor}</dd>
    </div>
  );
}

export function NovaRecepcao({ opcoes }: { opcoes: OpcoesRecepcao }) {
  const { aberto, setAberto, state, formAction, pendente } = useAcaoDoDialogo(
    criarRecepcaoAction,
    ESTADO_INICIAL,
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      {state.sucesso && state.codigoLote ? (
        <p className="text-sm">
          Lote <span className="font-semibold">{state.codigoLote}</span> criado
          ·{" "}
          <Link
            href={`/producao/lotes/${state.loteId}/etiqueta`}
            target="_blank"
            className="text-primary underline-offset-4 hover:underline"
          >
            Imprimir etiqueta
          </Link>
        </p>
      ) : null}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger render={<Button />}>Nova recepção</DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova recepção de fruto</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="space-y-4">
            {/* A chave reinicia os campos depois de cada lote criado. */}
            <CamposRecepcao key={state.codigoLote ?? "nova"} opcoes={opcoes} />
            {state.erro ? (
              <p className="text-sm text-destructive">{state.erro}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pendente}>
              {pendente ? "Salvando..." : "Salvar recepção"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CamposRecepcao({ opcoes }: { opcoes: OpcoesRecepcao }) {
  const localPadrao =
    opcoes.locais.find((l) => l.tipo === "RECEPCAO") ?? opcoes.locais[0];
  const [data, setData] = useState(opcoes.hoje);
  const [produtoId, setProdutoId] = useState("");
  const [origem, setOrigem] = useState<"PROPRIA" | "TERCEIRO">("TERCEIRO");
  const [unidade, setUnidade] = useState<"KG" | "COMERCIAL">("KG");
  const [bruto, setBruto] = useState("");
  const [descarte, setDescarte] = useState("");
  const [preco, setPreco] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [talhaoId, setTalhaoId] = useState("");
  // Selects que mudam junto com outros campos ficam controlados: o Select sem
  // estado perdia a escolha quando o formulário era redesenhado.
  const [localId, setLocalId] = useState(localPadrao?.id ?? "");
  const [classificacao, setClassificacao] = useState<"FISCAL" | "GERENCIAL">(
    "GERENCIAL",
  );
  const [vencimentoManual, setVencimentoManual] = useState<string | null>(null);

  const produto = opcoes.produtos.find((p) => p.id === produtoId);
  const temUnidadeComercial = Boolean(
    produto?.unidadeComercial && produto.fatorUnidadeKg,
  );
  const unidadeEfetiva = temUnidadeComercial ? unidade : "KG";
  const fator =
    unidadeEfetiva === "COMERCIAL" ? (produto?.fatorUnidadeKg ?? null) : null;
  const nomeUnidade =
    unidadeEfetiva === "COMERCIAL" ? (produto?.unidadeComercial ?? "kg") : "kg";
  const talhoes = opcoes.talhoes.filter((t) => t.frutaId === produto?.frutaId);
  const vencimento =
    vencimentoManual ?? somarDias(data, opcoes.prazoPagamentoProdutorDias);

  // Resumo ao vivo com as mesmas contas do servidor.
  let resumo: ReturnType<typeof calcularRecepcao> | null = null;
  let erroResumo: string | null = null;
  const precoDigitado =
    origem === "PROPRIA"
      ? (produto?.custoPadraoKg ?? 0) * (fator ?? 1)
      : numero(preco);
  if (
    produto &&
    Number.isFinite(numero(bruto)) &&
    Number.isFinite(precoDigitado)
  ) {
    try {
      resumo = calcularRecepcao({
        bruto: numero(bruto),
        descarte: Number.isFinite(numero(descarte)) ? numero(descarte) : 0,
        preco: precoDigitado,
        fatorUnidadeKg: fator,
      });
    } catch (erro) {
      erroResumo = erro instanceof Error ? erro.message : null;
    }
  }

  function aoEscolherFornecedor(id: string) {
    setFornecedorId(id);
    const padrao = opcoes.fornecedores.find(
      (f) => f.id === id,
    )?.classificacaoFiscalPadrao;
    setClassificacao(padrao ?? "GERENCIAL");
  }

  return (
    <>
      <input type="hidden" name="unidade" value={unidadeEfetiva} />
      <input type="hidden" name="origem" value={origem} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="data" rotulo="Data">
          <Input
            id="data"
            name="data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </Campo>
        <Campo id="produtoId" rotulo="Produto">
          <Select
            name="produtoId"
            value={produtoId || null}
            onValueChange={(v) => {
              setProdutoId(v ?? "");
              // Talhão é da fruta do produto: trocar o produto invalida a escolha.
              setTalhaoId("");
            }}
          >
            <SelectTrigger id="produtoId" className="w-full">
              <SelectValue placeholder="Selecione o fruto" />
            </SelectTrigger>
            <SelectContent>
              {opcoes.produtos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.codigo} · {p.descricao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        {(["TERCEIRO", "PROPRIA"] as const).map((valor) => (
          <label key={valor} className="flex items-center gap-2">
            <input
              type="radio"
              className="size-4"
              checked={origem === valor}
              onChange={() => setOrigem(valor)}
            />
            {valor === "TERCEIRO"
              ? "Comprado de terceiro"
              : "Colhido nos talhões próprios"}
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {origem === "PROPRIA" ? (
          <Campo id="talhaoId" rotulo="Talhão">
            <Select name="talhaoId" value={talhaoId || null} onValueChange={(v) => setTalhaoId(v ?? "")}>
              <SelectTrigger id="talhaoId" className="w-full">
                <SelectValue
                  placeholder={
                    produto ? "Selecione o talhão" : "Escolha o produto antes"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {talhoes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        ) : (
          <Campo id="fornecedorId" rotulo="Fornecedor">
            <Select
              name="fornecedorId"
              value={fornecedorId || null}
              onValueChange={(v) => aoEscolherFornecedor(v ?? "")}
            >
              <SelectTrigger id="fornecedorId" className="w-full">
                <SelectValue placeholder="Selecione o fornecedor" />
              </SelectTrigger>
              <SelectContent>
                {opcoes.fornecedores.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        )}
        <Campo id="localId" rotulo="Local">
          <Select name="localId" value={localId || null} onValueChange={(v) => setLocalId(v ?? "")}>
            <SelectTrigger id="localId" className="w-full">
              <SelectValue placeholder="Selecione o local" />
            </SelectTrigger>
            <SelectContent>
              {opcoes.locais.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </div>

      {temUnidadeComercial ? (
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-muted-foreground">Lançar em</span>
          {(["COMERCIAL", "KG"] as const).map((valor) => (
            <label key={valor} className="flex items-center gap-2">
              <input
                type="radio"
                className="size-4"
                checked={unidade === valor}
                onChange={() => setUnidade(valor)}
              />
              {valor === "KG"
                ? "kg"
                : `${produto?.unidadeComercial} (${KG.format(produto?.fatorUnidadeKg ?? 0)} kg)`}
            </label>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="pesoBruto" rotulo={`Peso bruto (${nomeUnidade})`}>
          <Input
            id="pesoBruto"
            name="pesoBruto"
            type="number"
            min="0"
            step="0.001"
            value={bruto}
            onChange={(e) => setBruto(e.target.value)}
            required
          />
        </Campo>
        <Campo id="descarte" rotulo={`Descarte (${nomeUnidade})`}>
          <Input
            id="descarte"
            name="descarte"
            type="number"
            min="0"
            step="0.001"
            value={descarte}
            onChange={(e) => setDescarte(e.target.value)}
          />
        </Campo>
        {origem === "TERCEIRO" ? (
          <Campo id="preco" rotulo={`Preço (R$/${nomeUnidade})`}>
            <Input
              id="preco"
              name="preco"
              type="number"
              min="0"
              step="0.0001"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              required
            />
          </Campo>
        ) : null}
      </div>

      <dl className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
        {erroResumo ? (
          <p className="text-destructive">{erroResumo}</p>
        ) : (
          <>
            <LinhaResumo
              rotulo="Peso líquido"
              valor={resumo ? `${KG.format(resumo.liquidoKg)} kg` : "—"}
            />
            <LinhaResumo
              rotulo="Descarte"
              valor={
                resumo ? PERCENTUAL.format(resumo.percentualDescarte) : "—"
              }
            />
            <LinhaResumo
              rotulo={
                origem === "PROPRIA"
                  ? "Custo/kg (custo-padrão da fruta)"
                  : "Preço/kg"
              }
              valor={
                resumo
                  ? formatarMoeda(
                      origem === "PROPRIA"
                        ? (produto?.custoPadraoKg ?? 0)
                        : resumo.precoKg,
                    )
                  : "—"
              }
            />
            <LinhaResumo
              rotulo={
                origem === "PROPRIA"
                  ? "Valor (custo, sem conta a pagar)"
                  : "Valor a pagar"
              }
              valor={resumo ? formatarMoeda(resumo.valorTotal) : "—"}
            />
            <LinhaResumo
              rotulo="Validade"
              valor={
                produto && data
                  ? formatarData(
                      calcularValidade(
                        new Date(`${data}T00:00:00.000Z`),
                        produto.validadeDias,
                      ),
                    )
                  : "—"
              }
            />
          </>
        )}
        <p className="pt-1 text-xs text-muted-foreground">
          O número do lote é gerado ao salvar.
        </p>
      </dl>

      {origem === "TERCEIRO" ? (
        <>
          <Separator />
          <p className="text-sm font-medium">Conta a pagar</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="dataVencimento" rotulo="Vencimento">
              <Input
                id="dataVencimento"
                name="dataVencimento"
                type="date"
                value={vencimento}
                onChange={(e) => setVencimentoManual(e.target.value)}
              />
            </Campo>
            <Campo id="classificacaoFiscal" rotulo="Classificação">
              <Select
                name="classificacaoFiscal"
                value={classificacao}
                onValueChange={(v) =>
                  v && setClassificacao(v as "FISCAL" | "GERENCIAL")
                }
              >
                <SelectTrigger id="classificacaoFiscal" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GERENCIAL">
                    {ROTULOS_CLASSIFICACAO_FISCAL.GERENCIAL}
                  </SelectItem>
                  <SelectItem value="FISCAL">
                    {ROTULOS_CLASSIFICACAO_FISCAL.FISCAL}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            {classificacao === "FISCAL" ? (
              <Campo id="numeroNotaProdutor" rotulo="Nº da nota do produtor">
                <Input
                  id="numeroNotaProdutor"
                  name="numeroNotaProdutor"
                  required
                />
              </Campo>
            ) : null}
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            A conta a pagar só é criada quando o valor é maior que zero.
          </p>
        </>
      ) : null}

      <Separator />
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="qualidade" rotulo="Qualidade">
          <Select name="qualidade" defaultValue={SEM_VALOR}>
            <SelectTrigger id="qualidade" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_VALOR}>Não informada</SelectItem>
              {QUALIDADE_FRUTO.map((q) => (
                <SelectItem key={q} value={q}>
                  {q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <Campo id="documento" rotulo="Romaneio / NF">
          <Input id="documento" name="documento" />
        </Campo>
        <Campo id="safraId" rotulo="Safra">
          <Select name="safraId" defaultValue={SEM_VALOR}>
            <SelectTrigger id="safraId" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_VALOR}>Nenhuma</SelectItem>
              {opcoes.safras.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </div>
      <Campo id="observacao" rotulo="Observação">
        <Input id="observacao" name="observacao" />
      </Campo>
    </>
  );
}
