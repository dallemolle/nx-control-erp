"use client";

import { Alvo, CampoSimulado } from "@/components/ajuda/campos-simulados";
import { agregarProcessamento } from "@/lib/producao/relatoriosProcessamento";
// A tabela e a formatação são as da própria tela.
import { formatarCelula as f, TabelaRelatorio } from "@/app/(dashboard)/producao/relatorios/_shared/tabela";
import { FRUTAS, OPS, PERIODO } from "./exemplo";

// Espelho de src/app/(dashboard)/producao/relatorios/processamento/page.tsx. Mudou uma tabela lá? Ajuste aqui também.

/** O relatório do exemplo, pela mesma função que o servidor usa. */
export function montarRelatorio() {
  const { porFruta, total } = agregarProcessamento(
    OPS.map((op) => ({
      frutaId: op.frutaId,
      status: op.status,
      frutoKg: op.frutoKg,
      polpaKg: op.polpaKg,
      custoTotal: op.custoFrutoTotal + op.custoInsumosTotal,
      balancoVerificar: op.balancoVerificar,
      branqueamentoVerificar: op.branqueamentoVerificar,
      aguaLitros: op.aguaLitros,
      carocoResiduoKg: op.carocoResiduoKg,
      perdaKg: op.perdaKg,
      custoFrutoTotal: op.custoFrutoTotal,
      custoInsumosTotal: op.custoInsumosTotal,
    })),
  );
  return {
    porFruta: FRUTAS.flatMap((fr) => {
      const linha = porFruta.get(fr.id);
      return linha ? [{ ...linha, frutaId: fr.id, fruta: fr.nome }] : [];
    }),
    total,
  };
}

const n = (rotulo: string, detalhe?: string) => ({ rotulo, detalhe, numero: true });

