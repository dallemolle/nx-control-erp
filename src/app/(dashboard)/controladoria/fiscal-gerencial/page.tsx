import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import {
  listarPendenciasFiscais,
  obterComparativoMensal,
  obterEmAbertoPorClassificacao,
  obterTopContrapartesGerenciais,
} from "@/server/services/relatorioFiscalGerencial";
import { ROTULOS_PENDENCIA_FISCAL, type PendenciaFiscal } from "@/lib/classificacaoFiscal";
import { ExportarLinks } from "../../_shared/exportar-links";
import { ComparativoChart } from "./comparativo-chart";

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const PENDENCIAS = Object.keys(ROTULOS_PENDENCIA_FISCAL) as PendenciaFiscal[];

function anoValido(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : new Date().getUTCFullYear();
}

function pendenciaValida(valor: string | undefined): PendenciaFiscal | undefined {
  return PENDENCIAS.includes(valor as PendenciaFiscal) ? (valor as PendenciaFiscal) : undefined;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarPercentual(valor: number | null): string {
  return valor === null ? "—" : `${valor.toFixed(1)}%`;
}

export default async function FiscalGerencialPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string | string[]; pendencia?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "titulo:ler");
  requirePermission(sessao.perfil, "lancamento:ler");

  const params = await searchParams;
  const ano = anoValido(Array.isArray(params.ano) ? params.ano[0] : params.ano);
  const pendencia = pendenciaValida(Array.isArray(params.pendencia) ? params.pendencia[0] : params.pendencia);

  const [comparativo, emAberto, topGerenciais, pendencias] = await Promise.all([
    obterComparativoMensal(sessao, ano),
    obterEmAbertoPorClassificacao(sessao),
    obterTopContrapartesGerenciais(sessao, new Date(Date.UTC(ano, 0, 1)), new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999))),
    listarPendenciasFiscais(sessao, { pendencia }),
  ]);

  const totais = comparativo.reduce(
    (soma, linha) => ({
      entradasFiscal: soma.entradasFiscal + linha.entradasFiscal,
      entradasGerencial: soma.entradasGerencial + linha.entradasGerencial,
      saidasFiscal: soma.saidasFiscal + linha.saidasFiscal,
      saidasGerencial: soma.saidasGerencial + linha.saidasGerencial,
    }),
    { entradasFiscal: 0, entradasGerencial: 0, saidasFiscal: 0, saidasGerencial: 0 },
  );

  const hrefCom = (mudancas: { ano?: number; pendencia?: PendenciaFiscal | null }) => {
    const query = new URLSearchParams({ ano: String(mudancas.ano ?? ano) });
    const novaPendencia = mudancas.pendencia === undefined ? pendencia : mudancas.pendencia;
    if (novaPendencia) query.set("pendencia", novaPendencia);
    return `/controladoria/fiscal-gerencial?${query.toString()}`;
  };

  const cardsEmAberto = [
    { rotulo: "A receber — fiscal", valor: emAberto.receberFiscal },
    { rotulo: "A receber — gerencial", valor: emAberto.receberGerencial },
    { rotulo: "A pagar — fiscal", valor: emAberto.pagarFiscal },
    { rotulo: "A pagar — gerencial", valor: emAberto.pagarGerencial },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Fiscal × gerencial</h1>
        <p className="text-sm text-muted-foreground">
          Quanto do movimento da filial ativa tem documento fiscal e quanto é negociado sem nota. Realizado usa
          movimentações conciliadas (transferências entre contas ficam de fora); em aberto usa os títulos ainda não
          liquidados.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={hrefCom({ ano: ano - 1 })} />}>
          Ano anterior
        </Button>
        <span className="text-sm font-medium">{ano}</span>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={hrefCom({ ano: ano + 1 })} />}>
          Próximo ano
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Realizado por mês — {ano}</h2>
          <ExportarLinks baseHref="/controladoria/fiscal-gerencial/export" queryString={`ano=${ano}`} />
        </div>
        <ComparativoChart
          dados={comparativo.map((linha) => ({
            mes: MESES_CURTOS[linha.mes - 1],
            entradasFiscal: linha.entradasFiscal,
            entradasGerencial: linha.entradasGerencial,
            saidasFiscal: linha.saidasFiscal,
            saidasGerencial: linha.saidasGerencial,
          }))}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead className="text-right">Entradas fiscais</TableHead>
              <TableHead className="text-right">Entradas gerenciais</TableHead>
              <TableHead className="text-right">% gerencial</TableHead>
              <TableHead className="text-right">Saídas fiscais</TableHead>
              <TableHead className="text-right">Saídas gerenciais</TableHead>
              <TableHead className="text-right">% gerencial</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparativo.map((linha) => (
              <TableRow key={linha.mes}>
                <TableCell>{MESES_CURTOS[linha.mes - 1]}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(linha.entradasFiscal)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(linha.entradasGerencial)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarPercentual(linha.percentualGerencialEntradas)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(linha.saidasFiscal)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(linha.saidasGerencial)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarPercentual(linha.percentualGerencialSaidas)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-medium">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatarMoeda(totais.entradasFiscal)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatarMoeda(totais.entradasGerencial)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatarPercentual(
                  totais.entradasFiscal + totais.entradasGerencial === 0
                    ? null
                    : (totais.entradasGerencial / (totais.entradasFiscal + totais.entradasGerencial)) * 100,
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatarMoeda(totais.saidasFiscal)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatarMoeda(totais.saidasGerencial)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatarPercentual(
                  totais.saidasFiscal + totais.saidasGerencial === 0
                    ? null
                    : (totais.saidasGerencial / (totais.saidasFiscal + totais.saidasGerencial)) * 100,
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Em aberto hoje</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {cardsEmAberto.map((card) => (
            <Card key={card.rotulo}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.rotulo}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(card.valor)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Maiores parceiros sem nota — {ano}</h2>
        {topGerenciais.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum título gerencial emitido em {ano}.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parceiro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Títulos</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topGerenciais.map((parceiro) => (
                <TableRow key={parceiro.contraparteId}>
                  <TableCell>{parceiro.nome}</TableCell>
                  <TableCell>{parceiro.tipo === "FORNECEDOR" ? "Fornecedor" : "Cliente"}</TableCell>
                  <TableCell className="text-right tabular-nums">{parceiro.quantidadeTitulos}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(parceiro.valorTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Pendências fiscais ({pendencias.length})</h2>
          <ExportarLinks
            baseHref="/controladoria/fiscal-gerencial/export"
            queryString={`relatorio=pendencias${pendencia ? `&pendencia=${pendencia}` : ""}`}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Títulos fiscais ainda sem tipo de documento, número da nota, chave de acesso ou anexo. Não bloqueiam nada —
          servem para completar o cadastro quando a nota chegar. Títulos lançados antes deste recurso aparecem aqui até
          serem revisados.
        </p>
        <nav className="flex flex-wrap gap-2" aria-label="Filtrar pendências">
          <Button
            size="sm"
            variant={pendencia ? "outline" : "default"}
            nativeButton={false}
            render={<Link href={hrefCom({ pendencia: null })} />}
            aria-current={pendencia ? undefined : "page"}
          >
            Todas
          </Button>
          {PENDENCIAS.map((opcao) => (
            <Button
              key={opcao}
              size="sm"
              variant={pendencia === opcao ? "default" : "outline"}
              nativeButton={false}
              render={<Link href={hrefCom({ pendencia: opcao })} />}
              aria-current={pendencia === opcao ? "page" : undefined}
            >
              {ROTULOS_PENDENCIA_FISCAL[opcao]}
            </Button>
          ))}
        </nav>
        {pendencias.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma pendência fiscal{pendencia ? " deste tipo" : ""}.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Parceiro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Pendências</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendencias.map((titulo) => {
                const rota = titulo.tipo === "PAGAR" ? "/financeiro/contas-a-pagar" : "/financeiro/contas-a-receber";
                const href = titulo.contraparteId ? `${rota}?classificacao=FISCAL&contraparte=${titulo.contraparteId}` : rota;
                return (
                  <TableRow key={titulo.tituloId}>
                    <TableCell>
                      <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
                        {titulo.documento}
                      </Link>
                    </TableCell>
                    <TableCell>{titulo.contraparte}</TableCell>
                    <TableCell>{titulo.tipo === "PAGAR" ? "A pagar" : "A receber"}</TableCell>
                    {/* Datas são gravadas à meia-noite UTC; sem o fuso fixo, no Brasil apareceria o dia anterior. */}
                    <TableCell>{new Date(titulo.dataEmissao).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(titulo.valor)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {titulo.pendencias.map((item) => (
                          <Badge key={item} variant="outline">
                            {ROTULOS_PENDENCIA_FISCAL[item]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
