// Espelhado na ajuda (src/ajuda/tesouraria/cenas.tsx): mudou rótulo, coluna ou botão? Ajuste a ajuda junto.

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverLancamento } from "@/server/auth/permissions";
import { listarResumoContas, listarLancamentosDaPagina } from "@/server/services/lancamentoBancario";
import { listarCategoriasFinanceiras } from "@/server/services/categoriaFinanceira";
import { listarCentrosCusto } from "@/server/services/centroCusto";
import { listarCentrosLucro } from "@/server/services/centroLucro";
import { listarSafras } from "@/server/services/safra";
import { listarProjetos } from "@/server/services/projeto";
import { LancamentoDialogForm } from "./lancamento-dialog-form";
import { TransferenciaDialogForm } from "./transferencia-dialog-form";
import { SaldoBancarioDialogForm } from "./saldo-bancario-dialog-form";
import { classificacaoDaUrl } from "@/lib/classificacaoFiscal";
import { SeletorClassificacao } from "../../_shared/seletor-classificacao";
import { BadgeClassificacao } from "../../_shared/badge-classificacao";
import { ExportarLinks } from "../../_shared/exportar-links";
import { formatarData, formatarMoeda } from "@/lib/formatacao";
import { nomeDaContaBancaria } from "@/lib/contaBancaria";
import { BotaoAjuda } from "@/components/ajuda/botao-ajuda";
import { foraDaBase, montarEditaveis, type ExtrasDoLancamento, type OpcoesDoLancamento } from "@/lib/lancamentoEditavel";
import { Paginacao } from "@/components/paginacao";
import { AcoesDoLancamento } from "./acoes-do-lancamento";
import { OpcoesDoLancamentoProvider } from "./opcoes-do-lancamento";

const ORIGEM_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  BAIXA: "Baixa",
  TRANSFERENCIA: "Transferência",
};

