import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverOrcamento } from "@/server/auth/permissions";
import { listarComparativoOrcamento } from "@/server/services/orcamento";
import { LinhaOrcamentoForm } from "./linha-orcamento-form";
import { SeletorAnoMes } from "../_shared/seletor-ano-mes";

function anoValido(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : new Date().getUTCFullYear();
}

function mesValido(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 && numero <= 12 ? numero : new Date().getUTCMonth() + 1;
}

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string | string[]; mes?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "orcamento:ler");

  const params = await searchParams;
  const anoParam = Array.isArray(params.ano) ? params.ano[0] : params.ano;
  const mesParam = Array.isArray(params.mes) ? params.mes[0] : params.mes;
  const ano = anoValido(anoParam);
  const mes = mesValido(mesParam);

  const linhas = await listarComparativoOrcamento(sessao, ano);
  const somenteLeitura = !podeEscreverOrcamento(sessao.perfil, sessao.podeAlterarFilial);

  const categoriasUnicas = Array.from(new Set(linhas.map((l) => l.categoriaFinanceiraId))).map((id) => {
    const primeira = linhas.find((l) => l.categoriaFinanceiraId === id)!;
    const valoresPorMes = Array.from({ length: 12 }, (_, indice) => {
      const linhaDoMes = linhas.find((l) => l.categoriaFinanceiraId === id && l.mes === indice + 1);
      return linhaDoMes?.orcado ?? 0;
    });
    return { id, nome: primeira.categoriaNome, valoresPorMes };
  });

  const linhasDoMes = linhas.filter((l) => l.mes === mes);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Orçamento</h1>
        <p className="text-sm text-muted-foreground">
          Orçamento por categoria financeira e mês. Comparativo usa o
          realizado (movimentações conciliadas) e o projetado (títulos
          em aberto) já existentes no sistema.
        </p>
      </div>

      <SeletorAnoMes ano={ano} mes={mes} />

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Valores orçados — {ano}</h2>
        {categoriasUnicas.map((categoria) => (
          <LinhaOrcamentoForm
            key={categoria.id}
            categoriaFinanceiraId={categoria.id}
            categoriaNome={categoria.nome}
            ano={ano}
            valoresPorMes={categoria.valoresPorMes}
            somenteLeitura={somenteLeitura}
          />
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Comparativo — mês selecionado</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead>Orçado</TableHead>
              <TableHead>Realizado</TableHead>
              <TableHead>Projetado</TableHead>
              <TableHead>Variação</TableHead>
              <TableHead>Variação %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhasDoMes.map((linha) => (
              <TableRow key={linha.categoriaFinanceiraId} className={linha.alerta ? "bg-destructive/10" : undefined}>
                <TableCell className="font-medium">{linha.categoriaNome}</TableCell>
                <TableCell>{linha.orcado.toFixed(2)}</TableCell>
                <TableCell>{linha.realizado.toFixed(2)}</TableCell>
                <TableCell>{linha.projetado.toFixed(2)}</TableCell>
                <TableCell className={linha.alerta ? "font-medium text-destructive" : undefined}>
                  <div className="flex items-center gap-2">
                    {linha.variacaoAbsolutaRealizado.toFixed(2)}
                    {linha.alerta && <Badge variant="destructive">Estouro</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {linha.variacaoPercentualRealizado === null
                    ? "—"
                    : `${(linha.variacaoPercentualRealizado * 100).toFixed(1)}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
