// Espelhado na ajuda (src/ajuda/orcamento/cenas.tsx): mudou rótulo, coluna ou texto? Ajuste a ajuda junto.
import { Badge } from "@/components/ui/badge";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverOrcamento } from "@/server/auth/permissions";
import { comparativoEmArvore, listarComparativoOrcamento } from "@/server/services/orcamento";
import { montarArvore } from "@/lib/arvoreDeLinhas";
import { LinhasRecolhiveis } from "../_shared/linhas-recolhiveis";
import { CabecalhoDaGrade, LinhaOrcamentoForm } from "./linha-orcamento-form";
import { SeletorAnoMes } from "../_shared/seletor-ano-mes";
import { SeletorClassificacao } from "../../_shared/seletor-classificacao";
import { ExportarLinks } from "../../_shared/exportar-links";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { formatarMoeda, formatarPercentual } from "@/lib/formatacao";

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
  searchParams: Promise<{ ano?: string | string[]; mes?: string | string[]; classificacao?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "orcamento:ler");

  const params = await searchParams;
  const anoParam = Array.isArray(params.ano) ? params.ano[0] : params.ano;
  const mesParam = Array.isArray(params.mes) ? params.mes[0] : params.mes;
  const ano = anoValido(anoParam);
  const mes = mesValido(mesParam);
  const classificacao = classificacaoDaUrl(
    Array.isArray(params.classificacao) ? params.classificacao[0] : params.classificacao,
  );

  const linhas = await listarComparativoOrcamento(sessao, ano, { classificacao });
  const somenteLeitura = !podeEscreverOrcamento(sessao.perfil, sessao.podeAlterarFilial);

  const categoriasUnicas = Array.from(new Set(linhas.map((l) => l.categoriaFinanceiraId))).map((id) => {
    const primeira = linhas.find((l) => l.categoriaFinanceiraId === id)!;
    const valoresPorMes = Array.from({ length: 12 }, (_, indice) => {
      const linhaDoMes = linhas.find((l) => l.categoriaFinanceiraId === id && l.mes === indice + 1);
      return linhaDoMes?.orcado ?? 0;
    });
    return {
      id,
      nome: primeira.categoriaNome,
      tipo: primeira.tipoCategoria,
      parentId: primeira.parentId,
      valoresPorMes,
    };
  });
  // Despesas primeiro (é onde mora o estouro); dentro de cada bloco, a árvore de categorias (filhas recuadas sob
  // a mãe). O campo da mãe é o orçamento próprio dela; o total do grupo fica no comparativo.
  const emArvore = (tipo: "DESPESA" | "RECEITA") =>
    montarArvore(
      categoriasUnicas.filter((c) => c.tipo === tipo).map((c) => ({ ...c, grupo: c.tipo })),
      () => ({}),
    ).map((item) => ({ ...item.origem, nivel: item.nivel }));
  const blocosDaGrade = [
    { titulo: "Despesas", categorias: emArvore("DESPESA") },
    { titulo: "Receitas", categorias: emArvore("RECEITA") },
  ].filter((bloco) => bloco.categorias.length > 0);

  const itensDoMes = comparativoEmArvore(linhas.filter((l) => l.mes === mes));

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold">Orçamento</h1>
          <BotaoAjuda tela="orcamento" />
        </div>
        <p className="text-sm text-muted-foreground">
          Orçamento por categoria financeira e mês. Comparativo usa o
          realizado (movimentações conciliadas) e o projetado (títulos
          em aberto) já existentes no sistema.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SeletorAnoMes ano={ano} mes={mes} />
        <SeletorClassificacao classificacao={classificacao} />
        <ExportarLinks
          baseHref="/controladoria/orcamento/export"
          queryString={`ano=${ano}${classificacao ? `&classificacao=${classificacao}` : ""}`}
        />
      </div>
      {classificacao ? (
        <p className="text-sm text-muted-foreground" role="note">
          Realizado e projetado mostram só o movimento {classificacao === "FISCAL" ? "fiscal" : "gerencial"}; o
          orçado é um só e não é dividido por classificação.
        </p>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Valores orçados — {ano}</h2>
        {/* 12 campos por linha não cabem no celular: a grade rola sozinha, a página não. */}
        <div className="overflow-x-auto">
          <div className="w-max min-w-full">
            {blocosDaGrade.map((bloco) => (
              <div key={bloco.titulo}>
                <CabecalhoDaGrade titulo={bloco.titulo} />
                {bloco.categorias.map((categoria) => (
                  <LinhaOrcamentoForm
                    key={categoria.id}
                    categoriaFinanceiraId={categoria.id}
                    categoriaNome={categoria.nome}
                    ano={ano}
                    valoresPorMes={categoria.valoresPorMes}
                    somenteLeitura={somenteLeitura}
                    nivel={categoria.nivel}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
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
              <TableHead>Previsto</TableHead>
              <TableHead>Variação</TableHead>
              <TableHead>Variação %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <LinhasRecolhiveis
              linhas={itensDoMes.map((linha) => ({
                chave: linha.chave,
                paiChave: linha.paiChave,
                nivel: linha.nivel,
                temFilhos: linha.temFilhos,
                direto: linha.direto,
                nome: linha.categoriaNome,
                className: linha.alerta ? "bg-destructive/10" : undefined,
                celulas: (
                  <>
                    <TableCell>{formatarMoeda(linha.orcado)}</TableCell>
                    <TableCell>{formatarMoeda(linha.realizado)}</TableCell>
                    <TableCell>{formatarMoeda(linha.projetado)}</TableCell>
                    <TableCell className="font-medium">{formatarMoeda(linha.previsto)}</TableCell>
                    <TableCell className={linha.alerta ? "font-medium text-destructive" : undefined}>
                      <div className="flex items-center gap-2">
                        {formatarMoeda(linha.variacaoAbsoluta)}
                        {linha.alerta && <Badge variant="destructive">Estouro</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {linha.variacaoPercentual === null ? "—" : formatarPercentual(linha.variacaoPercentual)}
                    </TableCell>
                  </>
                ),
              }))}
            />
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
