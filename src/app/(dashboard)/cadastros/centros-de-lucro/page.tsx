import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarCentrosLucro } from "@/server/services/centroLucro";
import { CentroLucroDialogForm } from "./centro-lucro-dialog-form";
import { alternarAtivoCentroLucroAction } from "./actions";

export default async function CentrosDeLucroPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");

  const centros = await listarCentrosLucro(sessao.filialId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Centros de lucro</h1>
          <p className="text-sm text-muted-foreground">Cadastro de centros de lucro da filial.</p>
        </div>
        <CentroLucroDialogForm />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {centros.map((centro) => (
            <TableRow key={centro.id}>
              <TableCell>{centro.codigo}</TableCell>
              <TableCell className="font-medium">{centro.nome}</TableCell>
              <TableCell>
                <Badge variant={centro.ativo ? "default" : "secondary"}>
                  {centro.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <CentroLucroDialogForm centro={centro} />
                <form action={alternarAtivoCentroLucroAction}>
                  <input type="hidden" name="id" value={centro.id} />
                  <input type="hidden" name="ativo" value={(!centro.ativo).toString()} />
                  <Button type="submit" variant="outline" size="sm">
                    {centro.ativo ? "Inativar" : "Reativar"}
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
