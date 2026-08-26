import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarEmpresas } from "@/server/services/empresa";
import { EmpresaDialogForm } from "./empresa-dialog-form";
import { alternarAtivoEmpresaAction } from "./actions";

export default async function EmpresasPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "empresa:gerenciar");

  const empresas = await listarEmpresas();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Empresas</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de empresas do grupo. Cada empresa é um contexto isolado de dados.
          </p>
        </div>
        <EmpresaDialogForm />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome fantasia</TableHead>
            <TableHead>Razão social</TableHead>
            <TableHead>CNPJ</TableHead>
            <TableHead>Moeda</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {empresas.map((empresa) => (
            <TableRow key={empresa.id}>
              <TableCell className="font-medium">{empresa.nomeFantasia}</TableCell>
              <TableCell>{empresa.razaoSocial}</TableCell>
              <TableCell>{empresa.cnpj}</TableCell>
              <TableCell>{empresa.moedaPadrao}</TableCell>
              <TableCell>
                <Badge variant={empresa.ativo ? "default" : "secondary"}>
                  {empresa.ativo ? "Ativa" : "Inativa"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <EmpresaDialogForm empresa={empresa} />
                <form action={alternarAtivoEmpresaAction}>
                  <input type="hidden" name="id" value={empresa.id} />
                  <input type="hidden" name="ativo" value={(!empresa.ativo).toString()} />
                  <Button type="submit" variant="outline" size="sm">
                    {empresa.ativo ? "Inativar" : "Reativar"}
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
