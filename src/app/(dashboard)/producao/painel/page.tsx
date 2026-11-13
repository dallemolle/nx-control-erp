import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { buscarPainelProducao } from "@/server/services/relatorioProducao/painel";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { hojeDeCalendario, paraDataIso, periodoDaUrl } from "@/lib/producao/periodo";
import { ExportarLinks } from "../../_shared/exportar-links";
import { BarraDeFiltros } from "../_shared/barra-de-filtros";
import { atalhosDePeriodo } from "../_shared/atalhos";
import { Alerta, Bloco, fmt, Indicador } from "./cartoes";

type Parametros = { inicio?: string; fim?: string };

export default async function PainelProducaoPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "producao:ler");

  const periodo = periodoDaUrl(await searchParams);
  const hoje = hojeDeCalendario();
  const p = await buscarPainelProducao(sessao, periodo, hoje);

  const inicio = paraDataIso(periodo.inicio);
  const fim = paraDataIso(periodo.fim);
  const query = new URLSearchParams({ inicio, fim }).toString();
  const porFruta = <T,>(valor: (f: (typeof p.porFruta)[number]) => T | null | undefined, formatar: (v: T) => string) =>
    p.porFruta.flatMap((f) => {
      const v = valor(f);
      return v === null || v === undefined ? [] : [{ fruta: f.fruta, valor: formatar(v) }];
    });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Painel de produção</h1>
        <p className="text-sm text-muted-foreground">
          {formatarData(periodo.inicio)} a {formatarData(periodo.fim)}. Estoque, entregas e a receber na data de hoje.
        </p>
      </div>

      <div className="space-y-3">
        <BarraDeFiltros
          valores={{ inicio, fim }}
          campos={[
            { tipo: "data", campo: "inicio", rotulo: "De" },
            { tipo: "data", campo: "fim", rotulo: "Até" },
          ]}
        />
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {atalhosDePeriodo(hoje).map((a) => (
            <Link
              key={a.rotulo}
              href={`/producao/painel?inicio=${a.inicio}&fim=${a.fim}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {a.rotulo}
            </Link>
          ))}
        </div>
        <ExportarLinks baseHref="/producao/painel/export" queryString={query} />
      </div>

      <Bloco titulo="Recepção e processamento">
        <Indicador
          rotulo="Fruto recebido"
          valor={fmt.kg(p.recepcao.recebidoKg)}
          porFruta={porFruta((f) => f.recepcao?.recebidoKg, fmt.kg)}
        />
        <Indicador
          rotulo="De terceiros"
          valor={fmt.pct(p.recepcao.percentualTerceiros)}
          porFruta={porFruta((f) => f.recepcao && f.recepcao.percentualTerceiros, (v: number) => fmt.pct(v))}
        />
        <Indicador
          rotulo="Descarte na triagem"
          valor={fmt.pct(p.recepcao.percentualDescarte)}
          porFruta={porFruta((f) => f.recepcao && f.recepcao.percentualDescarte, (v: number) => fmt.pct(v))}
        />
        <Indicador rotulo="Nº de OPs" valor={fmt.n(p.processamento.quantidade)} />
        <Indicador
          rotulo="Fruto processado"
          valor={fmt.kg(p.processamento.frutoKg)}
          porFruta={porFruta((f) => f.processamento?.frutoKg, fmt.kg)}
        />
        <Indicador
          rotulo="Polpa produzida"
          valor={fmt.kg(p.processamento.polpaKg)}
          porFruta={porFruta((f) => f.processamento?.polpaKg, fmt.kg)}
        />
        <Indicador
          rotulo="Rendimento"
          valor={fmt.pct(p.processamento.rendimento)}
          porFruta={porFruta((f) => f.processamento && f.processamento.rendimento, (v: number) => fmt.pct(v))}
        />
        <Indicador
          rotulo="Custo médio da polpa"
          valor={fmt.moedaKg(p.processamento.custoMedioPolpa)}
          nota="Só OPs encerradas."
          porFruta={porFruta((f) => f.processamento && f.processamento.custoMedioPolpa, (v: number) => fmt.moedaKg(v))}
        />
      </Bloco>

      <Bloco titulo="Vendas">
        <Indicador
          rotulo="Faturamento"
          valor={formatarMoeda(p.vendas.faturamento)}
          porFruta={[
            { fruta: "Fruto in natura", valor: formatarMoeda(p.vendas.faturamentoInNatura) },
            ...p.porFruta
              .filter((f) => f.faturamentoPolpa > 0)
              .map((f) => ({ fruta: `Polpa de ${f.fruta.toLowerCase()}`, valor: formatarMoeda(f.faturamentoPolpa) })),
          ]}
        />
        <Indicador rotulo="Kg vendidos" valor={fmt.kg(p.vendas.kgVendidos)} nota={`Preço médio ${fmt.moedaKg(p.vendas.precoMedio)}`} />
        <Indicador rotulo="Pedidos" valor={fmt.n(p.vendas.pedidos)} nota={`Ticket médio ${fmt.moeda(p.vendas.ticketMedio)}`} />
        <Indicador
          rotulo="Margem bruta"
          valor={formatarMoeda(p.vendas.margem)}
          nota={`${fmt.pct(p.vendas.margemPercentual)} do faturamento`}
        />
        <Indicador rotulo="A receber em aberto" valor={formatarMoeda(p.vendas.aReceber)} nota="Posição de hoje." />
      </Bloco>

      <Bloco titulo="Estoque e alertas">
        <Indicador rotulo="Estoque de polpa" valor={fmt.kg(p.estoque.polpaKg)} />
        <Indicador rotulo="Fruto aguardando" valor={fmt.kg(p.estoque.frutoAguardandoKg)} nota="Não vencido." />
        <Indicador rotulo="Valor do estoque" valor={formatarMoeda(p.estoque.valor)} nota="A custo." />
        <Alerta
          rotulo="Lotes vencendo"
          quantidade={p.alertas.lotesVencendo.quantidade}
          detalhe={fmt.kg(p.alertas.lotesVencendo.kg)}
          href="/producao/estoque?status=VENCENDO"
        />
        <Alerta
          rotulo="Lotes vencidos com saldo"
          quantidade={p.alertas.lotesVencidos.quantidade}
          detalhe={fmt.kg(p.alertas.lotesVencidos.kg)}
          href="/producao/estoque?status=VENCIDO"
        />
        <Alerta rotulo="Entregas pendentes ou em rota" quantidade={p.alertas.entregasAbertas} href="/vendas/entregas" />
        <Alerta rotulo="Entregas com atraso" quantidade={p.alertas.entregasAtrasadas} href="/vendas/entregas?atraso=1" />
        <Alerta
          rotulo="OPs com balanço a verificar"
          quantidade={p.alertas.opsBalanco}
          href={`/producao/processamento?verificar=balanco&${query}`}
        />
        <Alerta
          rotulo="OPs com branqueamento a verificar"
          quantidade={p.alertas.opsBranqueamento}
          href={`/producao/processamento?verificar=branqueamento&${query}`}
        />
      </Bloco>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Estoque atual por produto</h2>
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
                {p.estoquePorProduto.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      Sem estoque.
                    </TableCell>
                  </TableRow>
                ) : null}
                {p.estoquePorProduto.map((l) => (
                  <TableRow key={l.produtoId}>
                    <TableCell>{l.produto}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.kg(l.saldoKg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Vendas do período por produto</h2>
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
                {p.vendasPorProduto.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      Nada no período.
                    </TableCell>
                  </TableRow>
                ) : null}
                {p.vendasPorProduto.map((l) => (
                  <TableRow key={l.produtoId}>
                    <TableCell>{l.produto}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt.kg(l.kg)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(l.faturamento)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
