import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverLancamento } from "@/server/auth/permissions";
import { listarResumoContas, listarLancamentos } from "@/server/services/lancamentoBancario";
import { listarCategoriasFinanceiras } from "@/server/services/categoriaFinanceira";
import { LancamentoDialogForm } from "./lancamento-dialog-form";
import { TransferenciaDialogForm } from "./transferencia-dialog-form";
import { SaldoBancarioDialogForm } from "./saldo-bancario-dialog-form";

const ORIGEM_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  BAIXA: "Baixa",
  TRANSFERENCIA: "Transferência",
};

export default async function TesourariaPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "lancamento:ler");
  const podeEscrever = podeEscreverLancamento(sessao.perfil, sessao.podeAlterarFilial);

  const [resumoContas, lancamentos, categorias] = await Promise.all([
    listarResumoContas(sessao.filialId),
    listarLancamentos(sessao.filialId),
    listarCategoriasFinanceiras(sessao.filialId),
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
            <LancamentoDialogForm contasBancarias={opcoesContasBancarias} categorias={categorias} />
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
                  Saldo contábil: <span className="font-medium">{saldoContabil.toFixed(2)}</span>
                </p>
                {ultimoSaldoInformado ? (
                  <>
                    <p className="text-muted-foreground">
                      Saldo bancário informado: {Number(ultimoSaldoInformado.saldo).toFixed(2)} em{" "}
                      {new Date(ultimoSaldoInformado.data).toLocaleDateString("pt-BR")}
                    </p>
                    <p className={diferenca !== 0 ? "text-destructive" : "text-muted-foreground"}>
                      Diferença: {diferenca?.toFixed(2)}
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead>Descrição</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lancamentos.map((lancamento) => (
            <TableRow key={lancamento.id}>
              <TableCell>{new Date(lancamento.data).toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>
                {lancamento.contaBancaria.banco.nome} - Ag {lancamento.contaBancaria.agencia}/CC{" "}
                {lancamento.contaBancaria.conta}
              </TableCell>
              <TableCell>
                <Badge variant={lancamento.tipo === "ENTRADA" ? "default" : "secondary"}>
                  {lancamento.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                </Badge>
              </TableCell>
              <TableCell>{Number(lancamento.valor).toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant="outline">{ORIGEM_LABEL[lancamento.origem]}</Badge>
              </TableCell>
              <TableCell>{lancamento.descricao}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