export default async function TesourariaPage({
  searchParams,
}: {
  searchParams: Promise<{ classificacao?: string | string[]; pagina?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "lancamento:ler");
  const podeEscrever = podeEscreverLancamento(sessao.perfil, sessao.podeAlterarFilial);
  const params = await searchParams;
  const classificacao = classificacaoDaUrl(
    Array.isArray(params.classificacao) ? params.classificacao[0] : params.classificacao,
  );
  const paginaPedida = Number(Array.isArray(params.pagina) ? params.pagina[0] : params.pagina) || 1;

  const [resumoContas, paginaDaLista, categorias, centrosCusto, centrosLucro, safras, projetos] = await Promise.all([
    listarResumoContas(sessao.filialId),
    listarLancamentosDaPagina(sessao.filialId, { classificacao }, paginaPedida),
    listarCategoriasFinanceiras(sessao.filialId),
    listarCentrosCusto(sessao.filialId),
    listarCentrosLucro(sessao.filialId),
    listarSafras(sessao.filialId),
    listarProjetos(sessao.filialId),
  ]);
  const { lancamentos, outrosLados, pagina, totalPaginas } = paginaDaLista;

  const opcao = (item: { id: string; nome: string }) => ({ id: item.id, nome: item.nome });
  const ativos = <T extends { id: string; nome: string; ativo: boolean }>(lista: readonly T[]) =>
    lista.filter((item) => item.ativo).map(opcao);

  /** Listas ativas do diálogo, uma vez para a página toda (o "Novo lançamento" usa as mesmas). */
  const opcoesDaPagina: OpcoesDoLancamento = {
    contasBancarias: resumoContas.map(({ conta }) => ({ id: conta.id, nome: nomeDaContaBancaria(conta) })),
    categorias: ativos(categorias),
    centrosCusto: ativos(centrosCusto),
    centrosLucro: ativos(centrosLucro),
    safras: ativos(safras),
    projetos: ativos(projetos),
  };

  // O lado de uma transferência que ficou em outra página só completa o par; não entra na tabela.
  const editaveis = podeEscrever ? montarEditaveis([...lancamentos, ...outrosLados]) : {};
  const porId = (lista: readonly { id: string; nome: string }[], id: string | null) => {
    const item = id ? lista.find((i) => i.id === id) : undefined;
    return item ? opcao(item) : null;
  };

  /** Só o que a linha acrescenta às listas da página: os cadastros inativos que ela já usa. */
  function extrasDe(lancamento: (typeof lancamentos)[number]): ExtrasDoLancamento {
    const editavel = editaveis[lancamento.id];
    const contas =
      editavel?.tipo === "transferencia"
        ? [
            { id: editavel.contaOrigemId, nome: editavel.contaOrigemNome },
            { id: editavel.contaDestinoId, nome: editavel.contaDestinoNome },
          ]
        : [{ id: lancamento.contaBancariaId, nome: nomeDaContaBancaria(lancamento.contaBancaria) }];
    const extras: ExtrasDoLancamento = {
      contasBancarias: foraDaBase(opcoesDaPagina.contasBancarias, contas),
      categorias: foraDaBase(opcoesDaPagina.categorias, [porId(categorias, lancamento.categoriaFinanceiraId)]),
      centrosCusto: foraDaBase(opcoesDaPagina.centrosCusto, [porId(centrosCusto, lancamento.centroCustoId)]),
      centrosLucro: foraDaBase(opcoesDaPagina.centrosLucro, [porId(centrosLucro, lancamento.centroLucroId)]),
      safras: foraDaBase(opcoesDaPagina.safras, [porId(safras, lancamento.safraId)]),
      projetos: foraDaBase(opcoesDaPagina.projetos, [porId(projetos, lancamento.projetoId)]),
    };
    // Manda só as listas com algo: a linha comum não leva nada além do próprio lançamento.
    return Object.fromEntries(Object.entries(extras).filter(([, lista]) => lista.length > 0));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-lg font-semibold">Tesouraria</h1>
            <BotaoAjuda tela="tesouraria" />
          </div>
          <p className="text-sm text-muted-foreground">
            Lançamentos bancários e saldo das contas da filial ativa.
          </p>
        </div>
        {podeEscrever && (
          <div className="flex flex-wrap gap-2">
            <LancamentoDialogForm {...opcoesDaPagina} />
            <TransferenciaDialogForm contasBancarias={opcoesDaPagina.contasBancarias} />
            <SaldoBancarioDialogForm contasBancarias={opcoesDaPagina.contasBancarias} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {resumoContas.map(({ conta, saldoContabil, ultimoSaldoInformado, saldoContabilNaData }) => {
          const diferenca =
            ultimoSaldoInformado && saldoContabilNaData !== null
              ? saldoContabilNaData - Number(ultimoSaldoInformado.saldo)
              : null;
          return (
            <Card key={conta.id}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  {nomeDaContaBancaria(conta)}
                  {conta.ativo ? null : <span className="text-muted-foreground"> (inativa)</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  Saldo contábil: <span className="font-medium">{formatarMoeda(saldoContabil)}</span>
                </p>
                {ultimoSaldoInformado ? (
                  <>
                    <p className="text-muted-foreground">
                      Saldo bancário informado: {formatarMoeda(ultimoSaldoInformado.saldo)} em{" "}
                      {formatarData(ultimoSaldoInformado.data)}
                    </p>
                    <p className="text-muted-foreground">
                      Saldo contábil em {formatarData(ultimoSaldoInformado.data)}:{" "}
                      {saldoContabilNaData === null ? "—" : formatarMoeda(saldoContabilNaData)}
                    </p>
                    <p className={diferenca !== 0 ? "text-destructive" : "text-muted-foreground"}>
                      Diferença em {formatarData(ultimoSaldoInformado.data)}:{" "}
                      {diferenca === null ? "—" : formatarMoeda(diferenca)}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Nenhum saldo bancário informado ainda.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Lançamentos</h2>
        <div className="flex flex-wrap items-center gap-4">
          <ExportarLinks
            baseHref="/financeiro/tesouraria/export"
            queryString={classificacao ? `classificacao=${classificacao}` : undefined}
          />
          <SeletorClassificacao classificacao={classificacao} />
        </div>
      </div>

      <OpcoesDoLancamentoProvider opcoes={opcoesDaPagina}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Classificação</TableHead>
              <TableHead>Descrição</TableHead>
              {podeEscrever ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lancamentos.map((lancamento) => (
              <TableRow key={lancamento.id}>
                <TableCell>{formatarData(lancamento.data)}</TableCell>
                <TableCell>
                  {nomeDaContaBancaria(lancamento.contaBancaria)}
                </TableCell>
                <TableCell>
                  <Badge variant={lancamento.tipo === "ENTRADA" ? "default" : "secondary"}>
                    {lancamento.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                  </Badge>
                </TableCell>
                <TableCell>{formatarMoeda(lancamento.valor)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{ORIGEM_LABEL[lancamento.origem]}</Badge>
                  {lancamento.grupoConciliacaoId ? (
                    <Badge variant="secondary" className="ml-1">
                      Conciliado
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>
                  <BadgeClassificacao classificacao={lancamento.classificacaoFiscal} />
                  {lancamento.numeroComprovante ? (
                    <span className="ml-2 text-xs text-muted-foreground">{lancamento.numeroComprovante}</span>
                  ) : null}
                </TableCell>
                <TableCell>{lancamento.descricao}</TableCell>
                {podeEscrever ? (
                  <TableCell>
                    {editaveis[lancamento.id] ? (
                      <AcoesDoLancamento editavel={editaveis[lancamento.id]} extras={extrasDe(lancamento)} />
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </OpcoesDoLancamentoProvider>

      {totalPaginas > 1 ? <Paginacao pagina={pagina} totalPaginas={totalPaginas} /> : null}
    </div>
  );
}
