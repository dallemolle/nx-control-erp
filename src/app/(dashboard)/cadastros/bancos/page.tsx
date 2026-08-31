import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSessaoAtiva } from "@/server/auth/sessao";
import { requirePermission } from "@/server/auth/permissions";
import { listarBancos } from "@/server/services/banco";
import { BancoDialogForm } from "./banco-dialog-form";

export default async function BancosPage() {
  const sessao = await requireSessaoAtiva();
  requirePermission(sessao.perfil, "cadastro:ler");

  const bancos = await listarBancos();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Bancos</h1>
          <p className="text-sm text-muted-foreground">Cadastro global de bancos.</p>
        </div>
        <BancoDialogForm />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bancos.map((banco) => (
            <TableRow key={banco.id}>
              <TableCell>{banco.codigo}</TableCell>
              <TableCell className="font-medium">{banco.nome}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <BancoDialogForm banco={banco} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
