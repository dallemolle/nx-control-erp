import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarBancos } from "@/server/services/banco";
import { listarContasBancarias } from "@/server/services/contaBancaria";
import { ContaBancariaDialogForm } from "./conta-bancaria-dialog-form";
import { alternarAtivoContaBancariaAction } from "./actions";

export default async function ContasBancariasPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");

  const [bancos, contas] = await Promise.all([
    listarBancos(),
    listarContasBancarias(sessao.filialId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contas bancárias</h1>
          <p className="text-sm text-muted-foreground">Cadastro de contas bancárias da filial.</p>
        </div>
        <ContaBancariaDialogForm bancos={bancos} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Banco</TableHead>
            <TableHead>Agência</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Moeda</TableHead>
            <TableHead className="text-right">Saldo inicial</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contas.map((conta) => (
            <TableRow key={conta.id}>
              <TableCell className="font-medium">
                {conta.banco.codigo} · {conta.banco.nome}
              </TableCell>
              <TableCell>{conta.agencia}</TableCell>
              <TableCell>{conta.conta}</TableCell>
              <TableCell>{conta.tipo}</TableCell>
              <TableCell>{conta.moeda}</TableCell>
              <TableCell className="text-right">{conta.saldoInicial.toString()}</TableCell>
              <TableCell>
                <Badge variant={conta.ativo ? "default" : "secondary"}>
                  {conta.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <ContaBancariaDialogForm
                  conta={{ ...conta, saldoInicial: Number(conta.saldoInicial) }}
                  bancos={bancos}
                />
                <form action={alternarAtivoContaBancariaAction}>
                  <input type="hidden" name="id" value={conta.id} />
                  <input type="hidden" name="ativo" value={(!conta.ativo).toString()} />
                  <Button type="submit" variant="outline" size="sm">
                    {conta.ativo ? "Inativar" : "Reativar"}
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
