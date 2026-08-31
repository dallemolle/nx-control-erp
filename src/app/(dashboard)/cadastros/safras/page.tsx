import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarSafras } from "@/server/services/safra";
import { SafraDialogForm } from "./safra-dialog-form";
import { alternarAtivoSafraAction } from "./actions";

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10).split("-").reverse().join("/");
}

export default async function SafrasPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");

  const safras = await listarSafras(sessao.filialId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Safras</h1>
          <p className="text-sm text-muted-foreground">Cadastro de safras da filial.</p>
        </div>
        <SafraDialogForm />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Início</TableHead>
            <TableHead>Fim</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ativo</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {safras.map((safra) => (
            <TableRow key={safra.id}>
              <TableCell className="font-medium">{safra.nome}</TableCell>
              <TableCell>{formatarData(safra.dataInicio)}</TableCell>
              <TableCell>{formatarData(safra.dataFim)}</TableCell>
              <TableCell>{safra.status}</TableCell>
              <TableCell>
                <Badge variant={safra.ativo ? "default" : "secondary"}>
                  {safra.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <SafraDialogForm safra={safra} />
                <form action={alternarAtivoSafraAction}>
                  <input type="hidden" name="id" value={safra.id} />
                  <input type="hidden" name="ativo" value={(!safra.ativo).toString()} />
                  <Button type="submit" variant="outline" size="sm">
                    {safra.ativo ? "Inativar" : "Reativar"}
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
