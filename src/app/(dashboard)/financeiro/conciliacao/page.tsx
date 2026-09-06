// src/app/(dashboard)/financeiro/conciliacao/page.tsx
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission, podeEscreverConciliacao } from "@/server/auth/permissions";
import { listarLinhasExtrato } from "@/server/services/conciliacao";
import { listarContasBancarias } from "@/server/services/contaBancaria";
import { listarCategoriasFinanceiras } from "@/server/services/categoriaFinanceira";
import { STATUS_LINHA_EXTRATO } from "@/lib/schemas/enums";
import type { StatusLinhaExtrato } from "@prisma/client";
import { STATUS_LABEL } from "./status-label";
import { FiltroStatus } from "./filtro-status";
import { ImportarExtratoDialogForm } from "./importar-extrato-dialog-form";
import { ReconciliarPendentesButton } from "./reconciliar-pendentes-button";
import { LinhaExtratoActions } from "./linha-extrato-actions";

function statusValido(valor: string | undefined): StatusLinhaExtrato | undefined {
  return STATUS_LINHA_EXTRATO.includes(valor as (typeof STATUS_LINHA_EXTRATO)[number])
    ? (valor as StatusLinhaExtrato)
    : undefined;
}

export default async function ConciliacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "conciliacao:ler");
  const podeEscrever = podeEscreverConciliacao(sessao.perfil, sessao.podeAlterarFilial);

  const { status } = await searchParams;
  const statusFiltro = statusValido(status);

  const [linhas, contasBancarias, categorias] = await Promise.all([
    listarLinhasExtrato(sessao.filialId, undefined, statusFiltro),
    listarContasBancarias(sessao.filialId),
    listarCategoriasFinanceiras(sessao.filialId),
  ]);

  const opcoesContasBancarias = contasBancarias.map((conta) => ({
    id: conta.id,
    nome: `${conta.banco.nome} - Ag ${conta.agencia}/CC ${conta.conta}`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Conciliação bancária</h1>
          <p className="text-sm text-muted-foreground">
            Importe o extrato (OFX) e concilie com os lançamentos já registrados.
          </p>
        </div>
        {podeEscrever && (
          <div className="flex items-start gap-2">
            <ReconciliarPendentesButton />
            <ImportarExtratoDialogForm contasBancarias={opcoesContasBancarias} />
          </div>
        )}
      </div>

      <FiltroStatus />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Histórico</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((linha) => (
            <TableRow key={linha.id}>
              <TableCell>{new Date(linha.data).toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>
                {linha.contaBancaria.banco.nome} - Ag {linha.contaBancaria.agencia}/CC {linha.contaBancaria.conta}
              </TableCell>
              <TableCell>{linha.historico}</TableCell>
              <TableCell>{Number(linha.valor).toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant={linha.status === "CONCILIADO" ? "default" : "secondary"}>
                  {STATUS_LABEL[linha.status] ?? linha.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <LinhaExtratoActions
                  linhaExtratoId={linha.id}
                  status={linha.status}
                  lancamentoVinculadoDescricao={linha.lancamentoBancario?.descricao ?? null}
                  podeEscrever={podeEscrever}
                  categorias={categorias}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
