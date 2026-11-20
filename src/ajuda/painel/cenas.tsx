"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alvo, CampoSimulado } from "@/components/ajuda/campos-simulados";
import { formatarMoeda } from "@/lib/formatacao";
import { arredondar } from "@/lib/producao/arredondar";
import { agregarEstoque, agregarOPs, agregarRecepcoes, agregarVendas } from "@/lib/producao/painel";
import { statusDoLote } from "@/lib/producao/statusLote";
import { cn } from "@/lib/utils";
// Os cartões são os da própria tela: o mesmo visual e a mesma formatação.
import { Bloco, fmt, Indicador } from "@/app/(dashboard)/producao/painel/cartoes";
import {
  ALERTAS_CONFIG,
  A_RECEBER,
  ENTREGAS,
  FRUTAS,
  HOJE_ISO,
  ITENS_VENDIDOS,
  LOTES,
  OPS,
  PERIODO,
  PRODUTOS,
  RECEPCOES,
} from "./exemplo";

// Espelho de src/app/(dashboard)/producao/painel/page.tsx. Mudou um indicador ou alerta lá? Ajuste aqui também.

/** Os números do painel do exemplo, pelas mesmas funções que o servidor usa. */
export function calcularPainel() {
  const hoje = new Date(`${HOJE_ISO}T00:00:00.000Z`);
  const rec = agregarRecepcoes([...RECEPCOES]);
  const proc = agregarOPs(OPS.map((op) => ({ ...op })));
  const vendas = agregarVendas(
    ITENS_VENDIDOS.map((i) => ({
      pedidoId: String(i.pedido),
      produtoId: i.produtoId,
      categoria: PRODUTOS[i.produtoId].categoria,
      frutaId: PRODUTOS[i.produtoId].frutaId,
      quantidadeKg: i.quantidadeKg,
      precoKg: i.precoKg,
      custoKg: i.custoKg,
    })),
  );
  const estoque = agregarEstoque(
    LOTES.map((l) => ({
      produtoId: l.produtoId,
      categoria: PRODUTOS[l.produtoId].categoria,
      status: statusDoLote(
        { saldoKg: l.saldoKg, validade: new Date(`${l.validade}T00:00:00.000Z`), conservacao: l.conservacao },
        hoje,
        ALERTAS_CONFIG,
      ),
      saldoKg: l.saldoKg,
      valor: arredondar(Math.max(0, l.saldoKg) * l.custoKg, 2),
    })),
  );
  const porFruta = FRUTAS.flatMap((f) => {
    const recepcao = rec.porFruta.get(f.id) ?? null;
    const processamento = proc.porFruta.get(f.id) ?? null;
    const faturamentoPolpa = vendas.polpaPorFruta.get(f.id);
    if (!recepcao && !processamento && faturamentoPolpa === undefined) return [];
    return [{ fruta: f.nome, recepcao, processamento, faturamentoPolpa: faturamentoPolpa ?? 0 }];
  });
  return { rec, proc, vendas, estoque, porFruta };
}

/** Alerta sem link (na tela, o cartão destacado abre a lista filtrada). */
function Alerta({ rotulo, quantidade, detalhe }: { rotulo: string; quantidade: number; detalhe?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        quantidade > 0 && "border-l-4 border-l-amber-500",
      )}
    >
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{fmt.n(quantidade)}</p>
      {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}

