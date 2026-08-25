import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFornecedores } from "@/server/services/fornecedor";
import { FornecedorDialogForm } from "./fornecedor-dialog-form";
import { alternarAtivoFornecedorAction } from "./actions";

export default async function FornecedoresPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");

  const fornecedores = await listarFornecedores(sessao.empresaId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">Cadastro de fornecedores da empresa.</p>
        </div>
        <FornecedorDialogForm />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>CNPJ/CPF</TableHead>
            <TableHead>Contato</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fornecedores.map((fornecedor) => (
            <TableRow key={fornecedor.id}>
              <TableCell className="font-medium">{fornecedor.nome}</TableCell>
              <TableCell>{fornecedor.cnpjCpf}</TableCell>
              <TableCell>{fornecedor.email || fornecedor.telefone || "—"}</TableCell>
              <TableCell>
                <Badge variant={fornecedor.ativo ? "default" : "secondary"}>
                  {fornecedor.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <FornecedorDialogForm fornecedor={fornecedor} />
                <form action={alternarAtivoFornecedorAction}>
                  <input type="hidden" name="id" value={fornecedor.id} />
                  <input type="hidden" name="ativo" value={(!fornecedor.ativo).toString()} />
                  <Button type="submit" variant="outline" size="sm">
                    {fornecedor.ativo ? "Inativar" : "Reativar"}
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
