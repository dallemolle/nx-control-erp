import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarClientes } from "@/server/services/cliente";
import { ClienteDialogForm } from "./cliente-dialog-form";
import { alternarAtivoClienteAction } from "./actions";

export default async function ClientesPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");

  const clientes = await listarClientes(sessao.empresaId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cadastro de clientes da empresa.</p>
        </div>
        <ClienteDialogForm />
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
          {clientes.map((cliente) => (
            <TableRow key={cliente.id}>
              <TableCell className="font-medium">{cliente.nome}</TableCell>
              <TableCell>{cliente.cnpjCpf}</TableCell>
              <TableCell>{cliente.email || cliente.telefone || "—"}</TableCell>
              <TableCell>
                <Badge variant={cliente.ativo ? "default" : "secondary"}>
                  {cliente.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <ClienteDialogForm cliente={cliente} />
                <form action={alternarAtivoClienteAction}>
                  <input type="hidden" name="id" value={cliente.id} />
                  <input type="hidden" name="ativo" value={(!cliente.ativo).toString()} />
                  <Button type="submit" variant="outline" size="sm">
                    {cliente.ativo ? "Inativar" : "Reativar"}
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