export function CenaPainel() {
  const { rec, proc, vendas, estoque, porFruta } = calcularPainel();
  const p = { recepcao: rec.total, processamento: proc.total, vendas: vendas.total };
  const linhas = <T,>(valor: (f: (typeof porFruta)[number]) => T | null | undefined, formatar: (v: T) => string) =>
    porFruta.flatMap((f) => {
      const v = valor(f);
      return v === null || v === undefined ? [] : [{ fruta: f.fruta, valor: formatar(v) }];
    });
  const estoquePorProduto = [...estoque.porProduto]
    .map(([id, v]) => ({ produto: PRODUTOS[id].rotulo, ...v }))
    .sort((a, b) => a.produto.localeCompare(b.produto));
  const vendasPorProduto = [...vendas.porProduto]
    .map(([id, v]) => ({ produto: PRODUTOS[id].rotulo, ...v }))
    .sort((a, b) => b.faturamento - a.faturamento || a.produto.localeCompare(b.produto));

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-lg font-semibold">Painel de produção</p>
        <p className="text-sm text-muted-foreground">
          {PERIODO.inicio} a {PERIODO.fim}. Estoque, entregas e a receber na data de hoje.
        </p>
      </div>

      <div className="space-y-3">
        <Alvo nome="painel.periodo" className="flex flex-wrap items-end gap-3 p-1">
          <CampoSimulado compacto rotulo="De" valor={PERIODO.inicio} className="w-40" />
          <CampoSimulado compacto rotulo="Até" valor={PERIODO.fim} className="w-40" />
        </Alvo>
        <Alvo nome="painel.atalhos" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Mês atual</span>
          <span>Mês anterior</span>
          <span>Ano</span>
        </Alvo>
        <Alvo nome="painel.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Exportar CSV</span>
          <span>Exportar Excel</span>
          <span>Exportar PDF</span>
        </Alvo>
      </div>

      <Bloco titulo="Recepção e processamento">
        <Alvo nome="rec.recebido">
          <Indicador
            rotulo="Fruto recebido"
            valor={fmt.kg(p.recepcao.recebidoKg)}
            porFruta={linhas((f) => f.recepcao?.recebidoKg, fmt.kg)}
          />
        </Alvo>
        <Alvo nome="rec.terceiros">
          <Indicador
            rotulo="De terceiros"
            valor={fmt.pct(p.recepcao.percentualTerceiros)}
            porFruta={linhas((f) => f.recepcao && f.recepcao.percentualTerceiros, (v: number) => fmt.pct(v))}
          />
        </Alvo>
        <Alvo nome="rec.descarte">
          <Indicador
            rotulo="Descarte na triagem"
            valor={fmt.pct(p.recepcao.percentualDescarte)}
            porFruta={linhas((f) => f.recepcao && f.recepcao.percentualDescarte, (v: number) => fmt.pct(v))}
          />
        </Alvo>
        <Alvo nome="rec.ops">
          <Indicador rotulo="Nº de OPs" valor={fmt.n(p.processamento.quantidade)} />
        </Alvo>
        <Indicador
          rotulo="Fruto processado"
          valor={fmt.kg(p.processamento.frutoKg)}
          porFruta={linhas((f) => f.processamento?.frutoKg, fmt.kg)}
        />
        <Indicador
          rotulo="Polpa produzida"
          valor={fmt.kg(p.processamento.polpaKg)}
          porFruta={linhas((f) => f.processamento?.polpaKg, fmt.kg)}
        />
        <Alvo nome="rec.rendimento">
          <Indicador
            rotulo="Rendimento"
            valor={fmt.pct(p.processamento.rendimento)}
            porFruta={linhas((f) => f.processamento && f.processamento.rendimento, (v: number) => fmt.pct(v))}
          />
        </Alvo>
        <Alvo nome="rec.custo">
          <Indicador
            rotulo="Custo médio da polpa"
            valor={fmt.moedaKg(p.processamento.custoMedioPolpa)}
            nota="Só OPs encerradas."
            porFruta={linhas(
              (f) => f.processamento && f.processamento.custoMedioPolpa,
              (v: number) => fmt.moedaKg(v),
            )}
          />
        </Alvo>
      </Bloco>

      <Bloco titulo="Vendas">
        <Alvo nome="ven.faturamento">
          <Indicador
            rotulo="Faturamento"
            valor={formatarMoeda(p.vendas.faturamento)}
            porFruta={[
              { fruta: "Fruto in natura", valor: formatarMoeda(p.vendas.faturamentoInNatura) },
              ...porFruta
                .filter((f) => f.faturamentoPolpa > 0)
                .map((f) => ({ fruta: `Polpa de ${f.fruta.toLowerCase()}`, valor: formatarMoeda(f.faturamentoPolpa) })),
            ]}
          />
        </Alvo>
        <Alvo nome="ven.kg">
          <Indicador
            rotulo="Kg vendidos"
            valor={fmt.kg(p.vendas.kgVendidos)}
            nota={`Preço médio ${fmt.moedaKg(p.vendas.precoMedio)}`}
          />
        </Alvo>
        <Alvo nome="ven.pedidos">
          <Indicador
            rotulo="Pedidos"
            valor={fmt.n(p.vendas.pedidos)}
            nota={`Ticket médio ${fmt.moeda(p.vendas.ticketMedio)}`}
          />
        </Alvo>
        <Alvo nome="ven.margem">
          <Indicador
            rotulo="Margem bruta"
            valor={formatarMoeda(p.vendas.margem)}
            nota={`${fmt.pct(p.vendas.margemPercentual)} do faturamento`}
          />
        </Alvo>
        <Alvo nome="ven.aReceber">
          <Indicador rotulo="A receber em aberto" valor={formatarMoeda(A_RECEBER)} nota="Posição de hoje." />
        </Alvo>
      </Bloco>

      <Bloco titulo="Estoque e alertas">
        <Alvo nome="est.polpa">
          <Indicador rotulo="Estoque de polpa" valor={fmt.kg(estoque.polpaKg)} />
        </Alvo>
        <Alvo nome="est.fruto">
          <Indicador rotulo="Fruto aguardando" valor={fmt.kg(estoque.frutoAguardandoKg)} nota="Não vencido." />
        </Alvo>
        <Alvo nome="est.valor">
          <Indicador rotulo="Valor do estoque" valor={formatarMoeda(estoque.valor)} nota="A custo." />
        </Alvo>
        <Alerta
          rotulo="Lotes vencendo"
          quantidade={estoque.vencendo.quantidade}
          detalhe={fmt.kg(estoque.vencendo.kg)}
        />
        <Alvo nome="alerta.vencidos">
          <Alerta
            rotulo="Lotes vencidos com saldo"
            quantidade={estoque.vencidos.quantidade}
            detalhe={fmt.kg(estoque.vencidos.kg)}
          />
        </Alvo>
        <Alvo nome="alerta.entregas">
          <Alerta rotulo="Entregas pendentes ou em rota" quantidade={ENTREGAS.abertas} />
        </Alvo>
        <Alerta rotulo="Entregas com atraso" quantidade={ENTREGAS.atrasadas} />
        <Alvo nome="alerta.opsBalanco">
          <Alerta rotulo="OPs com balanço a verificar" quantidade={proc.opsBalanco} />
        </Alvo>
        <Alvo nome="alerta.grupo">
          <Alerta rotulo="OPs com branqueamento a verificar" quantidade={proc.opsBranqueamento} />
        </Alvo>
      </Bloco>

      <div className="grid gap-6 lg:grid-cols-2">
        <Alvo nome="tab.estoque" className="space-y-2 p-1">
          <p className="text-sm font-semibold">Estoque atual por produto</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estoquePorProduto.map((l) => (
                  <TableRow key={l.produto}>
                    <TableCell>{l.produto}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.kg(l.saldoKg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Alvo>
        <Alvo nome="tab.vendas" className="space-y-2 p-1">
          <p className="text-sm font-semibold">Vendas do período por produto</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Kg</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendasPorProduto.map((l) => (
                  <TableRow key={l.produto}>
                    <TableCell>{l.produto}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.kg(l.kg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(l.faturamento)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Alvo>
      </div>
    </div>
  );
}
