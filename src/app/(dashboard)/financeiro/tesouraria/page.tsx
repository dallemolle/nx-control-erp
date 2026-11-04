import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverLancamento } from "@/server/auth/permissions";
import { listarResumoContas, listarLancamentos } from "@/server/services/lancamentoBancario";
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
import { formatarData, formatarMoeda } from "@/lib/formatacao";

const ORIGEM_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  BAIXA: "Baixa",
  TRANSFERENCIA: "Transferência",
};

export default async function TesourariaPage({
  searchParams,
}: {
  searchParams: Promise<{ classificacao?: string | string[] }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "lancamento:ler");
  const podeEscrever = podeEscreverLancamento(sessao.perfil, sessao.podeAlterarFilial);
  const params = await searchParams;
  const classificacao = classificacaoDaUrl(
    Array.isArray(params.classificacao) ? params.classificacao[0] : params.classificacao,
  );

  const [resumoContas, lancamentos, categorias, centrosCusto, centrosLucro, safras, projetos] = await Promise.all([
    listarResumoContas(sessao.filialId),
    listarLancamentos(sessao.filialId, { classificacao }),
    listarCategoriasFinanceiras(sessao.filialId),
    listarCentrosCusto(sessao.filialId),
    listarCentrosLucro(sessao.filialId),
    listarSafras(sessao.filialId),
    listarProjetos(sessao.filialId),
  ]);

  const opcoesContasBancarias = resumoContas.map(({ conta }) => ({
    id: conta.id,
    nome: `${conta.banco.nome} - Ag ${conta.agencia}/CC ${conta.conta}`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Tesouraria</h1>
          <p className="text-sm text-muted-foreground">
            Lançamentos bancários e saldo das contas da filial ativa.
          </p>
        </div>
        {podeEscrever && (
          <div className="flex gap-2">
            <LancamentoDialogForm
              contasBancarias={opcoesContasBancarias}
              categorias={categorias}
              centrosCusto={centrosCusto.filter((c) => c.ativo)}
              centrosLucro={centrosLucro.filter((c) => c.ativo)}
              safras={safras.filter((s) => s.ativo)}
              projetos={projetos.filter((p) => p.ativo)}
            />
            <TransferenciaDialogForm contasBancarias={opcoesContasBancarias} />
            <SaldoBancarioDialogForm contasBancarias={opcoesContasBancarias} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {resumoContas.map(({ conta, saldoContabil, ultimoSaldoInformado }) => {
          const diferenca = ultimoSaldoInformado ? saldoContabil - Number(ultimoSaldoInformado.saldo) : null;
          return (
            <Card key={conta.id}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  {conta.banco.nome} - Ag {conta.agencia}/CC {conta.conta}
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
                    <p className={diferenca !== 0 ? "text-destructive" : "text-muted-foreground"}>
                      Diferença: {diferenca === null ? "—" : formatarMoeda(diferenca)}
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

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium">Lançamentos</h2>
        <SeletorClassificacao classificacao={classificacao} />
      </div>

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
          </TableRow>
        </TableHeader>
        <TableBody>
          {lancamentos.map((lancamento) => (
            <TableRow key={lancamento.id}>
              <TableCell>{formatarData(lancamento.data)}</TableCell>
              <TableCell>
                {lancamento.contaBancaria.banco.nome} - Ag {lancamento.contaBancaria.agencia}/CC{" "}
                {lancamento.contaBancaria.conta}
              </TableCell>
              <TableCell>
                <Badge variant={lancamento.tipo === "ENTRADA" ? "default" : "secondary"}>
                  {lancamento.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                </Badge>
              </TableCell>
              <TableCell>{formatarMoeda(lancamento.valor)}</TableCell>
              <TableCell>
                <Badge variant="outline">{ORIGEM_LABEL[lancamento.origem]}</Badge>
              </TableCell>
              <TableCell>
                <BadgeClassificacao classificacao={lancamento.classificacaoFiscal} />
                {lancamento.numeroComprovante ? (
                  <span className="ml-2 text-xs text-muted-foreground">{lancamento.numeroComprovante}</span>
                ) : null}
              </TableCell>
              <TableCell>{lancamento.descricao}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
