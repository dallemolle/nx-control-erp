import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarFiliais } from "@/server/services/filial";
import { FilialDialogForm } from "./filial-dialog-form";
import { alternarAtivoFilialAction } from "./actions";

export default async function FiliaisPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "filial:gerenciar");

  const filiais = await listarFiliais(sessao.empresaId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Filiais</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de filiais da empresa ativa. Cada filial é um contexto operacional dentro da empresa.
          </p>
        </div>
        <FilialDialogForm />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>CNPJ</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filiais.map((filial) => (
            <TableRow key={filial.id}>
              <TableCell className="font-medium">{filial.nome}</TableCell>
              <TableCell>{filial.cnpj}</TableCell>
              <TableCell>
                <Badge variant={filial.ativo ? "default" : "secondary"}>
                  {filial.ativo ? "Ativa" : "Inativa"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <FilialDialogForm filial={filial} />
                <form action={alternarAtivoFilialAction}>
                  <input type="hidden" name="id" value={filial.id} />
                  <input type="hidden" name="ativo" value={(!filial.ativo).toString()} />
                  <Button type="submit" variant="outline" size="sm">
                    {filial.ativo ? "Inativar" : "Reativar"}
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
