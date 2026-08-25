import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarCentrosCusto } from "@/server/services/centroCusto";
import { CentroCustoDialogForm } from "./centro-custo-dialog-form";
import { alternarAtivoCentroCustoAction } from "./actions";

export default async function CentrosDeCustoPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");

  const centros = await listarCentrosCusto(sessao.empresaId);
  const nomePorId = new Map(centros.map((centro) => [centro.id, centro]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Centros de custo</h1>
          <p className="text-sm text-muted-foreground">
            Estrutura hierárquica: Empresa → Unidade → Departamento → Centro de custo.
          </p>
        </div>
        <CentroCustoDialogForm opcoesPai={centros} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Pai</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {centros.map((centro) => (
            <TableRow key={centro.id}>
              <TableCell>{centro.codigo}</TableCell>
              <TableCell className="font-medium">{centro.nome}</TableCell>
              <TableCell className="text-muted-foreground">
                {centro.parentId ? nomePorId.get(centro.parentId)?.nome : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={centro.ativo ? "default" : "secondary"}>
                  {centro.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <CentroCustoDialogForm centro={centro} opcoesPai={centros} />
                <form action={alternarAtivoCentroCustoAction}>
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