export function CenaProcessamento() {
  const r = montarRelatorio();
  const t = r.total;
  const comEncerradas = r.porFruta.filter((l) => l.encerradas > 0);
  const semEncerradas = "Nenhuma OP encerrada no período.";

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-lg font-semibold">Relatório de processamento</p>
        <p className="text-sm text-muted-foreground">
          {PERIODO.inicio} a {PERIODO.fim}. OPs canceladas ficam fora. Volumes com OPs abertas e encerradas; mínimo,
          máximo, balanço e custo só com OPs encerradas.
        </p>
      </div>

      <div className="space-y-3">
        <Alvo nome="proc.periodo" className="flex flex-wrap items-end gap-3 p-1">
          <CampoSimulado compacto rotulo="De" valor={PERIODO.inicio} className="w-40" />
          <CampoSimulado compacto rotulo="Até" valor={PERIODO.fim} className="w-40" />
        </Alvo>
        <Alvo nome="proc.atalhos" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
          <span>Mês atual</span>
          <span>Mês anterior</span>
          <span>Ano</span>
        </Alvo>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Alvo nome="proc.exportar" className="flex flex-wrap gap-x-3 gap-y-1 p-1 text-sm text-primary">
            <span>Exportar CSV</span>
            <span>Exportar Excel</span>
            <span>Exportar PDF</span>
          </Alvo>
          <Alvo nome="proc.verOps" className="p-1 text-sm text-primary">
            Ver as OPs do período
          </Alvo>
        </div>
      </div>

      <Alvo nome="tab.resumo" className="p-1">
        <TabelaRelatorio
          titulo="Resumo por fruta"
          colunas={[
            { rotulo: "Fruta" },
            n("OPs"),
            n("Fruto", "kg"),
            n("Polpa", "kg"),
            n("Rendimento", "médio"),
            n("Rendimento mín.", "encerradas"),
            n("Rendimento máx.", "encerradas"),
            n("Custo médio", "R$/kg · encerradas"),
          ]}
          linhas={r.porFruta.map((l) => ({
            chave: l.frutaId,
            celulas: [
              l.fruta,
              f(l.volume.quantidade, "nº"),
              f(l.volume.frutoKg, "kg"),
              f(l.volume.polpaKg, "kg"),
              f(l.volume.rendimento, "%"),
              f(l.rendimentoMin, "%"),
              f(l.rendimentoMax, "%"),
              f(l.volume.custoMedioPolpa, "R$/kg"),
            ],
          }))}
          total={[
            "Total",
            f(t.volume.quantidade, "nº"),
            f(t.volume.frutoKg, "kg"),
            f(t.volume.polpaKg, "kg"),
            f(t.volume.rendimento, "%"),
            f(t.rendimentoMin, "%"),
            f(t.rendimentoMax, "%"),
            f(t.volume.custoMedioPolpa, "R$/kg"),
          ]}
        />
      </Alvo>

      <Alvo nome="tab.balanco" className="p-1">
        <TabelaRelatorio
          titulo="Balanço de massa (OPs encerradas)"
          vazio={semEncerradas}
          colunas={[
            { rotulo: "Fruta" },
            n("OPs"),
            n("Fruto", "kg"),
            n("Água", "kg"),
            n("Polpa", "kg"),
            n("Caroço/resíduo", "kg"),
            n("Perda", "kg"),
            n("Diferença", "kg"),
            n("Diferença", "%"),
            n("A verificar", "OPs"),
          ]}
          linhas={comEncerradas.map((l) => ({
            chave: l.frutaId,
            celulas: [
              l.balanco.opsVerificar > 0 ? (
                <Alvo key="verificar" nome="tab.acerola" className="inline-block px-1">
                  {l.fruta}
                </Alvo>
              ) : (
                l.fruta
              ),
              f(l.encerradas, "nº"),
              f(l.balanco.frutoKg, "kg"),
              f(l.balanco.aguaKg, "kg"),
              f(l.balanco.polpaKg, "kg"),
              f(l.balanco.carocoResiduoKg, "kg"),
              f(l.balanco.perdaKg, "kg"),
              f(l.balanco.diferencaKg, "kg"),
              f(l.balanco.percentual, "%"),
              f(l.balanco.opsVerificar, "nº"),
            ],
          }))}
          total={[
            "Total",
            f(t.encerradas, "nº"),
            f(t.balanco.frutoKg, "kg"),
            f(t.balanco.aguaKg, "kg"),
            f(t.balanco.polpaKg, "kg"),
            f(t.balanco.carocoResiduoKg, "kg"),
            f(t.balanco.perdaKg, "kg"),
            f(t.balanco.diferencaKg, "kg"),
            f(t.balanco.percentual, "%"),
            f(t.balanco.opsVerificar, "nº"),
          ]}
        />
      </Alvo>

      <Alvo nome="tab.custo" className="p-1">
        <TabelaRelatorio
          titulo="Custo por fruta (OPs encerradas)"
          vazio={semEncerradas}
          colunas={[
            { rotulo: "Fruta" },
            n("Fruto", "R$"),
            n("Insumos", "R$"),
            n("Total", "R$"),
            n("Polpa", "kg"),
            n("Custo médio", "R$/kg"),
          ]}
          linhas={comEncerradas.map((l) => ({
            chave: l.frutaId,
            celulas: [
              l.fruta,
              f(l.custo.custoFruto, "R$"),
              f(l.custo.custoInsumos, "R$"),
              f(l.custo.custoTotal, "R$"),
              f(l.custo.polpaKg, "kg"),
              f(l.custo.custoKg, "R$/kg"),
            ],
          }))}
          total={[
            "Total",
            f(t.custo.custoFruto, "R$"),
            f(t.custo.custoInsumos, "R$"),
            f(t.custo.custoTotal, "R$"),
            f(t.custo.polpaKg, "kg"),
            f(t.custo.custoKg, "R$/kg"),
          ]}
        />
      </Alvo>
    </div>
  );
}
